import { explosion } from '../combat/combat.js';
import { zoneDamage } from '../combat/hitzones.js';
import { Sound } from '../core/audio.js';
import { emit as emitEvent } from '../core/events.js';
import { at } from '../core/spatial.js';
import { G, P } from '../core/state.js';
import { clamp, rnd } from '../core/util.js';
import { all, removeEntity } from '../entities/registry.js';
import { crew, shareOut } from '../game/crew.js';
import { credit, reward } from '../game/pickups.js';
import { enterVehicle } from '../game/player.js';
import { alarm, spawnNpc } from '../npcs/npc.js';
import { NPC_TYPES } from '../npcs/types.js';
import { emit, muzzleFlash, tracer } from '../render/effects.js';
import { toast } from '../ui/hud.js';
import { ROADS } from '../world/collision.js';
import { CRASH_BLAST as HELI_CRASH, HELI_HP, aimLight, roofTop, spawnHeli } from '../vehicles/heli.js';
import { slump } from '../vehicles/heli-mesh.js';
import { burntMat } from '../vehicles/materials.js';
import { VEHICLE_MODELS } from '../vehicles/models/index.js';
import { showSearchlight } from '../vehicles/searchlight.js';
import { BULLET_ARMOR, TANK_COOLDOWN, TANK_HP, fireLook, pose as poseTank, removeTank, spawnTank, takeTank, wreckLook, wreckStep } from '../vehicles/tank.js';
import { CRASH_BLAST as UFO_CRASH, UFO_HP, place as placeUfo, spawnUfo } from '../vehicles/ufo.js';
import { spawnVehicle } from '../vehicles/vehicle.js';
import { MP, connected, onMessage, send } from './net.js';
import { sample, trim } from './protocol.js';
import { remoteOf } from './remote.js';
import { JOIN_GRACE, WORLD_EVERY, WORLD_LAG, WORLD_STALE, electHost, nearAny, older, packHeli, packTank, packUfo, packVehicle, unpackThing, yields } from './world-protocol.js';

// ================= MULTIPLAYER: ONE CITY FOR THE CREW =================
// The traffic, the police chopper, the army tank and the UFO are the crew's, not each player's: one of them, the host
// (net/world-protocol.js says who), runs them and sends them out; everyone else's game draws them as puppets. A puppet is
// the real entity (a traffic car with its driver, the chopper, the tank, the saucer) with its brain swapped for the host's
// word, so it looks, sounds, shows on the radar and gets in the way exactly like the real thing. What this player does to
// one goes to the host: bullets, rockets, rams, scaring or dragging out the driver, taking the car. Cash for a kill comes
// back to whoever made it. When the host goes (leaves, tabs away, steps into the club), the next host takes the puppets
// over as they are and runs them on, so the city carries on where it was.
const now = () => performance.now() / 1000;
const inWorld = () => ['play', 'dead', 'map', 'paused', 'shop'].includes(G.state) && !P.club;

// ---- who runs the world ----
let role = 'solo'; // 'solo' (not in a room), 'host', 'guest' (drawing the host's), 'wait' (just in, listening for one)
let hostId = null, hostAt = 0, joinedAt = 0, ticked = -1, movedAt = 0;
const seen = new Map(); // player id -> { up, hs, at }: their last word on whether they could host, and how long they've been in
const upOf = id => { const p = seen.get(id); return p ? p.up + (now() - p.at) : 0; };
const myUp = () => joinedAt ? now() - joinedAt : 0;
// out in a running city: not in a tab in the background (its city stands still), and drawing frames (a slow machine's
// stall of a few seconds doesn't count)
const canHost = () => connected() && inWorld() && !document.hidden && now() - movedAt < 10;
export const worldRole = () => role;
crew.runsWorld = () => role !== 'guest';

// the fields this player's state carries for it (net/sync.js)
export const worldState = () => ({ hs: canHost() ? 1 : 0, up: Math.round(myUp()) });

