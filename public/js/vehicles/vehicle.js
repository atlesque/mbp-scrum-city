import { Sound } from '../core/audio.js';
import { pan3d, panFor, vol3d } from '../core/spatial.js';
import { emit as emitEvent } from '../core/events.js';
import { G, I, P, cam, keys } from '../core/state.js';
import { angDiff, clamp, rnd } from '../core/util.js';
import { addEntity, all, removeEntity } from '../entities/registry.js';
import { explosion } from '../combat/combat.js';
import { enterVehicle, exitVehicle, hurtPlayer } from '../game/player.js';
import { alarm, onFoot } from '../npcs/npc.js';
import { emit } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { toast } from '../ui/hud.js';
import { rayBox } from '../world/collision.js';
import { bike } from './kinds/bike.js';
import { car } from './kinds/car.js';
import { knockImpulse, shoveImpulse, touching } from './knock.js';
import { burntMat } from './materials.js';
import { VEHICLE_MODELS } from './models/index.js';

// How each kind of vehicle drives, seats its rider and gets hit. See kinds/bike.js for the full list of fields.
export const KINDS = { bike, car };

// A vehicle in the world: parked, in traffic, answering a call, or driven by the player.
// mode: 'parked' | 'fallen' (a bike on its side) | 'traffic' | 'respond' (police) | 'player'
const Vehicle = {
  kind: 'vehicle',
  blipLayer: 2,
  update(dt) {
    const K = this.K, fx = K.fx;
    // shoved by another car: skid and spin along, knocking into whatever else is in the way
    const sliding = K.slide && (this.kvx || this.kvz || this.kspin) && this.driver !== P;
    if (sliding) { K.slide(this, dt); shoveAround(this); }
    if (this.dead) { this.deadT += dt; if (Math.random() < dt * fx.smokeRate) emit(this.x, fx.smokeY, this.z, 1, '#3a3240', fx.smokeSpeed, fx.smokeLife, fx.smokeSize, 2, 1); K.pose(this, 0); return; }
    if (this.burnT > 0) {
      this.burnT -= dt;
      if (Math.random() < fx.fireRate) emit(this.x + rnd(-fx.spread, fx.spread), fx.fireY, this.z + rnd(-fx.spread, fx.spread), 1, Math.random() < 0.5 ? '#ff7a2a' : '#ffd23e', 1, 0.5, fx.fireSize, 4, 1);
      if (this.burnT <= 0) { this.explode(); K.pose(this, 0); return; }
      if (K.stopsWhileBurning) { K.pose(this, dt); return; }
    }
    if (this.driver === P || sliding) { K.pose(this, dt); return; } // driven from the player update
    const ai = K.ai[this.mode];
    if (ai) ai(this, dt); else K.coast(this, dt);
    K.pose(this, dt);
  },
  damage(dmg, byPlayer) {
    if (this.dead || this.burnT > 0) return;
    this.hp -= dmg; if (byPlayer) this.byPlayer = true;
    if (this.driver && this.driver !== P) this.top = 24; // a shot-at rider guns it
    if (this.hp > 0) return;
    this.burnT = byPlayer === 'boom' ? this.K.fx.boomFuse : this.K.fx.fuse;
    if (this.K.stopsWhileBurning) this.v = 0;
    if (this.driver === P) { exitVehicle(true); toast(`Bail! The ${this.model.tag} is going up.`, 3); }
    else if (this.driver) this.ejectDriver(true);
  },
  explode() {
    const K = this.K;
    this.dead = true; this.burnT = 0; this.v = 0;
    for (const m of this.mesh.solid) m.material = burntMat; for (const m of this.mesh.lit) m.visible = false;
    K.wreck(this);
    explosion(this.x, K.blast.y, this.z, K.blast.r, K.blast.dmg, this.byPlayer);
    emitEvent('vehicle:wrecked', { vehicle: this, byPlayer: this.byPlayer });
  },
  raycast(o, d, maxT) {
    if (this.driver === P) return null;
    const b = this.K.hitBox(this), t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, this.x - b.hx, 0, this.z - b.hz, this.x + b.hx, b.h, this.z + b.hz);
    if (!(t < maxT)) return null;
    // through the windows of a closed vehicle, the shot can find the driver instead of the bodywork
    const a = this.driver;
    if (a && a.alive && this.K.occupantHit) { const h = this.K.occupantHit(this, o, d, maxT); if (h) return { t: h.t, head: h.head, zone: h.head ? 'head' : 'torso', occupant: true }; }
    return { t };
  },
  onShot(hit, dmg, dir) {
    if (hit.occupant && this.driver && this.driver.alive) { emit(hit.p.x, hit.p.y, hit.p.z, 4, '#cfe6ff', 4, 0.3, 0.05); return this.driver.onShot(hit, dmg, dir); }
    this.damage(dmg, true); emit(hit.p.x, hit.p.y, hit.p.z, 3, '#ffe9a8', 5, 0.25, 0.06); return { head: false };
  },
  onRocket() { this.damage(999, true); },
  blast(x, y, z, R, dmg, byPlayer) { const d = Math.hypot(this.x - x, this.z - z); if (d < R && !this.dead) this.damage(dmg * (1 - d / R) + 40, byPlayer ? 'boom' : false); },
  pushOut(o, r) { return !(this.ghostT > G.time) && this.K.pushOut(this, o, r); }, // a vehicle just rammed flies through whatever hit it
  blip(radar) { if (this.driver !== P && !this.dead) this.K.blip(this, radar); },
  interaction(p) {
    if (p.vehicle || this.driver === P || this.dead || this.burnT > 0) return null;
    // someone at the wheel of a slow car can be dragged out; anyone on a bike has to be shot or rammed off
    const jack = !!this.driver;
    if (jack && !(this.K.enclosed && this.driver.alive && Math.abs(this.v) < 5)) return null;
    const dist = this.K.reach(this, p); if (dist > this.K.reachMax) return null;
    if (jack) return { keys: ['KeyF'], priority: 0, dist, prompt: `Press <kbd>F</kbd> to pull the driver out of the ${this.model.name}`, run: () => this.jack() };
    return { keys: ['KeyF', 'KeyE'], priority: 0, dist, prompt: `Press <kbd>F</kbd> to ${this.K.verb} the ${this.model.name}`, run: () => enterVehicle(this) };
  },
  // the player drags the driver out and takes the wheel
  jack() {
    const a = this.driver; this.ejectDriver(true); alarm(this.x, this.z, 20);
    emitEvent('vehicle:jacked', { vehicle: this, driver: a });
    enterVehicle(this);
  },
  shouldDespawn() {
    if (this.driver === P) return false;
    const d = Math.hypot(this.x - P.x, this.z - P.z);
    if (this.dead) return (this.deadT > 30 && d > 40) || d > 150;
    if (this.model.police && d > 150) return true;
    if (this.mode === 'traffic') return d > this.K.trafficDespawn;
    return !this.home && d > 260;
  },
  dispose() {
    if (this.driver && this.driver !== P) removeEntity(this.driver);
    scene.remove(this.mesh.grp); if (this.K.dispose) this.K.dispose(this);
  },
  // put an NPC on board; it rides along until ejected
  seatDriver(n) { this.driver = n; n.vehicle = this; n.become('ride'); this.K.seat(this, n.c); n.yaw = this.yaw; },
  // throw the NPC driver off; survivors run, the rest slide along the road
  ejectDriver(survive) {
    const a = this.driver; if (!a || a === P) return;
    this.driver = null; a.vehicle = null;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), s = this.K.seatZ(this);
    // out of a car's door, or off the back of a bike and along the road
    if (this.K.enclosed) { const at = this.K.exitAt(this); a.x = at.x; a.z = at.z; } else { a.x = this.x + fx * s; a.z = this.z + fz * s; }
    a.yaw = this.yaw; this.K.unseat(this, a.c); a.place();
    const slide = survive || this.K.enclosed ? 0 : 0.7; a.svx = fx * this.v * slide; a.svz = fz * this.v * slide;
    a.become('wander');
    if (survive) { a.state = 'flee'; a.timer = 9; a.fx = P.x; a.fz = P.z; a.panic = true; }
    this.K.onDriverGone(this);
  },
};

