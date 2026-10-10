import { muzzleOf } from '../characters/character.js';
import { explosion } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { kb } from '../core/controls.js';
import { on } from '../core/events.js';
import { at } from '../core/spatial.js';
import { G, P } from '../core/state.js';
import { angDiff, clamp, lerp, rnd } from '../core/util.js';
import { addEntity, all, removeEntity } from '../entities/registry.js';
import { enterVehicle } from '../game/player.js';
import { REPAIR } from '../data/weapons.js';
import { addHeat } from '../game/wanted.js';
import { BEHAVIOURS } from '../npcs/behaviours.js';
import { alarm, onFoot, spawnNpc } from '../npcs/npc.js';
import { emit, jet } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { ROADS, blocked, pushOutOBB, rayBox } from '../world/collision.js';
import { burntMat } from './materials.js';
import { nextDir } from './tank.js';
import { KINDS, TOUGH, blastDamage, spawnVehicle } from './vehicle.js';
import { BODY, PUMP, buildTruck } from './firetruck-mesh.js';
import { spinWheels } from './wheels.js';

// ================= FIRE TRUCK =================
// A crash fire (see CRASH_FIRE in vehicle.js) calls out the fire brigade: a fire engine sets off from a junction a
// block or two away, siren going, and drives the lanes to the fire. It pulls up short of it and two firemen climb down,
// run their hoses out to whatever is burning near the truck and hose it down; once nothing is burning they climb back
// aboard and the truck drives off. A fireman the player takes down drops his fire axe.
//   hw, hl     half width and half length (the hit box and what the traffic drives round)
//   top        top speed on a straight (m/s), `corner` round a junction; accel and brake in m/s²
//   turn       how fast it swings round onto a new road (rad/s)
//   stop       how far short of the fire it parks (from its middle to the burning vehicle's)
//   crew       firemen aboard; reach: they hose from up to this far off; sites: trucks out at once
export const TRUCK = { hw: BODY.hw, hl: BODY.hl, top: 16, corner: 5, accel: 5, brake: 9, turn: 1.8, stop: 10, crew: 2, hp: 700, reach: 7.5, sites: 2 };
// where it sets off from: a junction this far from the fire (preferably out of the player's sight and away from them)
export const START = { min: 60, max: 130, clearOfPlayer: 35 };
// it blows up a bit bigger than a car (r 9, dmg 240)
export const TRUCK_BLAST = { y: 1.2, r: 11, dmg: 280, power: 1.3 };
const STEP = ROADS[1] - ROADS[0];
const nearestRoad = v => ROADS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
// the lane on the right of a road heading (dx, dz), from the middle of the road (as laneFor in traffic.js)
const laneX = (dx, dz) => -3 * dz, laneZ = (dx, dz) => 3 * dx;

const _o = { x: 0, z: 0 };
function rayLocalBox(o, d, x, z, yaw, x0, y0, z0, x1, y1, z1) {
  const c = Math.cos(yaw), s = Math.sin(yaw), rx = o.x - x, rz = o.z - z;
  return rayBox(rx * c - rz * s, o.y, rx * s + rz * c, d.x * c - d.z * s, d.y, d.x * s + d.z * c, x0, y0, z0, x1, y1, z1);
}
// a point in the truck's space (x across, z along) out in the world (a shared object: copy what you keep)
function local(t, x, z) { const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw); _o.x = t.x + x * fz + z * fx; _o.z = t.z - x * fx + z * fz; return _o; }

