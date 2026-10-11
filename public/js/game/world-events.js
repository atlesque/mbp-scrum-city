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
import { eventModel, fallingRock, disposeEvent, beamBetween } from '../world/event-models.js';
import { damageBuildings, updateBuildings } from '../world/event-destruction.js';
import { exitVehicle, hurtPlayer } from './player.js';
import { strapOnChute } from './parachute.js';

export const EVENTS = {
  ufo: { name: 'ALIEN ABDUCTION', warning: 8, duration: 27, hint: 'Dodge the green beam! If caught, use your parachute after the drop.' },
  godzilla: { name: 'GODZILLA', warning: 10, duration: 48, hint: 'Clear the streets! Blue dorsal plates mean atomic breath is charging.' },
  tsunami: { name: 'TSUNAMI', warning: 12, duration: 36, hint: 'A wave is approaching from the ocean! Get above 14 metres.' },
  volcano: { name: 'VOLCANIC ERUPTION', warning: 10, duration: 44, hint: 'A volcano is rising! Keep away from the crater and red impact circles.' },
  meteors: { name: 'METEOR SHOWER', warning: 8, duration: 36, hint: 'Watch the red impact circles and keep moving!' },
  tornado: { name: 'TORNADO', warning: 10, duration: 40, hint: 'Stay clear of the funnel! It tears up cars and throws you into the air.' },
};
export const worldEvents = { active: null, wait: 90, previous: null };
const outdoors = () => G.state === 'play' && P.alive && !P.club && !G.stairs;
const road = x => ROADS.reduce((a, b) => Math.abs(x - b) < Math.abs(x - a) ? b : a);
const rand = (a, b) => a + Math.random() * (b - a);
const sheltered = () => tallBoxes.some(b => P.x > b.x0 && P.x < b.x1 && P.z > b.z0 && P.z < b.z1 && b.h > P.y + 2);
export function startWorldEvent(id) {
  if (!EVENTS[id] || worldEvents.active || !outdoors()) return false;
  const model = eventModel(id), e = { id, ...model, t: -EVENTS[id].warning, pulse: 0, spawn: 0, rocks: [], captured: false, released: false, x: road(P.x), z: clamp(P.z - 65, -175, 80), yaw: 0 };
  if (id === 'ufo') { e.x = P.x; e.z = P.z; e.g.position.set(e.x, 30, e.z); }
  if (id === 'volcano') {
    // The beach leaves enough room for a crater without sealing any doors or stairwells.
    e.x = 232; e.z = clamp(P.z, -160, 160); e.g.position.set(e.x, -22, e.z);
  }
  if (id === 'tsunami') e.g.position.set(285, 0, 0);
  if (id === 'godzilla' || id === 'tornado') e.g.position.set(e.x, 0, e.z);
  e.kind = 'worldevent'; e.blipLayer = 5;
  e.blip = radar => radar.dot(e.g.position.x, e.id === 'tsunami' ? P.z : e.z, '#ff805c', 12, true, 'dia');
  e.dispose = () => disposeEvent(e.g);
  if (id === 'ufo' || id === 'godzilla') {
    e.hp = id === 'ufo' ? 600 : 12000;
    e.raycast = (o, d, maxT) => {
      const p = e.g.position, ufo = id === 'ufo';
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, p.x - 9, p.y + (ufo ? -2 : 0), p.z - 6, p.x + 9, p.y + (ufo ? 4 : 42), p.z + 12);
      return t < maxT ? { t } : null;
    };
    const damage = d => {
      if (worldEvents.active !== e) return;
      e.hp -= d;
      if (e.hp <= 0) { stopWorldEvent(); toast(id === 'ufo' ? 'UFO driven away! The tractor beam is broken.' : 'Godzilla retreats into the ocean!', 5); }
    };
    e.onShot = (hit, d) => { damage(d); return { head: false }; };
    e.onRocket = damage;
    e.blast = (x, y, z, r, d, byPlayer) => {
      if (!byPlayer) return;
      const distance = Math.hypot(x - e.x, z - e.z, Math.max(0, Math.abs(y - (id === 'ufo' ? e.g.position.y : 20)) - (id === 'ufo' ? 3 : 20)));
      if (distance < r) damage(d * (1 - distance / r));
    };
  }
  scene.add(e.g); addEntity(e); worldEvents.active = e;
  Sound.disasterCue('warning');
  if (id === 'godzilla') Sound.disasterCue('roar', { x: e.x, y: 30, z: e.z });
  showBig(EVENTS[id].name, '#8ce8ff'); toast(`<b>${EVENTS[id].name}</b> — ${EVENTS[id].hint}`, EVENTS[id].warning);
  return true;
}
function release(e) {
  if (P.abducted !== e) return;
  P.abducted = null; P.vy = 0; P.grounded = false; P.jumps = 2; P.spaceHeld = false;
  e.released = true;
  if (P.alive && G.state === 'play') toast(`They dropped you! Press <b>${kb('jump')}</b> to open your parachute!`, 7);
}
export function stopWorldEvent() {
  const e = worldEvents.active;
  if (!e) return;
  release(e); removeEntity(e); Sound.loops('disaster', []);
  worldEvents.previous = e.id; worldEvents.active = null; worldEvents.wait = rand(120, 240);
}
on('player:died', stopWorldEvent);
export function updateWorldEvents(dt) {
  if (!P.alive || G.state === 'dead') { stopWorldEvent(); return; }
  if (!outdoors()) { Sound.loops('disaster', []); return; }
  updateBuildings(dt);
  if (!worldEvents.active) {
    worldEvents.wait -= dt;
    if (worldEvents.wait <= 0) {
      const ids = Object.keys(EVENTS).filter(id => id !== worldEvents.previous);
      startWorldEvent(ids[Math.floor(Math.random() * ids.length)]);
    }
    return;
  }
  const e = worldEvents.active; e.t += dt;
  Sound.loops('disaster', [{ key: e, id: e.id, x: e.g.position.x, y: e.id === 'ufo' ? e.g.position.y : 3,
    z: e.id === 'tsunami' ? P.z : e.g.position.z, vol: e.t < 0 ? .3 : .8,
    charge: e.id === 'godzilla' && e.t % 12 >= 5 && e.t % 12 < 11 ? Math.min(1, (e.t % 12 - 5) / 3) : 0 }]);
  if (e.t > EVENTS[e.id].duration) { stopWorldEvent(); toast('The danger has passed. The city is recovering.', 4); return; }
  if (e.id === 'ufo') updateUfo(e, dt);
  if (e.id === 'volcano') e.g.position.y = -22 + clamp((e.t + 10) / 14, 0, 1) * 22;
  if (e.t < 0) return;
  e.pulse -= dt; e.spawn -= dt;
  if (e.id === 'godzilla') updateGodzilla(e, dt);
  else if (e.id === 'tsunami') updateWave(e, dt);
  else if (e.id === 'tornado') updateTornado(e, dt);
  else if (e.id === 'volcano' || e.id === 'meteors') updateRocks(e, dt);
}
function blast(e, x, y, z, radius, damage, collapse = false) {
  explosion(x, y, z, radius, damage, false, 1.4);
  // A fatal blast can synchronously stop the event through player:died.
  if (collapse && worldEvents.active === e) damageBuildings(x, z, radius);
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
      for (let i = 1; i <= 7 && worldEvents.active === e; i++) {
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
      if (worldEvents.active !== e) return;
    }
  }
  if (lava && e.pulse <= 0) {
    e.pulse = 1;
    if (Math.floor(e.t) % 4 === 0) Sound.disasterCue('eruption', { x: e.x, y: 10, z: e.z });
    particles(e.x, 23, e.z, 10, '#ff6b19', 8, 1.2, .7, 1, 1);
    blast(e, e.x, 1, e.z, 23, 40);
  }
}
