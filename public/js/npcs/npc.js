import { Sound } from '../core/audio.js';
import { emit as emitEvent } from '../core/events.js';
import { pan3d, vol3d } from '../core/spatial.js';
import { P, cam } from '../core/state.js';
import { angDiff, lerp, rnd } from '../core/util.js';
import { deathAnim, disposeChar, makeCharacter, setGun } from '../characters/character.js';
import { addEntity, all } from '../entities/registry.js';
import { bloodPool, emit } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { collide, isFree, onRoad, raySphere } from '../world/collision.js';
import { zoneDamage, zoneOnBody } from '../combat/hitzones.js';
import { BEHAVIOURS } from './behaviours.js';
import { airborne, blastLaunch, flyStep, launch, settleFlip } from './fling.js';
import { NPC_TYPES, makeLook } from './types.js';

// A person in the world. Shared behaviour lives on this prototype; what they do each frame comes
// from their behaviour (npcs/behaviours.js) and their numbers from their type (npcs/types.js).
const Npc = {
  kind: 'npc',
  blipLayer: 3,
  update(dt) {
    if (this.vehicle) return; // whatever they ride moves and poses them
    if (!this.alive) {
      // a body thrown by a blast flies first; one thrown off a bike slides to a stop
      if (airborne(this)) { flyStep(this, dt); collide(this, 0.3); }
      else {
        if (this.svx || this.svz) { this.x += this.svx * dt; this.z += this.svz * dt; const k = Math.max(0, 1 - dt * 2.5); this.svx *= k; this.svz *= k; if (Math.abs(this.svx) + Math.abs(this.svz) < 0.2) this.svx = this.svz = 0; collide(this, 0.3); }
        settleFlip(this, dt);
      }
      deathAnim(this, dt); this.place(); return;
    }
    if (this.stagT > 0 || this.downT > 0) { this.reel(dt); return; }
    BEHAVIOURS[this.behaviour].update(this, dt);
  },
  // a melee blow from the player (combat/melee.js): { dmg, zone, dir (from the player), knock, down, blade }.
  // Whoever survives reels back, or goes down and gets up again; a hard blow throws the dead.
  meleeHit(h) {
    if (!this.alive) return;
    const heavy = this.def.scale ? 3 : 1, knock = h.knock / heavy;
    this.hurt(h.dmg, h.dir, true, h.blade ? 1 : 0.5);
    if (!this.alive) {
      if (knock >= 3) launch(this, { vx: h.dir.x * knock * 0.9, vz: h.dir.z * knock * 0.9, vy: knock * 0.55, spin: knock * 0.9 });
      else { this.svx = h.dir.x * knock; this.svz = h.dir.z * knock; }
      return;
    }
    this.svx = h.dir.x * knock; this.svz = h.dir.z * knock; this.stagT = 0.35;
    this.yaw = Math.atan2(-h.dir.x, -h.dir.z); this.swing = null;
    if (h.down && heavy === 1) { this.downT = 1.8; this.panic = false; }
    // some people hit back
    if (this.behaviour === 'wander' && !h.down && Math.random() < (this.def.fightBack || 0)) this.become('brawl');
  },
  // knocked back or knocked down: slide, fall, lie there a moment and get up
  reel(dt) {
    const c = this.c, k = Math.max(0, 1 - dt * 6);
    this.x += (this.svx || 0) * dt; this.z += (this.svz || 0) * dt; this.svx *= k; this.svz *= k; collide(this, this.r);
    this.moveSpeed = 0;
    if (this.downT > 0) {
      this.downT -= dt; this.stagT = 0;
      const f = this.downT > 0.5 ? Math.min(1, (1.8 - this.downT) / 0.22) : Math.max(0, this.downT / 0.5);
      c.body.rotation.x = -Math.PI / 2 * f * f; c.body.position.y = 0.12 * f;
      c.armR.rotation.x = lerp(c.armR.rotation.x, -2.6 * f, 0.3); c.armL.rotation.x = lerp(c.armL.rotation.x, -2.9 * f, 0.3);
    } else {
      this.stagT -= dt; c.body.rotation.x = 0.3 * Math.max(0, this.stagT / 0.35);
    }
    if (this.stagT <= 0 && this.downT <= 0) { this.stagT = this.downT = 0; c.body.rotation.x = 0; c.body.position.y = 0; }
    this.place();
  },
  place() { this.c.root.position.set(this.x, this.y || 0, this.z); this.c.root.rotation.set(this.flip || 0, this.yaw, 0, 'YXZ'); },
  raycast(o, d, maxT) {
    if (!this.alive || (this.vehicle && this.vehicle.K.enclosed)) return null; // inside a car, the car decides what a shot hits
    const s = this.def.scale || 1, yo = this.vehicle ? 0.15 : 0;
    let best = null;
    const test = (y, r, head) => { const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, this.x, y * s + yo, this.z, r * s); if (t < maxT && (!best || t < best.t)) best = { t, head }; };
    test(1.05, 0.44, false); test(0.5, 0.32, false); test(1.74, 0.2, true);
    if (best) best.zone = best.head ? 'head' : zoneOnBody(o, d, best.t, this.x, this.z, this.yaw, yo, s);
    return best;
  },
  onShot(hit, dmg, dir) { const zone = hit.zone || (hit.head ? 'head' : 'torso'); this.hurt(zoneDamage(dmg, zone), dir, true); return { head: zone === 'head', zone }; },
  blast(x, y, z, R, dmg, byPlayer) {
    if (!this.alive) return; const d = Math.hypot(this.x - x, this.z - z); if (d >= R) return;
    this.hurt(dmg * (1 - d / R) + 30, new THREE.Vector3(this.x - x, 0, this.z - z).normalize().negate(), !!byPlayer);
  },
  // after a blast has done its damage, the dead within reach (old bodies and fresh ones) are thrown
  fling(x, y, z, R, power) {
    if (this.alive || this.vehicle) return;
    const l = blastLaunch(this.x - x, this.z - z, R, Math.random, power); if (l) launch(this, l);
  },
  hurt(dmg, dir, byPlayer, blood = 1) {
    if (!this.alive) return;
    this.hp -= dmg;
    emit(this.x, 1.2, this.z, Math.round(6 * blood), '#c0142c', 3.5, 0.5, 0.09);
    const b = BEHAVIOURS[this.behaviour]; if (b.onHurt) b.onHurt(this, byPlayer);
    if (this.hp <= 0) this.kill(dir, byPlayer);
  },
  kill(dir, byPlayer) {
    const vehicle = this.vehicle; if (vehicle) vehicle.ejectDriver(false);
    this.alive = false; this.deadT = 0; this.aiming = false; this.panic = false; this.moveSpeed = 0; this.swing = null; this.melee = null; this.stagT = this.downT = 0;
    if (dir) this.yaw = Math.atan2(-dir.x, -dir.z);
    bloodPool(this.x, this.z); emit(this.x, 1, this.z, 10, '#a30f24', 4, 0.7, 0.1);
    if (this.c.gun) setGun(this.c, null);
    if (this.def.screams) Sound.scream(vol3d(this.x, this.z), pan3d(this.x, this.z));
    emitEvent('npc:killed', { npc: this, byPlayer, dir, vehicle });
  },
  // switch to another behaviour, e.g. a biker who lands on foot starts wandering
  become(behaviour) { this.behaviour = behaviour; const b = BEHAVIOURS[behaviour]; if (b.init) b.init(this); },
  blip(radar) {
    const r = this.def.radar; if (!r || !this.alive || this.vehicle) return;
    radar.dot(this.x, this.z, r === 'siren' ? (radar.flash ? '#ff3b4e' : '#4a7dff') : r, 7, true);
  },
  shouldDespawn() {
    if (this.vehicle) return false;
    return Math.hypot(this.x - P.x, this.z - P.z) > this.def.despawn || (!this.alive && this.deadT > 25);
  },
  dispose() { disposeChar(this.c); },
};