onMessage('welcome', () => { joinedAt = now(); hostId = null; seen.clear(); });
onMessage('s', m => { if (Number.isFinite(m.up)) seen.set(m.id, { up: m.up, hs: m.hs === 1 && m.w === 1, at: now() }); });
onMessage('leave', m => { seen.delete(m.id); if (hostId === m.id) hostId = null; });

function decide() {
  if (!connected()) { setRole('solo'); return; }
  if (hostId && now() - hostAt > WORLD_STALE) hostId = null;
  const t = now(), players = [{ id: MP.id, up: myUp(), ok: canHost() }];
  for (const [id, p] of seen) players.push({ id, up: upOf(id), ok: p.hs && t - p.at < 3 });
  // a host that's still talking is the host, unless its own state says it can't run the city any more (it went to the
  // title screen, the club or another tab): then the next one takes over straight away
  if (role === 'guest' && hostId && seen.get(hostId)?.hs !== false) return;
  const current = role === 'host' ? MP.id : hostId;
  // just in, with others here: give whoever already runs the city a moment to be heard
  if (!current && t - joinedAt < JOIN_GRACE && seen.size) { setRole('wait'); return; }
  const h = electHost(players, current);
  if (h === MP.id) setRole('host');
  else if (h) setRole('guest');
  // nobody can (all in background tabs, say): this game keeps what it has, and shares it once it can again
  else if (role !== 'guest' && role !== 'host') setRole('wait');
}
function setRole(r) {
  if (r === role) return;
  const was = role; role = r;
  if (r === 'guest') standDown();
  else if (was === 'guest') takeOver();
}

// ---- out: the host's world message ----
let sentAt = 0;
function tick() {
  if (G.time !== ticked) { ticked = G.time; movedAt = now(); }
  decide();
  if (role !== 'host' || !canHost() || now() - sentAt < WORLD_EVERY) return;
  const spots = crew.others(true); if (!spots.length) return;
  sentAt = now();
  const e = [];
  for (const v of all('vehicle')) if (v.wk && v.driver !== P && !v.removed && nearAny(v.x, v.z, spots)) e.push(packVehicle(v));
  for (const h of all('heli')) if (!h.removed) e.push(packHeli(shareOut(h)));
  for (const t of all('tank')) if (!t.removed && nearAny(t.x, t.z, spots)) e.push(packTank(shareOut(t)));
  for (const u of all('ufo')) if (!u.removed) e.push(packUfo(shareOut(u)));
  send({ t: 'world', up: Math.round(myUp()), e: e.slice(0, 80) });
}
setInterval(tick, 50);

// ---- in: the host's world ----
const puppets = new Map(); // key -> entity
const taken = new Map(); // key -> when this player took it (it may still be in a snapshot or two)
onMessage('world', m => {
  if (!Array.isArray(m.e)) return;
  const them = { id: m.id, up: Number(m.up) || 0 };
  if (role === 'host' || role === 'wait') {
    // two hosts for a moment: whoever has been in the room longer keeps it
    if (role === 'host' && canHost() && !yields({ id: MP.id, up: myUp() }, them)) return;
  } else if (hostId && hostId !== m.id && older({ id: hostId, up: upOf(hostId) }, them) < 0 && now() - hostAt < WORLD_STALE) return;
  hostId = m.id; hostAt = now();
  setRole('guest');
  apply(m.e.map(unpackThing).filter(Boolean));
});

function apply(things) {
  const t = now(), here = new Set();
  for (const [k, at] of taken) if (t - at > 3) taken.delete(k);
  for (const th of things) {
    if (taken.has(th.key)) continue;
    here.add(th.key);
    let p = puppets.get(th.key);
    if (p && p.removed) { puppets.delete(th.key); p = null; }
    if (!p) { p = make(th); if (!p) continue; puppets.set(th.key, p); }
    p.buf.push({ at: t, s: th.s }); p.last = th.s;
  }
  for (const [k, p] of puppets) if (!here.has(k)) gone(k, p);
}