const Truck = {
  kind: 'firetruck',
  blipLayer: 2,
  update(dt) {
    const t = this;
    if (t.dead) { t.deadT += dt; if (Math.random() < dt * 5) emit(t.x, 2.6, t.z, 1, '#3a3240', 1.5, 2.2, 0.8, 2, 1); return; }
    t.time += dt;
    if (t.state === 'respond') {
      // keep heading for the fire as it is shoved about; a fire that went out or went up on its own needs nobody
      const f = t.fire;
      if (f && !f.removed && !f.dead && f.burnT > 0) { t.sx = f.x; t.sz = f.z; }
      else if (!t.fireNear(t.sx, t.sz)) leave(t);
      else t.fire = t.fireNear(t.sx, t.sz);
    }
    if (t.state === 'work') {
      // the crew climb back aboard once nothing is burning (see board); with nobody left standing it drives off
      t.crew = t.crew.filter(n => n.alive && !n.removed);
      if (!t.crew.length) leave(t);
    }
    if (t.state !== 'work') drive(t, dt);
    hoses(t);
    pose(t, dt);
  },
  // the burning vehicle nearest (x, z) (the truck by default) within 40 m, or null
  fireNear(x = this.x, z = this.z, r = 40) {
    let best = null, bd = r;
    for (const v of all('vehicle')) {
      if (v.dead || !(v.burnT > 0)) continue;
      const d = Math.hypot(v.x - x, v.z - z); if (d < bd) { bd = d; best = v; }
    }
    return best;
  },
  // where fireman `side` (-1 or 1) gets on and off: by the pump panel on his side
  doorAt(side) { const p = local(this, side * (TRUCK.hw + 0.7), PUMP.z - 0.6); return { x: p.x, z: p.z }; },
  // where a fireman at (x, z) heads for next on his way to his door: round the nose or the tail when the truck is in the way
  wayToDoor(x, z, side) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = x - this.x, rz = z - this.z, lx = rx * fz - rz * fx, lz = rx * fx + rz * fz;
    const W = TRUCK.hw + 0.9, L = TRUCK.hl + 0.9, end = lz >= 0 ? 1 : -1;
    if (lx * side > TRUCK.hw + 0.3) return this.doorAt(side); // on his side: straight along it
    const p = Math.abs(lz) > TRUCK.hl + 0.3 ? local(this, side * W, end * L) : local(this, (Math.sign(lx) || side) * W, end * L);
    return { x: p.x, z: p.z };
  },
  // a fireman back at the truck climbs aboard; with the whole crew back it drives off
  board(n) {
    removeEntity(n); this.crew = this.crew.filter(c => c !== n);
    if (!this.crew.length && this.state === 'work') leave(this);
  },
  raycast(o, d, maxT) {
    const hit = rayLocalBox(o, d, this.x, this.z, this.yaw, -TRUCK.hw, 0.3, -TRUCK.hl, TRUCK.hw, 3.0, TRUCK.hl);
    return hit < maxT ? { t: hit } : null;
  },
  onShot(hit, dmg) { emit(hit.p.x, hit.p.y, hit.p.z, 3, '#ffe9a8', 5, 0.25, 0.06); this.damage(dmg * TOUGH.shot, true); return { head: false }; },
  onRocket(dmg) { this.damage(dmg * 2, true); },
  blast(x, y, z, R, dmg, byPlayer, ordnance) { const d = Math.hypot(this.x - x, this.z - z), r = R + TRUCK.hw; if (d < r) this.damage(blastDamage(this, d, r, dmg, 30, ordnance), byPlayer); },
  damage(dmg, byPlayer) {
    const t = this; if (t.dead) return;
    t.hp -= dmg; if (byPlayer) t.byPlayer = true;
    if (t.hp <= 0) destroy(t);
  },
  pushOut(o, r) { return pushOutOBB(o, r, this.x, this.z, this.yaw, TRUCK.hw, TRUCK.hl); },
  // the repair tool (game/repair.js) on it: the bodywork comes back like any vehicle's
  repair(dt) { const t = this; if (t.dead || t.hp >= TRUCK.hp) return false; t.hp = Math.min(TRUCK.hp, t.hp + TRUCK.hp * REPAIR.rate * dt); return true; },
  health() {
    if (this.dead) return null;
    const sy = Math.abs(Math.sin(this.yaw)), cy = Math.abs(Math.cos(this.yaw));
    return { hp: Math.max(0, this.hp), max: TRUCK.hp, burning: false, name: 'Fire truck', x: this.x, z: this.z, y: 0, hw: sy * TRUCK.hl + cy * TRUCK.hw, hl: cy * TRUCK.hl + sy * TRUCK.hw };
  },
  // the player can take it: climb up into the cab while it's stopped or crawling along, and drive off in it
  interaction(p) {
    if (p.vehicle || this.dead || this.v > 5) return null;
    const K = KINDS.truck, dist = K.reach(this, p); if (dist > K.reachMax) return null;
    return { keys: ['ride'], priority: 0, dist, prompt: `Press <kbd>${kb('ride')}</kbd> to take the fire truck`, run: () => takeTruck(this) };
  },
  blip(radar) { if (!this.dead) radar.dot(this.x, this.z, radar.flash && this.state !== 'leave' ? '#ffffff' : '#ff3b2e', 9, true, 'sq'); },
  shouldDespawn() {
    const d = Math.hypot(this.x - P.x, this.z - P.z);
    if (this.dead) return (this.deadT > 40 && d > 50) || d > 160;
    return (this.state === 'leave' && d > 110) || d > 260;
  },
  dispose() {
    scene.remove(this.grp);
    for (const n of this.crew) if (n.alive && !n.removed) removeEntity(n);
    for (const h of this.hoses.values()) { scene.remove(h); h.geometry.dispose(); }
  },
};