export function spawnNpc(type, x, z) {
  const def = NPC_TYPES[type]; if (!def) throw new Error('unknown NPC type ' + type);
  const c = makeCharacter(makeLook(def)); if (def.gun) setGun(c, def.gun);
  const n = Object.assign(Object.create(Npc), { type, def, faction: def.faction, c, x, z, yaw: rnd(0, 6.28), hp: def.hp, alive: true, r: def.scale ? 0.5 : 0.38, moveSpeed: 0, deadT: 0, aiming: false, aimPitch: 0, twoHand: !!def.gun && def.gun !== 'pistol', panic: false, vehicle: null });
  n.become(def.behaviour);
  c.root.position.set(x, 0, z); scene.add(c.root); addEntity(n); return n;
}

export const npcs = () => all('npc');
// people on foot: the ones who walk, flee, get pushed around and block traffic
export const onFoot = n => n.kind === 'npc' && n.alive && !n.vehicle;

// a free spot around the player, optionally behind the camera so spawns are not seen popping in
export function findSpot(minD, maxD, avoidView, allowRoad) {
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, Math.PI * 2), d = rnd(minD, maxD), x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    if (!isFree(x, z, 1)) continue;
    if (!allowRoad && onRoad(x, z) && i < 22) continue;
    if (avoidView && i < 20 && (Math.cos(a) * fx + Math.sin(a) * fz) > 0.35) continue;
    return { x, z };
  }
  return null;
}
export function moveActor(a, dx, dz, speed, dt, r) {
  const ox = a.x, oz = a.z;
  a.x += dx * speed * dt; a.z += dz * speed * dt;
  collide(a, r || 0.38);
  const moved = Math.hypot(a.x - ox, a.z - oz);
  a.moveSpeed = lerp(a.moveSpeed, moved / Math.max(dt, 1e-4), 0.3);
  return moved < speed * dt * 0.35;
}
export function faceTo(a, yaw, dt, rate) { a.yaw += angDiff(a.yaw, yaw) * Math.min(1, dt * (rate || 10)); }
// gunfire or a crash at x, z: people within r react however their behaviour says
export function alarm(x, z, r) {
  for (const n of npcs()) {
    if (!onFoot(n)) continue; const b = BEHAVIOURS[n.behaviour];
    if (b.onAlarm && Math.hypot(n.x - x, n.z - z) < r) b.onAlarm(n, x, z);
  }
}