export function spawnVehicle(model, x, z, yaw, mode = 'parked') {
  const M = typeof model === 'string' ? VEHICLE_MODELS[model] : model;
  if (!M) throw new Error('unknown vehicle model ' + model);
  const K = KINDS[M.kind], speed = M.traffic && M.traffic.speed || [10, 10];
  const v = Object.assign(Object.create(Vehicle), {
    model: M, K, H: Object.assign({}, K.handling, M.handling), x, z, yaw, v: 0, steer: 0, hp: M.hp,
    dead: false, burnT: 0, deadT: 0, mode, driver: null, byPlayer: false, home: false,
    dirX: Math.round(Math.sin(yaw)), dirZ: Math.round(Math.cos(yaw)), top: rnd(speed[0], speed[1]), ignoreT: 0, waitT: 0, hornT: 0, turnCd: 0,
  });
  if (K.init) K.init(v);
  v.mesh = K.build(v);
  scene.add(v.mesh.grp); addEntity(v); K.pose(v, 0); return v;
}

export const vehicles = () => all('vehicle');

// ---- the player at the controls ----
const controls = () => ({
  throttle: !!(keys.KeyW || keys.ArrowUp), brake: !!(keys.KeyS || keys.ArrowDown), boost: !!(keys.ShiftLeft || keys.ShiftRight), handbrake: !!keys.Space,
  steer: ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0),
});
export function driveByPlayer(v, dt) {
  const K = v.K;
  K.drive(v, dt, controls());
  if (ram(v)) v.shoveT = G.time + 0.3;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), nx = v.x, nz = v.z;
  // just after a shove the cars are still parting: that already took our speed, so don't stop dead against it too
  if (K.collideSelf(v) && !(v.shoveT > G.time)) {
    // how squarely we hit: the push-out direction against our direction of travel
    const px = v.x - nx, pz = v.z - nz, pl = Math.hypot(px, pz) || 1, head = Math.max(0, -(px * fx + pz * fz) / pl * Math.sign(v.v)), impact = Math.abs(v.v) * head;
    v.v = impact > 7 ? -Math.sign(v.v) * impact * 0.12 : v.v * (1 - head * 0.9);
    if (impact > 7) {
      Sound.thud(clamp(impact / 25, 0.3, 1), panFor(-px, -pz, cam.yaw, 0)); cam.shake = Math.max(cam.shake, clamp(impact / 40, 0.1, 0.7));
      v.damage(impact * 1.6, false); if (impact > 15 && P.vehicle === v) hurtPlayer((impact - 13) * K.crash.hurt);
      if (P.vehicle !== v) return;
    }
  }
  // running people over
  const bm = K.bumper;
  if (Math.abs(v.v) > 4) for (const a of all('npc')) {
    if (!a.alive || (a.bumpT || 0) > G.time) continue;
    const rx = a.x - v.x, rz = a.z - v.z, ah = (rx * fx + rz * fz) * Math.sign(v.v), la = Math.abs(rx * fz - rz * fx);
    if (ah > bm.back && ah < bm.front && la < bm.half) {
      a.bumpT = G.time + 0.8; a.hurt(Math.abs(v.v) * 6, new THREE.Vector3(fx, 0, fz), true);
      if (a.alive && !a.vehicle) { a.x += fx * Math.sign(v.v) * 1.2; a.z += fz * Math.sign(v.v) * 1.2; }
      v.v *= bm.slow; Sound.thud(0.6, panFor(rx, rz, cam.yaw, 0)); cam.shake = Math.max(cam.shake, 0.2); alarm(v.x, v.z, 25);
    }
  }
  if (K.afterDrive) K.afterDrive(v, dt);
  // camera swings in behind when the mouse is idle
  if (G.time - (P.lookT || 0) > 1.2 && Math.abs(v.v) > 3 && !I.mouseR) cam.yaw += angDiff(cam.yaw, v.yaw) * Math.min(1, dt * 2.2);
  P.x = v.x; P.z = v.z; P.y = 0; P.vy = 0; P.grounded = true; P.yaw = v.yaw; P.moveSpeed = Math.abs(v.v); P.vx = fx * v.v; P.vz = fz * v.v;
}