// Along its lane from junction to junction, swinging onto the road that gets it nearest the fire (or, leaving, away from
// the player). It slows for corners, waits behind whatever is in its lane and pulls up short of the fire.
function drive(t, dt) {
  const want = Math.atan2(t.dirX, t.dirZ), turn = angDiff(t.yaw, want);
  t.yaw += clamp(turn, -TRUCK.turn * dt, TRUCK.turn * dt);
  const k = Math.min(1, dt * 1.6); t.ox = lerp(t.ox, laneX(t.dirX, t.dirZ), k); t.oz = lerp(t.oz, laneZ(t.dirX, t.dirZ), k);
  let top = Math.abs(turn) > 0.25 ? TRUCK.corner : TRUCK.top;
  if (t.state === 'respond') {
    const rem = toFire(t);
    if (rem != null) {
      top = Math.min(top, Math.sqrt(2 * TRUCK.brake * 0.8 * Math.max(0, rem)));
      if (rem < 0.4) { arrive(t); return; }
    }
  }
  // something in the lane: wait, sound the horn at people, and after a moment shove a vehicle out of the way
  const b = inTheWay(t);
  if (b) {
    // held up close to the fire (by the burning wreck itself, or what it crashed into): this will do
    if (t.state === 'respond' && (Math.hypot(t.x - t.sx, t.z - t.sz) < TRUCK.stop + 8 || (b.kind === 'vehicle' && b.burnT > 0))) { arrive(t); return; }
    top = 0; t.waitT += dt;
    if (b !== P && b.kind !== 'vehicle') { if (t.waitT > 1 && t.hornT < t.time) { Sound.horn(1, at(t, 1.5)); t.hornT = t.time + 2.5; } }
    else if (b === P) { if (t.hornT < t.time) { Sound.horn(1, at(t, 1.5)); t.hornT = t.time + 2.5; } }
    else if (t.waitT > 2) { nudge(t, b); t.waitT = 0; }
  } else t.waitT = 0;
  t.v = t.v < top ? Math.min(top, t.v + TRUCK.accel * dt) : Math.max(top, t.v - TRUCK.brake * dt);
  if (t.v > 0) {
    const rem = (t.toX - t.ax) * t.dirX + (t.toZ - t.az) * t.dirZ, step = t.v * dt;
    if (step < rem) { t.ax += t.dirX * step; t.az += t.dirZ * step; }
    else {
      // at the junction: pick the next road
      t.ax = t.toX; t.az = t.toZ;
      const d = t.state === 'leave' ? nextDir(t.ax, t.az, P.x, P.z, [-t.dirX, -t.dirZ], true) : nextDir(t.ax, t.az, t.sx, t.sz, [-t.dirX, -t.dirZ]);
      t.dirX = d[0]; t.dirZ = d[1]; t.toX = t.ax + d[0] * STEP; t.toZ = t.az + d[1] * STEP;
    }
  }
  t.x = t.ax + t.ox; t.z = t.az + t.oz;
}

// how much further it has to go before parking short of the fire, or null while the fire isn't up this road yet
export function stopShort(ax, az, dirX, dirZ, sx, sz, stop = TRUCK.stop) {
  if (Math.hypot(sx - ax, sz - az) < stop + 2) return 0;
  const along = (sx - ax) * dirX + (sz - az) * dirZ, across = Math.abs((sx - ax) * dirZ - (sz - az) * dirX);
  if (across > 22 || along < -2) return null;
  return along - stop;
}
const toFire = t => stopShort(t.ax, t.az, t.dirX, t.dirZ, t.sx, t.sz);