// a puppet the host no longer sends: it drove off, was cleared away, or came down (and goes up here too)
function gone(k, p) {
  puppets.delete(k);
  if (p.removed) return;
  const s = p.last || {};
  if (p.kind === 'heli' && s.fall) explosion(p.x, roofTop(p.x, p.z, 0) + HELI_CRASH.y, p.z, HELI_CRASH.r, HELI_CRASH.dmg, false, HELI_CRASH.power);
  if (p.kind === 'ufo' && s.fall) explosion(p.x, UFO_CRASH.y, p.z, UFO_CRASH.r, UFO_CRASH.dmg, false, UFO_CRASH.power);
  drop(p);
}
function drop(e) {
  removeEntity(e);
  if (G.heli === e) G.heli = null;
  if (G.tank === e) G.tank = null;
  if (G.ufo === e) G.ufo = null;
}

// where a puppet is now: between the snapshots either side of a moment WORLD_LAG ago
function follow(p) {
  const t = now() - WORLD_LAG;
  trim(p.buf, t);
  return sample(p.buf, t);
}
// tell the host something about one of its things
const ask = (p, m) => { if (hostId) send({ ...m, to: hostId, k: p.wk }); };
const r1 = n => Math.round(n * 10) / 10;

// ---- puppet traffic ----
const proto = e => Object.getPrototypeOf(e);
const VEHICLE = {
  puppet: true,
  update(dt) {
    const s = follow(this); if (!s) return;
    // shoved or knocked by this player's ride (vehicle.js ram): the host's car takes it
    if (this.kvx || this.kvz || this.kspin) { ask(this, { t: 'wram', vx: r1(this.kvx || 0), vz: r1(this.kvz || 0), s: r1(this.kspin || 0) }); this.kvx = this.kvz = this.kspin = 0; this.avy = 0; this.air = 0; }
    if (!s.dr && this.driver) loseDriver(this);
    if (s.burn && !(this.burnT > 0) && !this.dead) { this.burnT = 1e9; this.crashFire = !!s.crash; }
    if (!s.burn && this.burnT > 0 && !this.dead) this.burnT = 0;
    if (s.dead && !this.dead) { this.burnT = 0; this.explode(); } // it goes up here too (and a wreck this player made pays them)
    this.mode = 'puppet'; // (no driving of its own)
    proto(this).update.call(this, dt); // the fire, the smoke
    this.x = s.x; this.z = s.z; this.yaw = s.yaw; this.v = s.sp; this.steer = s.st;
    if (this.K.flies) this.y = s.y;
    this.dirX = Math.round(Math.sin(s.yaw)); this.dirZ = Math.round(Math.cos(s.yaw));
    this.K.pose(this, dt);
  },
  damage(d, by, crash) {
    if (this.dead || !(d > 0)) return;
    if (by) this.byPlayer = true;
    ask(this, { t: 'wdmg', d: r1(d), b: by === 'boom' ? 2 : by ? 1 : 0, c: crash ? 1 : 0 });
  },
  onRocket(d) { if (!this.dead) { this.byPlayer = true; ask(this, { t: 'wdmg', d: r1(d), r: 1 }); } },
  blast() {}, fling() {}, // the host's car feels this player's blasts (the 'boom' they send)
  ejectDriver() {}, // the host decides who comes out
  scareDriver() { const a = this.driver; if (a && a.alive && a.faction === 'civilian') ask(this, { t: 'wscare' }); return null; },
  jack() { take(this, true); },
  interaction(p) {
    const it = proto(this).interaction.call(this, p); if (!it) return null;
    return { ...it, run: () => take(this, !!this.driver) };
  },
  repair() { return false; }, douse() { return false; },
  shouldDespawn() { return false; },
};
// a bike knocked flying by this player's ride: the host's bike flies (its kind's knock, wrapped per puppet)
const knockKind = K => Object.create(K, { knock: { value: (v, vx, vz, up) => ask(v, { t: 'wram', vx: r1(vx), vz: r1(vz), up: r1(up || 0), kn: 1 }) } });
// whoever is at the wheel of a puppet is the host's: hits on them go there
const DRIVER = {
  puppet: true,
  hurt() {}, blast() {},
  onShot(hit, dmg) {
    const zone = hit.zone || (hit.head ? 'head' : 'torso');
    if (this.vehicle) { this.vehicle.byPlayer = true; ask(this.vehicle, { t: 'wdmg', d: r1(zoneDamage(dmg, zone)), o: 1 }); }
    emit(this.x, 1.2, this.z, 6, '#c0142c', 3.5, 0.5, 0.09);
    return { head: zone === 'head', zone };
  },
};
function loseDriver(v) {
  const a = v.driver; v.driver = null; a.vehicle = null;
  v.K.unseat(v, a.c); removeEntity(a); // (they're one of the host's people now, and come in as one: net/ghosts.js)
}
function makeVehicle(th) {
  const s = th.s, M = VEHICLE_MODELS[th.model]; if (!M) return null;
  const v = spawnVehicle(M, s.x, s.z, s.yaw, 'puppet');
  if (v.K.flies) { v.y = s.y; v.landed = true; v.pilotDead = true; }
  if (s.dr && s.da && s.dt && NPC_TYPES[s.dt]) { const n = spawnNpc(s.dt, s.x, s.z, s.seed); v.seatDriver(n); Object.assign(n, DRIVER); }
  if (s.dead) quietWreck(v);
  return Object.assign(v, VEHICLE, { wk: th.key, K: knockKind(v.K), buf: [], v: s.sp });
}
// a wreck from before this player came: burnt out, without the bang
function quietWreck(v) {
  v.dead = true; v.v = 0; v.deadT = 30;
  for (const m of v.mesh.solid) m.material = burntMat;
  for (const m of v.mesh.lit) m.visible = false;
  v.K.wreck(v);
}