// send lighter vehicles we drive into flying and shove cars along (see knock.js); anything we only bump stops
// us as usual. True when we shoved something, which has already taken the speed and damage off us.
function ram(v) {
  if (!v.K.ram || !v.v) return false;
  let shoved = false;
  for (const b of all('vehicle')) {
    if (b === v || b.driver === P || b.ghostT > G.time || Math.abs(b.x - v.x) > 6 || Math.abs(b.z - v.z) > 6) continue;
    if (b.K.slide) {
      const k = shoveImpulse(v, b); if (!k) continue;
      shove(v, b, k, true); shoved = true;
      // what's left of our speed, along the way we're pointing
      v.v = k.avx * Math.sin(v.yaw) + k.avz * Math.cos(v.yaw);
      const hit = k.closing - 6; if (hit > 0) v.damage(hit * 1.4, false);
      if (k.closing > 16 && P.vehicle === v) hurtPlayer((k.closing - 14) * v.K.crash.hurt);
      Sound.thud(clamp(k.closing / 25, 0.3, 1), panFor(b.x - v.x, b.z - v.z, cam.yaw, 0)); cam.shake = Math.max(cam.shake, clamp(k.closing / 40, 0.1, 0.7));
      if (k.closing > 8) alarm(v.x, v.z, 25);
      continue;
    }
    if (b.dead || !touching(v, b)) continue;
    const k = knockImpulse(v, b); if (!k) continue;
    const a = b.driver;
    if (a) { b.ejectDriver(false); a.svx = k.vx * 0.7; a.svz = k.vz * 0.7; a.hurt(k.closing * 4, new THREE.Vector3(k.vx, 0, k.vz).normalize(), true); }
    b.ghostT = G.time + 0.6; b.K.knock(b, k.vx, k.vz, k.up); b.damage(k.closing * 1.2, true);
    v.v *= k.keep;
    Sound.thud(clamp(k.closing / 25, 0.3, 1), panFor(b.x - v.x, b.z - v.z, cam.yaw, 0)); cam.shake = Math.max(cam.shake, clamp(k.closing / 50, 0.1, 0.5)); alarm(v.x, v.z, 25);
    emit(b.x, 0.8, b.z, 8, '#ffd23e', 5, 0.35, 0.06);
  }
  return shoved;
}