// the nearest thing in its lane ahead within a few metres of its front: the player, someone on foot or a vehicle
function inTheWay(t) {
  const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), range = TRUCK.hl + 2 + t.v * 0.5;
  let best = null, bd = Infinity;
  const test = (e, lat) => {
    const rx = e.x - t.x, rz = e.z - t.z, ah = rx * fx + rz * fz, la = Math.abs(rx * fz - rz * fx);
    if (ah > TRUCK.hl - 0.5 && ah < range && la < lat && ah < bd) { bd = ah; best = e; }
  };
  if (P.alive && !P.vehicle && P.y < 2) test(P, TRUCK.hw + 0.5);
  for (const e of all()) {
    if (e.kind === 'npc' && onFoot(e) && !t.crew.includes(e)) test(e, TRUCK.hw + 0.4);
    else if (e.kind === 'vehicle') test(e, TRUCK.hw + (e.K.laneHalf > 1 ? 1.0 : 0.5));
    else if ((e.kind === 'tank' || e.kind === 'firetruck') && e !== t) test(e, TRUCK.hw + 1.8);
  }
  return best;
}
// shove a vehicle that won't get out of the way over to the side of the road (a wreck too)
function nudge(t, v) {
  if (v === P.vehicle) { if (t.hornT < t.time) { Sound.horn(1, at(t, 1.5)); t.hornT = t.time + 2.5; } return; }
  const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), side = ((v.x - t.x) * fz - (v.z - t.z) * fx) >= 0 ? 1 : -1;
  const vx = fz * side * 9 + fx * 2, vz = -fx * side * 9 + fz * 2;
  if (v.K.slide) { v.kvx = vx; v.kvz = vz; v.kspin = rnd(-0.5, 0.5); v.v = 0; if (v.mode === 'traffic') v.dazeT = 2; }
  else if (v.K.knock) { if (v.driver) v.ejectDriver(true); v.K.knock(v, vx, vz, 1); }
  Sound.thud(0.6, at(v, 0.7));
}

// pulled up at the fire: the crew climbs down either side and goes to work
function arrive(t) {
  t.state = 'work'; t.v = 0; t.siren = false;
  for (let i = 0; i < TRUCK.crew; i++) {
    const side = i % 2 ? 1 : -1, d = t.doorAt(side), n = spawnNpc('fireman', d.x, d.z);
    n.truck = t; n.side = side; n.yaw = t.yaw; t.crew.push(n);
  }
}
function leave(t) {
  t.state = 'leave'; t.siren = false; t.fire = null;
  for (const n of t.crew) if (n.alive && !n.removed) removeEntity(n);
  t.crew = [];
}
// The player takes the truck: it becomes a vehicle they drive (models/firetruck.js), as battered as it was and with
// its siren as it was. The crew give up on the fire and run, and stealing a fire engine draws the law.
export function takeTruck(t) {
  const hp = t.hp / TRUCK.hp, siren = t.siren, v = t.v;
  for (const n of t.crew) if (n.alive && !n.removed) { n.truck = null; n.become('wander'); Object.assign(n, { state: 'flee', timer: 9, fx: P.x, fz: P.z, panic: true }); }
  t.crew = []; removeEntity(t);
  const c = spawnVehicle('firetruck', t.x, t.z, t.yaw);
  c.hp = Math.max(1, Math.round(hp * c.model.hp)); c.siren = siren; c.v = v;
  alarm(c.x, c.z, 20); addHeat(2);
  enterVehicle(c);
  return c;
}
function destroy(t) {
  t.dead = true; t.hp = 0; t.v = 0; t.deadT = 0; t.siren = false; t.state = 'dead';
  for (const m of t.meshes) m.material = burntMat;
  t.lights.r.visible = t.lights.w.visible = false;
  explosion(t.x, TRUCK_BLAST.y, t.z, TRUCK_BLAST.r, TRUCK_BLAST.dmg, !!t.byPlayer, TRUCK_BLAST.power);
  if (t.byPlayer) addHeat(5);
  // whoever is left of the crew runs for it
  for (const n of t.crew) if (n.alive && !n.removed) { n.truck = null; n.become('wander'); BEHAVIOURS.wander.onHurt(n); }
  t.crew = [];
  for (const h of t.hoses.values()) h.visible = false;
}