// this player gets in (or drags the driver out): their own copy of it from now on, and the host lets go of theirs
function take(p, jack) {
  if (p.dead || p.burnT > 0 || P.vehicle) return;
  const v = spawnVehicle(p.model.id, p.x, p.z, p.yaw);
  if (v.K.flies) { v.y = p.y; v.landed = true; v.pilotDead = true; }
  ask(p, { t: 'wtake', j: jack ? 1 : 0 });
  taken.set(p.wk, now()); puppets.delete(p.wk); drop(p);
  if (jack) { alarm(v.x, v.z, 20); emitEvent('vehicle:jacked', { vehicle: v, driver: null }); }
  enterVehicle(v);
}

// ---- the puppet chopper ----
const _f = new THREE.Vector3(), _t = new THREE.Vector3();
const HELI = {
  puppet: true,
  update(dt) {
    const h = this, s = follow(h); if (!s) return;
    h.x = s.x; h.y = s.y; h.z = s.z; h.yaw = s.yaw; h.spin = s.spin; h.falling = !!s.fall; h.downed = !!s.down;
    h.rotor.rotation.y += dt * 30 * h.spin; h.rotor2.rotation.y = h.rotor.rotation.y;
    h.grp.position.set(h.x, h.y, h.z);
    if (h.falling) { h.grp.rotation.y += dt * 5; h.grp.rotation.z += dt * 0.6; if (Math.random() < 0.8) emit(h.x, h.y, h.z, 1, '#3a3240', 2, 1.5, 0.8, 2, 1); return; }
    h.grp.rotation.set(0.12 * (h.downed ? h.spin : 1), h.yaw, 0);
    const hpF = s.hp / HELI_HP;
    if (hpF < 0.6 && Math.random() < (hpF < 0.3 ? 0.9 : 0.4)) emit(h.x, h.y + 0.6, h.z, 1, hpF < 0.3 ? '#2a2430' : '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
    showSearchlight(h.light, !!s.lit && !h.downed);
    if (s.lit && !h.downed) aimLight(h, s.lx, s.lz);
    h.lr.visible = (G.time * 2 | 0) % 2 === 0;
    // the minigun going: flashes, the rattle, and tracers raking round whoever it's after (the hits come from the host)
    if (s.fire && !h.downed) {
      h.burstT -= dt;
      if (h.burstT <= 0) {
        h.burstT = 0.09; _f.set(h.x, h.y - 1, h.z); _t.set(s.tx + rnd(-2, 2), s.ty + rnd(-1, 0.5), s.tz + rnd(-2, 2));
        muzzleFlash(_f); Sound.shot('minigun', 0.6, at(h, -0.5)); tracer(_f, _t, true);
      }
    }
  },
  onShot(hit, dmg) {
    if (this.falling) return { head: false };
    if (hit.occupant) { ask(this, { t: 'wdmg', d: r1(dmg), o: 1, hd: hit.head ? 1 : 0 }); if (hit.p) emit(hit.p.x, hit.p.y, hit.p.z, 4, '#cfe6ff', 4, 0.3, 0.05); return { head: hit.head }; }
    ask(this, { t: 'wdmg', d: r1(dmg) }); emit(this.x, this.y, this.z, 4, '#ffd23e', 7, 0.3, 0.16);
    return { head: false };
  },
  onRocket(d) { ask(this, { t: 'wdmg', d: r1(d), r: 1 }); },
  blast() {}, damage() {},
};
function makeHeli(th) {
  const s = th.s, h = spawnHeli();
  Object.assign(h, HELI, { wk: th.key, buf: [], x: s.x, y: s.y, z: s.z, yaw: s.yaw, burstT: 0 });
  h.grp.position.set(h.x, h.y, h.z);
  if (s.down) { h.downed = true; slump(h.pilot); }
  return h;
}

// ---- the puppet tank ----
const TANK = {
  puppet: true,
  update(dt) {
    const t = this, s = follow(t); if (!s) return;
    if (s.dead && !t.dead) { t.x = s.x; t.z = s.z; wreckLook(t, false); }
    if (t.dead) { wreckStep(t, dt); return; }
    t.x = s.x; t.z = s.z; t.yaw = s.yaw; t.turretYaw = s.ty; t.pitch = s.p; t.v = s.sp; t.leaving = !!s.leave; t.hp = s.hp;
    if (s.shots > t.shots) { t.shots = s.shots; fireLook(t); }
    const hpF = s.hp / TANK_HP, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    if (hpF < 0.5 && Math.random() < (hpF < 0.25 ? 0.9 : 0.4)) emit(t.x - fx * 2.6, 1.8, t.z - fz * 2.6, 1, hpF < 0.25 ? '#2a2430' : '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
    poseTank(t, dt);
  },
  onShot(hit, dmg) {
    const t = this; emit(hit.p.x, hit.p.y, hit.p.z, 5, '#ffe9a8', 6, 0.2, 0.05); Sound.ting(1, hit.p);
    if (t.dead) return { head: false };
    ask(t, { t: 'wdmg', d: r1(dmg * BULLET_ARMOR) });
    if (!t.warned) { t.warned = true; toast('Bullets bounce off the tank. Hit it with <em>rockets</em> or blow up the cars around it.', 4); }
    return { head: false };
  },
  onRocket(d) { if (!this.dead) ask(this, { t: 'wdmg', d: r1(d), r: 1 }); },
  blast() {}, damage() {},
  interaction(p) {
    const it = proto(this).interaction.call(this, p); if (!it) return null;
    return { ...it, run: () => { const k = this.wk; ask(this, { t: 'wtake' }); taken.set(k, now()); puppets.delete(k); takeTank(this); } };
  },
  shouldDespawn() { return false; },
};
function makeTank(th) {
  const s = th.s, t = spawnTank();
  Object.assign(t, TANK, { wk: th.key, buf: [], x: s.x, z: s.z, yaw: s.yaw, turretYaw: s.ty, pitch: s.p, shots: s.shots });
  if (s.dead) { t.dead = true; t.turretOff = true; t.tvy = 0; t.tlift = 0; t.deadT = 40; if (G.tank === t) G.tank = null; }
  poseTank(t, 0);
  return t;
}

// ---- the puppet UFO ----
const UFO = {
  puppet: true,
  update(dt) {
    const u = this, s = follow(u); if (!s) return;
    u.x = s.x; u.y = s.y; u.z = s.z; u.falling = !!s.fall; u.beamT = s.beam ? 1 : 0; u.bx = s.bx; u.bz = s.bz;
    u.grp.rotation.y += dt * (u.falling ? 6 : 1.2);
    if (u.falling) { u.grp.rotation.z = Math.sin(G.time * 7) * 0.35; if (Math.random() < 0.8) emit(u.x, u.y, u.z, 1, '#3a3240', 2, 1.5, 0.8, 2, 1); }
    else if (s.hp / UFO_HP < 0.5 && Math.random() < 0.5) emit(u.x, u.y, u.z, 1, '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
    placeUfo(u);
  },
  onShot(hit, dmg) { if (!this.falling) ask(this, { t: 'wdmg', d: r1(dmg) }); return { head: false }; },
  onRocket(d) { if (!this.falling) ask(this, { t: 'wdmg', d: r1(d), r: 1 }); },
  blast() {}, damage() {},
};
function makeUfo(th) {
  const s = th.s, u = spawnUfo();
  return Object.assign(u, UFO, { wk: th.key, buf: [], x: s.x, y: s.y, z: s.z });
}

function make(th) {
  if (th.kind === 'v') return makeVehicle(th);
  if (th.kind === 'h') return makeHeli(th);
  if (th.kind === 't') return makeTank(th);
  if (th.kind === 'u') return makeUfo(th);
  return null;
}

// ---- changing hands ----
const unPuppet = (e, over) => { for (const k of Object.keys(over)) delete e[k]; delete e.buf; delete e.last; };
// this player is the host now: what they drew, they run, from where it is
function takeOver() {
  for (const [, p] of puppets) {
    if (p.removed) continue;
    const s = p.last || {};
    if (p.kind === 'vehicle') {
      unPuppet(p, VEHICLE); p.K = Object.getPrototypeOf(p.K);
      if (p.driver) unPuppet(p.driver, DRIVER);
      p.mode = p.driver ? 'traffic' : 'parked';
      if (p.burnT > 0) p.burnT = p.K.fx.fuse * 2;
    } else if (p.kind === 'heli') {
      unPuppet(p, HELI); p.hp = s.hp || HELI_HP; p.ang = Math.atan2(p.z - P.z, p.x - P.x);
      if (p.falling) p.vy = 0;
      if (!G.heli) G.heli = p;
    } else if (p.kind === 'tank') {
      unPuppet(p, TANK);
      if (!p.dead) { onRoad(p); G.tank = G.tank || p; }
    } else if (p.kind === 'ufo') {
      unPuppet(p, UFO); p.hp = s.hp || UFO_HP; p.ang = Math.atan2(p.z - P.z, p.x - P.x);
      if (p.falling) p.vy = 0;
      if (!G.ufo) G.ufo = p;
    }
  }
  puppets.clear(); taken.clear();
}
// a tank taken over mid-road: on along the road it was on, to the next junction ahead
const ahead = (v, dir) => dir > 0 ? ROADS.find(r => r > v + 0.5) ?? v : [...ROADS].reverse().find(r => r < v - 0.5) ?? v;
const nearestRoad = v => ROADS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
function onRoad(t) {
  const dx = Math.round(Math.sin(t.yaw)), dz = dx ? 0 : Math.sign(Math.cos(t.yaw)) || 1;
  t.dirX = dx; t.dirZ = dz;
  if (dx) { t.z = nearestRoad(t.z); t.toX = ahead(t.x, dx); t.toZ = t.z; } else { t.x = nearestRoad(t.x); t.toZ = ahead(t.z, dz); t.toX = t.x; }
  t.yaw = Math.atan2(dx, dz);
}
// someone else runs the world now: what this game ran goes (the host's comes in as puppets)
function standDown() {
  for (const e of all()) if (e.wk && !e.puppet && e !== P.vehicle && !(P.ride && P.ride.v === e)) drop(e);
}

// ---- the host: what the crew does to its things ----
const thing = k => typeof k === 'string' && all().find(e => e.wk === k && !e.removed && !e.puppet);
function asHost(fn) { return m => { if (role === 'host' || role === 'solo' || role === 'wait') { const e = thing(m.k); if (e) fn(e, m); } }; }
const amount = m => clamp(Number(m.d) || 0, 0, 3000);
onMessage('wdmg', asHost((e, m) => {
  const d = amount(m); if (!d) return;
  credit.to = m.from;
  try {
    if (e.kind === 'vehicle') {
      if (m.o) { const a = e.driver; if (a && a.alive) a.hurt(d, new THREE.Vector3(0, 0, 1), true); return; }
      const was = e.byPlayer; // (a wreck pays whoever made it, on their side: their puppet goes up there)
      if (m.r) e.onRocket(d); else e.damage(d, m.b === 2 ? 'boom' : false, !!m.c);
      e.byPlayer = was;
    } else if (e.kind === 'heli') {
      if (m.o) e.onShot({ occupant: true, head: !!m.hd }, d); else if (m.r) e.onRocket(d); else e.damage(d);
    } else if (m.r) e.onRocket(d);
    else e.damage(d);
  } finally { credit.to = null; }
}));
onMessage('wram', asHost((e, m) => {
  if (e.kind !== 'vehicle' || e.dead && !m.kn) return;
  const vx = clamp(Number(m.vx) || 0, -40, 40), vz = clamp(Number(m.vz) || 0, -40, 40);
  if (m.kn && e.K.knock) { if (e.driver) e.ejectDriver(false); e.ghostT = G.time + 0.6; e.K.knock(e, vx, vz, clamp(Number(m.up) || 0, 0, 10)); return; }
  if (!e.K.slide) return;
  e.kvx = vx; e.kvz = vz; e.kspin = clamp(Number(m.s) || 0, -10, 10); e.v = 0;
  if (e.mode === 'traffic') e.dazeT = 1.5;
}));
onMessage('wscare', asHost((e, m) => { if (e.scareDriver) e.scareDriver(remoteOf(m.from) || e); }));
onMessage('wtake', asHost(e => {
  if (e.kind === 'tank') { if (G.tank === e) removeTank(TANK_COOLDOWN); else removeEntity(e); return; }
  if (e.kind !== 'vehicle') return;
  if (e.driver && e.driver.alive) e.ejectDriver(true);
  removeEntity(e);
}));
// a crewmate's rocket or grenade: the tank and the UFO only feel the crew's blasts, so it counts as theirs
onMessage('boom', m => {
  if (m.n || role === 'guest' || ![m.x, m.y, m.z, m.r, m.d].every(Number.isFinite)) return;
  credit.to = m.id;
  try { for (const e of all()) if (e.wk && (e.kind === 'tank' || e.kind === 'ufo') && !e.removed) e.blast(m.x, m.y, m.z, clamp(m.r, 0, 30), clamp(m.d, 0, 400), true, true); } finally { credit.to = null; }
});
// what this player's hit earned on the host's side
credit.pay = (to, v, label) => send({ t: 'wcash', to, v: Math.round(v), l: String(label || '').slice(0, 32) });
onMessage('wcash', m => { const v = clamp(Math.round(Number(m.v) || 0), 0, 20000); if (v) reward(0, 0, v, String(m.l || '').slice(0, 32)); });