// `b` takes a shove from `a`: it skids off, a hard hit dents it, and a driver in traffic sits stunned a moment
function shove(a, b, k, byPlayer) {
  b.kvx = k.vx; b.kvz = k.vz; b.kspin = k.spin; b.v = 0;
  const hit = k.closing - 6; if (hit > 0) b.damage(hit * 1.4, byPlayer);
  if (b.mode === 'traffic') b.dazeT = clamp(k.closing * 0.12, 0.6, 2.5);
  if (k.closing > 5) emit((a.x + b.x) / 2, 0.7, (a.z + b.z) / 2, Math.min(12, k.closing | 0), '#ffd23e', 5, 0.3, 0.06);
  emitEvent('vehicle:shoved', { vehicle: b, by: a, closing: k.closing, byPlayer });
}

// a car skidding along hands its momentum on to the cars it runs into (but not to the player's, which drives itself)
function shoveAround(v) {
  if (!v.K.ram || Math.hypot(v.kvx || 0, v.kvz || 0) < 2) return;
  for (const b of all('vehicle')) {
    if (b === v || !b.K.slide || b.driver === P || Math.abs(b.x - v.x) > 6 || Math.abs(b.z - v.z) > 6) continue;
    const k = shoveImpulse(v, b); if (!k) continue;
    shove(v, b, k, v.byPlayer); v.kvx = k.avx; v.kvz = k.avz;
    Sound.thud(clamp(k.closing / 25, 0.2, 0.8) * vol3d(v.x, v.z), pan3d(v.x, v.z));
  }
}

// something ahead of a vehicle on its lane: 'player', 'ped' or 'car' (any vehicle)
export function blockedAhead(v, range, ignoreVehicles) {
  const fx = v.dirX, fz = v.dirZ;
  const test = (x, z, lat) => { const rx = x - v.x, rz = z - v.z, ah = rx * fx + rz * fz, la = Math.abs(rx * -fz + rz * fx); return ah > 0 && ah < range && la < lat; };
  if (P.alive && test(P.x, P.z, 1.8)) return 'player';
  const list = all();
  for (const n of list) if (onFoot(n) && test(n.x, n.z, 1.6)) return 'ped';
  if (!ignoreVehicles) for (const o of list) if (o.kind === 'vehicle' && o !== v && o !== P.vehicle && test(o.x, o.z, o.K.laneHalf)) return 'car';
  return null;
}