// Each fireman out of the truck drags a hose from the pump panel along the ground to the nozzle in his hands. The
// tubes are rebuilt every frame from where the fireman is; one that is aboard again (or down) has none.
const hoseMat = new THREE.MeshLambertMaterial({ color: '#d8c7a0' });
const _h = new THREE.Vector3();
function hoses(t) {
  for (const [n, h] of t.hoses) if (!t.crew.includes(n) || !n.alive || n.removed) { scene.remove(h); h.geometry.dispose(); t.hoses.delete(n); }
  for (const n of t.crew) {
    if (!n.alive || n.removed) continue;
    const side = n.side, pump = local(t, side * PUMP.x, PUMP.z), px = pump.x, pz = pump.z, out = local(t, side * (PUMP.x + 0.7), PUMP.z), ox = out.x, oz = out.z;
    const hand = n.c.gunId === 'nozzle' ? muzzleOf(n.c) : _h.set(n.x, 1.0, n.z);
    const bx = n.x - Math.sin(n.yaw) * 0.7, bz = n.z - Math.cos(n.yaw) * 0.7;
    const pts = [new THREE.Vector3(px, PUMP.y, pz), new THREE.Vector3(ox, 0.1, oz), new THREE.Vector3((ox + bx) / 2, 0.06, (oz + bz) / 2), new THREE.Vector3(bx, 0.1, bz), new THREE.Vector3(hand.x, hand.y - 0.05, hand.z)];
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.05, 5, false);
    let h = t.hoses.get(n);
    if (!h) { h = new THREE.Mesh(geo, hoseMat); scene.add(h); t.hoses.set(n, h); }
    else { h.geometry.dispose(); h.geometry = geo; }
  }
}
// A fireman hosing a vehicle: a jet of water from his nozzle arcing onto it
export function spray(n, v, dt) {
  const m = muzzleOf(n.c), tx = v.x - m.x, tz = v.z - m.z, d = Math.hypot(tx, tz) || 1, s = 11, T = d / s, ty = 1.1 - m.y;
  const vy = (ty + 0.5 * 9.8 * T * T) / T;
  if (Math.random() < 0.8) jet(m.x, m.y, m.z, 2, Math.random() < 0.6 ? '#bfe6ff' : '#f2fbff', tx / d * s, vy, tz / d * s, 0.6, T * 1.1, 0.12);
}

function pose(t, dt) {
  t.grp.position.set(t.x, 0, t.z); t.grp.rotation.set(0, t.yaw, 0);
  spinWheels(t.wheels, t.v * dt);
  // the light bar flashes red and white while it is out on a call
  const on = t.state !== 'leave', ph = (t.time * 5 | 0) % 2 === 0;
  t.lights.r.visible = on && ph; t.lights.w.visible = on && !ph;
}

// a fire truck already called out to a fire near (x, z)
const onCall = (x, z) => all('firetruck').find(t => !t.dead && t.state !== 'leave' && Math.hypot(t.sx - x, t.sz - z) < 30);

// Sends a truck to the fire at vehicle `v`: from a junction START.min to START.max from it, out of the player's sight
// and clear of them if it can, facing the way towards the fire. Returns the truck, or null when one is already on its
// way to a fire there or too many are out.
export function dispatchTruck(v) {
  if (onCall(v.x, v.z) || all('firetruck').filter(t => !t.dead && t.state !== 'leave').length >= TRUCK.sites) return null;
  const spots = [];
  for (const x of ROADS) for (const z of ROADS) {
    const d = Math.hypot(x - v.x, z - v.z); if (d < START.min || d > START.max) continue;
    const pd = Math.hypot(x - P.x, z - P.z); if (pd < START.clearOfPlayer) continue;
    spots.push({ x, z, d, seen: !blocked(x, 2, z, P.x, P.y + 1.6, P.z) });
  }
  if (!spots.length) spots.push({ x: nearestRoad(v.x + (v.x > 0 ? -START.min : START.min)), z: nearestRoad(v.z), d: START.min, seen: true });
  // the nearest junction the player can't see, else the nearest
  const hidden = spots.filter(s => !s.seen), s = (hidden.length ? hidden : spots).sort((a, b) => a.d - b.d)[0];
  return spawnTruck(s.x, s.z, v);
}
export function spawnTruck(x, z, fire) {
  const d = nextDir(x, z, fire.x, fire.z, null), m = buildTruck();
  const t = Object.assign(Object.create(Truck), m, {
    ax: x, az: z, ox: laneX(d[0], d[1]), oz: laneZ(d[0], d[1]), dirX: d[0], dirZ: d[1], toX: x + d[0] * STEP, toZ: z + d[1] * STEP,
    yaw: Math.atan2(d[0], d[1]), v: TRUCK.top * 0.6, hp: TRUCK.hp, dead: false, state: 'respond', siren: true, fire, sx: fire.x, sz: fire.z,
    crew: [], hoses: new Map(), waitT: 0, hornT: 0, time: 0,
  });
  t.x = t.ax + t.ox; t.z = t.az + t.oz;
  scene.add(t.grp); pose(t, 0);
  return addEntity(t);
}

// a collision sets something alight: call the fire brigade
on('vehicle:burning', ({ vehicle, crash }) => { if (crash && G.state !== 'title') dispatchTruck(vehicle); });
