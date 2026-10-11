import { EVENTS, INTENSITY } from '../data/world-events.js';
import { Sound } from '../core/audio.js';
import { G, P, cam } from '../core/state.js';
import { on } from '../core/events.js';
import { kb } from '../core/controls.js';
import { clamp } from '../core/util.js';
import { all, addEntity, removeEntity } from '../entities/registry.js';
import { explosion } from '../combat/combat.js';
import { scene } from '../render/scene.js';
import { emit as particles } from '../render/effects.js';
import { showBig, toast } from '../ui/hud.js';
import { isFree, ROADS, tallBoxes, rayBox } from '../world/collision.js';
import { props, breakProp } from '../world/props.js';
import { eventModel, fallingRock, disposeEvent, beamBetween, eventStrike, cashBundle } from '../world/event-models.js';
import { damageBuildings, updateBuildings } from '../world/event-destruction.js';
import { exitVehicle, hurtPlayer } from './player.js';
import { reward } from './pickups.js';
import { strapOnChute } from './parachute.js';

export { EVENTS, INTENSITY } from '../data/world-events.js';
export const worldEvents = { active: new Map(), timers: Object.fromEntries(Object.entries(EVENTS).map(([id, def]) => {
  const [min, max] = INTENSITY[def.intensity].initial; return [id, min + Math.random() * (max - min)];
})) };
const outdoors = () => G.state === 'play' && P.alive && !P.club && !G.stairs;
const road = x => ROADS.reduce((a, b) => Math.abs(x - b) < Math.abs(x - a) ? b : a);
const rand = (a, b) => a + Math.random() * (b - a);
const sheltered = () => tallBoxes.some(b => P.x > b.x0 && P.x < b.x1 && P.z > b.z0 && P.z < b.z1 && b.h > P.y + 2);
export function startWorldEvent(id) {
  if (!EVENTS[id] || worldEvents.active.has(id) || !outdoors()) return false;
  const model = eventModel(id), e = { id, ...model, t: -EVENTS[id].warning, pulse: 0, spawn: 0, rocks: [], captured: false, released: false, x: road(P.x), z: clamp(P.z - 65, -175, 80), yaw: 0 };
  if (id === 'ufo') { e.x = P.x; e.z = P.z; e.g.position.set(e.x, 30, e.z); }
  if (id === 'volcano') {
    // The beach leaves enough room for a crater without sealing any doors or stairwells.
    e.x = 232; e.z = clamp(P.z, -160, 160); e.g.position.set(e.x, -22, e.z);
  }
  if (id === 'tsunami') e.g.position.set(285, 0, 0);
  if (id === 'godzilla' || id === 'tornado') e.g.position.set(e.x, 0, e.z);
  if (['cashrain', 'fireworks', 'steam', 'thunderstorm', 'earthquake', 'invasion', 'orbital'].includes(id)) {
    e.z = clamp(road(P.z), -150, 150); e.g.position.set(e.x, 0, e.z);
  }
  if (id === 'cashrain') setupCash(e);
  if (id === 'thunderstorm') e.strikes = [];
  e.kind = 'worldevent'; e.blipLayer = 5;
  e.blip = radar => radar.dot(e.g.position.x, e.id === 'tsunami' ? P.z : e.z, INTENSITY[EVENTS[id].intensity].color, 12, true, 'dia');
  e.dispose = () => disposeEvent(e.g);
  if (id === 'ufo' || id === 'godzilla' || id === 'invasion') {
    e.hp = id === 'ufo' ? 600 : id === 'invasion' ? 3500 : 12000;
    e.raycast = (o, d, maxT) => {
      const p = e.g.position, ufo = id === 'ufo', invasion = id === 'invasion', w = invasion ? 25 : 9;
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, p.x - w, p.y + (invasion ? 62 : ufo ? -2 : 0), p.z - w, p.x + w, p.y + (invasion ? 78 : ufo ? 4 : 42), p.z + w);
      return t < maxT ? { t } : null;
    };
    const damage = d => {
      if (worldEvents.active.get(e.id) !== e) return;
      e.hp -= d;
      if (e.hp <= 0) { stopWorldEvent(e.id); toast(id === 'ufo' ? 'UFO driven away! The tractor beam is broken.' : id === 'invasion' ? 'Mothership driven away! The invasion is over.' : 'Godzilla driven away!', 5); }
    };
    e.onShot = (hit, d) => { damage(d); return { head: false }; };
    e.onRocket = damage;
    e.blast = (x, y, z, r, d, byPlayer) => {
      if (!byPlayer) return;
      const distance = Math.hypot(x - e.x, z - e.z, Math.max(0, Math.abs(y - (id === 'ufo' ? e.g.position.y : id === 'invasion' ? 70 : 20)) - (id === 'ufo' ? 3 : id === 'invasion' ? 8 : 20)));
      if (distance < r) damage(d * (1 - distance / r));
    };
  }
  scene.add(e.g); addEntity(e); worldEvents.active.set(id, e);
  Sound.disasterCue('warning');
  if (id === 'godzilla') Sound.disasterCue('roar', { x: e.x, y: 30, z: e.z });
  showBig(`${INTENSITY[EVENTS[id].intensity].label} · ${EVENTS[id].name}`, INTENSITY[EVENTS[id].intensity].color); toast(`<b>${INTENSITY[EVENTS[id].intensity].label} · ${EVENTS[id].name}</b> — ${EVENTS[id].hint}`, EVENTS[id].warning);
  return true;
}
function release(e) {
  if (P.abducted !== e) return;
  P.abducted = null; P.vy = 0; P.grounded = false; P.jumps = 2; P.spaceHeld = false;
  e.released = true;
  if (P.alive && G.state === 'play') toast(`They dropped you! Press <b>${kb('jump')}</b> to open your parachute!`, 7);
}
// No id means cancel every event (death/debug); an id cancels only its own incident.
export function stopWorldEvent(id) {
  const events = id === undefined ? [...worldEvents.active.values()] : [worldEvents.active.get(id)].filter(Boolean);
  for (const e of events) {
    release(e); removeEntity(e); worldEvents.active.delete(e.id);
    worldEvents.timers[e.id] = rand(...INTENSITY[EVENTS[e.id].intensity].cooldown);
  }
  eventAudio();
}
on('player:died', () => stopWorldEvent());
function eventAudio() {
  Sound.loops('disaster', outdoors() ? [...worldEvents.active.values()].map(e => ({
    key: e, id: e.id, x: e.g.position.x, y: e.id === 'ufo' ? e.g.position.y : 3,
    z: e.id === 'tsunami' ? P.z : e.g.position.z, vol: e.t < 0 ? .3 : .8,
    charge: e.id === 'godzilla' && e.t % 12 >= 5 && e.t % 12 < 11 ? Math.min(1, (e.t % 12 - 5) / 3) : 0,
  })) : []);
}
export function updateWorldEvents(dt) {
  if (!P.alive || G.state === 'dead') { stopWorldEvent(); return; }
  if (!outdoors()) { eventAudio(); return; }
  updateBuildings(dt);
  // Newly started events receive their whole warning; each inactive clock advances independently.
  const running = [...worldEvents.active.values()];
  for (const id of Object.keys(EVENTS)) if (!worldEvents.active.has(id)) {
    worldEvents.timers[id] -= dt;
    if (worldEvents.timers[id] <= 0) startWorldEvent(id);
  }
  for (const e of running) {
    if (worldEvents.active.get(e.id) !== e) continue;
    updateEvent(e, dt);
  }
  eventAudio();
}
function updateEvent(e, dt) {
  e.t += dt;
  if (e.t > EVENTS[e.id].duration) {
    stopWorldEvent(e.id); toast(`${EVENTS[e.id].name} has ended.`, 4); return;
  }
  if (e.id === 'ufo') updateUfo(e, dt);
  if (e.id === 'volcano') e.g.position.y = -22 + clamp((e.t + 10) / 14, 0, 1) * 22;
  if (e.t < 0) return;
  e.pulse -= dt; e.spawn -= dt;
  if (e.id === 'godzilla') updateGodzilla(e, dt);
  else if (e.id === 'tsunami') updateWave(e, dt);
  else if (e.id === 'tornado') updateTornado(e, dt);
  else if (e.id === 'volcano' || e.id === 'meteors') updateRocks(e, dt);
  else if (e.id === 'cashrain') updateCash(e);
  else if (e.id === 'fireworks') updateFireworks(e);
  else if (e.id === 'steam') updateSteam(e);
  else if (e.id === 'thunderstorm') updateStorm(e, dt);
  else if (e.id === 'earthquake') updateQuake(e);
  else if (e.id === 'invasion') updateInvasion(e, dt);
  else if (e.id === 'orbital') updateOrbital(e);
}

function blast(e, x, y, z, radius, damage, collapse = false) {
  explosion(x, y, z, radius, damage, false, 1.4);
  // A fatal blast can synchronously stop the event through player:died.
  if (collapse && worldEvents.active.get(e.id) === e) damageBuildings(x, z, radius);
}
function updateUfo(e, dt) {
  if (!e.captured) {
    // Deliberately slower than sprinting: you can run out of the beam.
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz), k = Math.min(1, dt * 3 / Math.max(d, .01));
    if (e.t < 9) { e.x += dx * k; e.z += dz * k; }
    e.g.position.set(e.x, 30 + Math.sin(e.t) * 1.5, e.z);
    if (e.t >= 0 && e.t < 9 && d < 4.5 && P.y < 4 && !sheltered() && !P.tumble) {
      if (P.vehicle) { P.vehicle.v = 0; P.vehicle.slip = 0; P.vx = P.vz = 0; exitVehicle(false); }
      // Do not lift through walls after stepping out of a car.
      if (!isFree(P.x, P.z, .5)) return;
      e.x = P.x; e.z = P.z; e.captured = true; e.captureT = e.t; e.baseY = P.y;
      P.abducted = e; P.grounded = false; P.vx = P.vz = P.vy = 0; P.roof = null; P.floor = 0;
      Sound.disasterCue('abduct', { x: e.x, y: 20, z: e.z });
      strapOnChute(true);
      toast('Tractor beam locked! The aliens left you a parachute…', 5);
    }
  } else if (P.abducted === e) {
    const u = clamp((e.t - e.captureT) / 7, 0, 1);
    P.x = e.x; P.z = e.z; P.y = e.baseY + u * (95 - e.baseY); P.jumpY = P.y;
    e.g.position.set(e.x, P.y + 18, e.z);
    if (e.t - e.captureT >= 8) release(e);
  } else e.g.position.y += dt * 16;
  e.beam.visible = !e.released && e.t < 18;
  const height = e.g.position.y;
  e.beam.position.y = -height / 2; e.beam.scale.y = height;
  e.g.rotation.y += dt * .45;
}
export function breathSegment(x, z, yaw, u) {
  const angle = yaw + (u - .5) * .9;
  return { from: new THREE.Vector3(x + Math.sin(yaw) * 11, 34, z + Math.cos(yaw) * 11), to: new THREE.Vector3(x + Math.sin(angle) * 110, 2, z + Math.cos(angle) * 110) };
}
function updateGodzilla(e, dt) {
  const cycle = e.t % 12, charging = cycle >= 5 && cycle < 8, firing = cycle >= 8 && cycle < 11;
  e.plates.scale.setScalar(charging ? 1 + (cycle - 5) * .13 : 1);
  e.plates.visible = charging || firing || Math.floor(e.t * 3) % 2 === 0;
  if (!charging && !firing) e.z += dt * 4;
  e.g.position.set(e.x, Math.sin(e.t * 4) * .35, e.z);
  e.breath.visible = e.core.visible = firing;
  if (charging && !e.charging) { Sound.disasterCue('charge', { x: e.x, y: 30, z: e.z }); toast('GODZILLA IS CHARGING ATOMIC BREATH — get out of the blue beam’s path!', 3); }
  e.charging = charging;
  if (firing && !e.firing) Sound.disasterCue('beam', { x: e.x, y: 30, z: e.z });
  e.firing = firing;
  if (firing) {
    const segment = breathSegment(e.x, e.z, e.yaw, (cycle - 8) / 3);
    // The beam is positioned in world space; convert to the monster's local space.
    const a = segment.from.clone().sub(e.g.position), b = segment.to.clone().sub(e.g.position);
    beamBetween(e.breath, a, b); beamBetween(e.core, a, b);
    if (e.pulse <= 0) {
      e.pulse = .45;
      for (let i = 1; i <= 7 && worldEvents.active.get(e.id) === e; i++) {
        const q = segment.from.clone().lerp(segment.to, i / 7);
        blast(e, q.x, q.y, q.z, 7, 65, q.y < 18);
      }
    }
  } else if (!charging && e.pulse <= 0) {
    e.pulse = 1.25; blast(e, e.x, 2, e.z + 4, 18, 220, true);
    if (Math.hypot(P.x - e.x, P.z - e.z) < 85) cam.shake = Math.max(cam.shake, .5);
  }
}
function updateWave(e, dt) {
  e.g.position.x = 285 - e.t * 15;
  if (e.pulse > 0) return; e.pulse = .5;
  const x = e.g.position.x;
  for (const p of props) if (!p.broken && Math.abs(p.x - x) < 13) breakProp(p, -1, 0, 12);
  for (const a of all()) if (a.blast && Math.abs(a.x - x) < 13 && (a.y || 0) < 14) a.blast(a.x, 2, a.z, 12, 35, false);
  if (Math.abs(P.x - x) < 13 && P.y < 14) { hurtPlayer(20); if (P.vehicle) P.vehicle.v *= .5; else P.x = Math.max(-207, P.x - 3); cam.shake = Math.max(cam.shake, .45); }
}
function updateTornado(e, dt) {
  e.x = clamp(road(P.x) + Math.sin(e.t * .16) * 24, -185, 230); e.z += dt * 4;
  e.g.position.set(e.x, 0, e.z); e.g.rotation.y += dt * 4;
  e.rings.forEach((r, i) => { r.position.x = Math.sin(e.t * 3 + i * .4) * i * .18; });
  if (e.pulse <= 0) {
    e.pulse = .65; blast(e, e.x, 3, e.z, 13, 45, true);
    if (P.alive && !P.vehicle && Math.hypot(P.x - e.x, P.z - e.z) < 11 && P.y < 28) {
      P.grounded = false; P.vy = 22; P.jumps = 2;
    }
  }
}
function updateRocks(e, dt) {
  const lava = e.id === 'volcano';
  if (e.spawn <= 0 && e.t < EVENTS[e.id].duration - 5) {
    e.spawn = lava ? .9 : 1.3;
    if (!lava) Sound.disasterCue('meteor', { x: P.x, y: 50, z: P.z });
    let x, z;
    if (lava) { const a = rand(0, Math.PI * 2), r = rand(24, 85); x = e.x + Math.sin(a) * r; z = e.z + Math.cos(a) * r; }
    else { x = clamp(P.x + rand(-50, 50), -195, 240); z = clamp(P.z + rand(-50, 50), -195, 195); }
    // Impact markers land on roofs as well as streets.
    const y = tallBoxes.reduce((h, b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 ? Math.max(h, b.h + 1) : h, .2);
    const r = { ...fallingRock(e.g, lava), x, z, y, t: 0 };
    r.ring.position.set(x, y, z).sub(e.g.position);
    r.from = new THREE.Vector3(lava ? e.x : x - 25, 100, lava ? e.z : z - 15);
    r.rock.position.copy(r.from).sub(e.g.position);
    e.rocks.push(r);
  }
  for (const r of [...e.rocks]) {
    r.t += dt;
    const u = clamp(r.t / 3, 0, 1), q = new THREE.Vector3(r.x, r.y, r.z);
    r.rock.position.copy(r.from).lerp(q, u * u).sub(e.g.position);
    r.ring.position.copy(q).sub(e.g.position); r.rock.rotation.x += dt * 3;
    r.ring.material.opacity = .35 + .3 * Math.sin(r.t * 10) ** 2;
    if (r.t >= 3) {
      e.rocks.splice(e.rocks.indexOf(r), 1);
      // Release each projectile immediately, keeping memory bounded through long sessions.
      disposeEvent(r.rock); disposeEvent(r.ring);
      blast(e, r.x, r.y, r.z, lava ? 9 : 14, lava ? 100 : 180, true);
      if (worldEvents.active.get(e.id) !== e) return;
    }
  }
  if (lava && e.pulse <= 0) {
    e.pulse = 1;
    if (Math.floor(e.t) % 4 === 0) Sound.disasterCue('eruption', { x: e.x, y: 10, z: e.z });
    particles(e.x, 23, e.z, 10, '#ff6b19', 8, 1.2, .7, 1, 1);
    blast(e, e.x, 1, e.z, 23, 40);
  }
}

function setupCash(e) {
  e.bundles = [];
  for (let i = 0; i < 12; i++) {
    let x, z;
    for (let attempt = 0; attempt < 20; attempt++) {
      x = clamp(e.x + rand(-18, 18), -195, 240); z = clamp(e.z + rand(-18, 18), -195, 195);
      if (isFree(x, z, .8)) break;
    }
    if (!isFree(x, z, .8)) continue;
    const mesh = cashBundle(e.g), height = rand(15, 35);
    mesh.position.set(x - e.x, height, z - e.z);
    e.bundles.push({ mesh, x, z, height, collected: false });
  }
  const available = b => !P.abducted && !P.tumble && !b.collected && b.mesh.position.y <= 1.5 && Math.hypot(P.x - b.x, P.z - b.z) < 2 && P.y < 2;
  e.interaction = () => {
    if (!outdoors() || e.t < 0 || P.vehicle) return null;
    const b = e.bundles.find(available); if (!b) return null;
    return { keys: ['use'], priority: 2, dist: Math.hypot(P.x - b.x, P.z - b.z), prompt: `Press <kbd>${kb('use')}</kbd> to collect $25`, run() {
      if (worldEvents.active.get(e.id) !== e || !outdoors() || P.vehicle || !available(b)) return;
      b.collected = true; b.mesh.visible = false; reward(b.x, b.z, 25, 'Cash rain');
    } };
  };
}
function updateCash(e) {
  for (const b of e.bundles) {
    b.mesh.position.y = Math.max(.5, b.height - e.t * 5);
    b.mesh.rotation.y = e.t * 1.5;
  }
}
function updateFireworks(e) {
  if (e.pulse > 0) return;
  e.pulse = 2.5;
  const x = e.x + rand(-15, 15), z = e.z + rand(-15, 15), y = rand(25, 50);
  const color = ['#ff6cae', '#5af5ff', '#ffdb66', '#b99bff'][Math.floor(rand(0, 4))];
  particles(x, y, z, 36, color, 12, 1.8, .18, -4, 0);
  particles(x, y, z, 12, '#fff6df', 5, .6, .14, -2, 0);
  Sound.disasterCue('firework', { x, y, z });
}
function updateSteam(e) {
  const pulse = e.pulse <= 0;
  if (pulse) e.pulse = .6;
  for (let i = 0; i < e.vents.length; i++) {
    const v = e.vents[i], phase = (e.t + i * 1.1) % 6, active = phase >= 2 && phase < 3.5;
    v.jet.visible = active; v.ring.material.opacity = phase < 2 ? .4 + .4 * Math.sin(phase * 8) ** 2 : .2;
    if (active && !v.active) Sound.disasterCue('steam', { x: e.x + v.x, y: 1, z: e.z + v.z });
    v.active = active;
    if (!active || !pulse) continue;
    const x = e.x + v.x, z = e.z + v.z;
    for (const a of all('vehicle')) if (Math.hypot(a.x - x, a.z - z) < 3 && (a.y || 0) < 8 && !a.dead) a.damage(8, false);
    if (Math.hypot(P.x - x, P.z - z) < 3 && P.y < 8 && !P.vehicle) {
      hurtPlayer(5);
      if (worldEvents.active.get(e.id) !== e) return;
      P.grounded = false; P.vy = 12; P.jumps = 2;
    }
  }
}
function updateStorm(e, dt) {
  if (e.spawn <= 0 && e.t < EVENTS[e.id].duration - 4) {
    e.spawn = 3;
    const x = clamp(e.x + rand(-65, 65), -195, 240), z = clamp(e.z + rand(-65, 65), -195, 195);
    const y = tallBoxes.reduce((h, b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 ? Math.max(h, b.h + 1) : h, .2);
    e.strikes.push({ ...eventStrike(e.g, x - e.x, y, z - e.z, 8, '#b9ddff'), x, y, z, age: 0, hit: false });
  }
  for (const s of [...e.strikes]) {
    s.age += dt; s.ring.material.opacity = .3 + .5 * Math.sin(s.age * 7) ** 2;
    if (s.age >= 3 && !s.hit) {
      s.hit = true; s.beam.visible = true;
      Sound.disasterCue('thunder', { x: s.x, y: s.y, z: s.z });
      blast(e, s.x, s.y, s.z, 8, 80);
      if (worldEvents.active.get(e.id) !== e) return;
    }
    if (s.age >= 3.5) { e.strikes.splice(e.strikes.indexOf(s), 1); disposeEvent(s.g); }
  }
}
function updateQuake(e) {
  const distance = Math.hypot(P.x - e.x, P.z - e.z);
  if (distance < 110) cam.shake = Math.max(cam.shake, .9 * (1 - distance / 110));
  for (let i = 0; i < e.faults.length; i++) {
    const f = e.faults[i], u = ((e.t + i * .3) % 3) / 3;
    f.ring.scale.setScalar(.2 + u); f.ring.material.opacity = 1 - u;
  }
  if (e.pulse > 0) return; e.pulse = 3;
  Sound.disasterCue('quake', { x: e.x, y: 0, z: e.z });
  for (const f of e.faults) {
    blast(e, e.x + f.x, 1, e.z + f.z, 24, 75, true);
    if (worldEvents.active.get(e.id) !== e) return;
  }
}
function updateInvasion(e, dt) {
  for (let i = 0; i < e.craft.length; i++) {
    const c = e.craft[i], angle = i * Math.PI * 2 / 5 + e.t * .12;
    c.ship.position.set(Math.sin(angle) * 60, 45 + Math.sin(e.t + i) * 4, Math.cos(angle) * 60);
    c.ship.rotation.y += dt;
    const clock = e.t - i * .8;
    if (clock < 0) { c.ring.visible = c.beam.visible = false; continue; }
    const cycle = Math.floor(clock / 7), phase = clock % 7;
    if (c.cycle !== cycle) {
      c.cycle = cycle; c.hit = false;
      c.target = new THREE.Vector3(c.ship.position.x, .2, c.ship.position.z);
      c.g.position.copy(c.target);
    }
    c.ring.visible = phase < 4; c.ring.material.opacity = .35 + .4 * Math.sin(phase * 7) ** 2;
    c.beam.visible = phase >= 3 && phase < 4;
    if (c.beam.visible) {
      beamBetween(c.beam, c.ship.position.clone().sub(c.target), new THREE.Vector3());
      if (!c.hit) {
        c.hit = true; Sound.disasterCue('alienblast', { x: e.x + c.target.x, y: 2, z: e.z + c.target.z });
        blast(e, e.x + c.target.x, 1, e.z + c.target.z, 16, 150, true);
        if (worldEvents.active.get(e.id) !== e) return;
      }
    }
  }
}
function updateOrbital(e) {
  const phase = e.t % 10, cycle = Math.floor(e.t / 10);
  // Keep each enormous target fixed for the whole windup so it can be escaped on foot.
  if (e.orbitCycle !== cycle) {
    e.orbitCycle = cycle; e.orbitHit = false; e.orbitCharge = false;
    e.targetX = e.x + (cycle === 0 ? 0 : cycle === 1 ? 55 : -55); e.targetZ = e.z + (cycle === 2 ? 35 : 0);
  }
  e.ring.position.set(e.targetX - e.x, .25, e.targetZ - e.z);
  e.ring.material.opacity = .35 + .4 * Math.sin(e.t * 6) ** 2;
  e.beam.visible = e.core.visible = phase >= 7;
  if (phase >= 4 && !e.orbitCharge) {
    e.orbitCharge = true; Sound.disasterCue('orbitalcharge', { x: e.targetX, y: 50, z: e.targetZ });
    toast('ORBITAL CANNON CHARGING — clear the enormous red circle!', 3);
  }
  if (phase >= 7) {
    const a = new THREE.Vector3(0, 110, 0), b = new THREE.Vector3(e.targetX - e.x, 1, e.targetZ - e.z);
    beamBetween(e.beam, a, b); beamBetween(e.core, a, b);
    if (!e.orbitHit) {
      e.orbitHit = true; Sound.disasterCue('orbitalblast', { x: e.targetX, y: 1, z: e.targetZ });
      blast(e, e.targetX, 2, e.targetZ, 60, 450, true);
      if (Math.hypot(P.x - e.targetX, P.z - e.targetZ) < 150) cam.shake = Math.max(cam.shake, 1.2);
    }
  }
}
