import { bulletImpact, castBullet, explosion } from '../combat/combat.js';
import { SIGHT_EVERY, aimFalloff, newSight, reactTo } from '../combat/sight.js';
import { Sound } from '../core/audio.js';
import { at } from '../core/spatial.js';
import { G, P, cam } from '../core/state.js';
import { angDiff, clamp, rnd } from '../core/util.js';
import { addEntity, all, removeEntity } from '../entities/registry.js';
import { reward } from '../game/pickups.js';
import { hurtPlayer } from '../game/player.js';
import { addHeat } from '../game/wanted.js';
import { emit, muzzleFlash, tracer } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { showBig } from '../ui/hud.js';
import { groundAt } from '../world/city.js';
import { blocked, raySphere, tallBoxes } from '../world/collision.js';
import { SKID, buildHeliMesh, makePilot, seatPilot, slump } from './heli-mesh.js';
import { makeSearchlight, newShade, removeSearchlight, shineAt, showSearchlight } from './searchlight.js';
import { spawnVehicle } from './vehicle.js';

// ================= HELICOPTER =================
// The 4+ star chopper: circles the player, sweeps a searchlight and fires minigun bursts.
// It takes about 20 rifle hits or one direct rocket, smokes as it weakens and spins down when killed.
export const HELI_HP = 1400;
// hit volumes in the chopper's own frame: the cabin, the tail boom and the rotor disc
const BODY_R = 3, TAIL_BACK = 4.4, TAIL_R = 1.6, ROTOR_Y = 1, ROTOR_R = 4.5;
// the searchlight hangs under the cabin
export const BEAM_Y = -0.8;
// the crash goes off like a vehicle explosion, only bigger than a car's (r 9, dmg 240): it wrecks the cars and drops the people
// it comes down among, and throws the dead and the wrecks harder
export const CRASH_BLAST = { y: 1, r: 12, dmg: 300, power: 1.4 };
// Altitude: it cruises at CRUISE_Y and never comes lower; a player up on a roof (or a jetpack) pulls it up to ABOVE metres
// over their feet so it can still look down on them. Wherever it flies it keeps CLEAR metres over every roof within PAD
// of the cabin (the rotor and tail reach out ~5 m), looking LOOK seconds ahead along its path so it climbs before a
// tower rather than into it, and it holds its ground while still too low to pass one.
export const CRUISE_Y = 28;
const ABOVE = 10, CLEAR = 8, PAD = 7, LOOK = 2, CLIMB = 14, SINK = 6, SPEED = 16;
// the minigun keeps its full hit chance out to this range (about its cruising height), then misses more (combat/sight.js)
export const HELI_AIM_CLOSE = 32;
// the pilot can be shot through the canopy: head and chest, as spheres round the seated body
export const PILOT = { hp: 70, head: 2.5, headR: 0.24, chestR: 0.36 };
// With the pilot dead the rotors wind down and it drops, the blades still slowing the fall to at most DOWN.fall m/s.
// It comes down hard but in one piece, crushing what it lands on, and stays there for the player to fly (kinds/heli.js).
export const DOWN = { gravity: 12, fall: 14, spinDown: 0.6, crush: 3.2, crushDmg: 200, cash: 1000, heat: 4 };
const searchlightShadeOf = newShade();
const _o = new THREE.Vector3(), _p = new THREE.Vector3();
const Heli = {
  kind: 'heli',
  blipLayer: 4,
  update(dt) {
    const h = this;
    h.rotor.rotation.y += dt * 30 * h.spin; h.rotor2.rotation.y = h.rotor.rotation.y;
    // damage shows: grey smoke below 60%, thick black smoke and sparks below 30%
    const hpF = h.hp / HELI_HP;
    if (!h.falling && hpF < 0.6 && Math.random() < (hpF < 0.3 ? 0.9 : 0.4)) {
      emit(h.x, h.y + 0.6, h.z, 1, hpF < 0.3 ? '#2a2430' : '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
      if (hpF < 0.3 && Math.random() < 0.3) emit(h.x, h.y + 0.6, h.z, 1, '#ff8a3a', 2, 0.3, 0.25, 0, 1);
    }
    if (h.falling) {
      h.vy -= 14 * dt; h.y += h.vy * dt; h.grp.rotation.y += dt * 5; h.grp.rotation.z += dt * 0.6;
      if (Math.random() < 0.8) emit(h.x, h.y, h.z, 1, '#3a3240', 2, 1.5, 0.8, 2, 1);
      // it comes down on whatever is under it, the street or a roof
      const floor = roofTop(h.x, h.z, 0) + CRASH_BLAST.y;
      if (h.y <= floor) { explosion(h.x, floor, h.z, CRASH_BLAST.r, CRASH_BLAST.dmg, true, CRASH_BLAST.power); removeHeli(40); return; }
      h.grp.position.set(h.x, h.y, h.z); return;
    }
    if (h.downed) { comeDown(h, dt); return; }
    if (G.wanted < 4) {
      const ux = Math.sin(h.yaw), uz = Math.cos(h.yaw);
      h.y += Math.max(8, Math.min(CLIMB, safeY(h.x, h.z, ux, uz, 20 * LOOK) - h.y)) * dt; fly(h, ux, uz, 20 * dt);
      h.beam.visible = h.spot.visible = false;
      h.grp.position.set(h.x, h.y, h.z);
      if (h.y > 70) removeHeli(20);
      return;
    }
    h.beam.visible = h.spot.visible = true;
    h.ang += dt * 0.22;
    const tx = P.x + Math.cos(h.ang) * 26, tz = P.z + Math.sin(h.ang) * 26;
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
    const ux = d > 0.01 ? dx / d : 0, uz = d > 0.01 ? dz / d : 0;
    const want = Math.max(heliTarget(), safeY(h.x, h.z, ux, uz, Math.min(d, SPEED * LOOK)));
    h.y += clamp(want - h.y, -SINK, CLIMB) * dt;
    fly(h, ux, uz, Math.min(d, SPEED * dt));
    h.yaw += angDiff(h.yaw, Math.atan2(P.x - h.x, P.z - h.z)) * dt * 2;
    h.grp.position.set(h.x, h.y + Math.sin(G.time * 1.3) * 0.3, h.z); h.grp.rotation.set(0.12, h.yaw, 0);
    h.lr.visible = (G.time * 2 | 0) % 2 === 0;
    aimLight(h);
    const dist = Math.hypot(P.x - h.x, P.z - h.z, h.y);
    h.losT -= dt;
    if (h.losT <= 0) { h.los = P.alive && dist < 80 && !blocked(h.x, h.y - 1, h.z, P.x, P.y + 1, P.z); h.losT = SIGHT_EVERY; }
    // the minigun only opens up on a player in view, after a short reaction, and stops when they duck out of sight
    const ready = reactTo(h.sight, h.los && dist < 70, dt);
    if (!h.los) h.burst = 0;
    h.fireT -= dt;
    if (h.burst > 0) {
      h.burstT -= dt;
      if (h.burstT <= 0) {
        h.burst--; h.burstT = 0.09;
        const from = new THREE.Vector3(h.x, h.y - 1, h.z), to = new THREE.Vector3(P.x, P.y + 1, P.z);
        const hit = Math.random() < 0.2 * aimFalloff(dist, HELI_AIM_CLOSE) && !blocked(from.x, from.y, from.z, to.x, to.y, to.z);
        muzzleFlash(from); Sound.shot('minigun', 0.6, at(h, -0.5));
        if (hit) { tracer(from, to, true); hurtPlayer(5); Sound.impact('flesh', 1, to); } else {
          // a miss rakes the ground (or a wall, a car, a palm) round the player
          to.add(new THREE.Vector3(rnd(-2, 2), rnd(-1, 0.5), rnd(-2, 2)));
          const b = castBullet(from, to.clone().sub(from).normalize(), from.distanceTo(to) + 30, h);
          tracer(from, b.kind === 'none' ? to : b.p, true); bulletImpact(b);
        }
      }
    } else if (h.fireT <= 0 && ready) { h.burst = 10; h.fireT = rnd(2.5, 3.5); }
    if (h.los) G.seenNow = true;
  },
  raycast(o, d, maxT) {
    const h = this; if (h.falling) return null;
    let t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, h.x, h.y, h.z, BODY_R);
    // through the canopy, a shot can find the pilot instead of the bodywork
    if (t < maxT && !h.downed) { const p = pilotHit(h, o, d, maxT); if (p) return p; }
    const tx = h.x - Math.sin(h.yaw) * TAIL_BACK, tz = h.z - Math.cos(h.yaw) * TAIL_BACK;
    t = Math.min(t, raySphere(o.x, o.y, o.z, d.x, d.y, d.z, tx, h.y + 0.3, tz, TAIL_R));
    // the spinning blades read as a solid disc
    if (Math.abs(d.y) > 1e-4) {
      const tr = (h.y + ROTOR_Y - o.y) / d.y;
      if (tr > 0 && Math.hypot(o.x + d.x * tr - h.x, o.z + d.z * tr - h.z) < ROTOR_R) t = Math.min(t, tr);
    }
    return t < maxT ? { t } : null;
  },
  onShot(hit, dmg) {
    if (!hit.occupant) { this.damage(dmg); return { head: false }; }
    const h = this; h.pilotHp -= dmg * (hit.head ? PILOT.head : 1);
    if (hit.p) emit(hit.p.x, hit.p.y, hit.p.z, 4, '#cfe6ff', 4, 0.3, 0.05); // the canopy cracks
    if (h.pilotHp <= 0) pilotDown(h);
    return { head: hit.head };
  },
  onRocket(dmg) { this.damage(dmg * 2); },
  blast(x, y, z, R, dmg) { if (Math.hypot(this.x - x, this.y - y, this.z - z) < R + 3) this.damage(dmg); },
  damage(dmg) {
    const h = this; if (h.falling) return; h.hp -= dmg; emit(h.x, h.y, h.z, 4, '#ffd23e', 7, 0.3, 0.16);
    if (h.hp <= 0) { h.falling = true; h.vy = Math.min(h.vy, 0); showSearchlight(h.light, false); reward(h.x, h.z, 2000, 'Chopper down'); addHeat(10); }
  },
  blip(radar) { radar.dot(this.x, this.z, radar.flash ? '#ffd23e' : '#ff3b4e', 11, true, 'sq'); },
  dispose() { scene.remove(this.grp); removeSearchlight(this.light); },
};

// the pilot's head and chest along a ray, or null: { t, head, zone, occupant }
function pilotHit(h, o, d, maxT) {
  h.grp.updateMatrixWorld(true);
  let best = null;
  for (const [y, r, head] of [[1.74, PILOT.headR, true], [1.2, PILOT.chestR, false]]) {
    h.seat.localToWorld(_p.set(0, y, 0));
    const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, _p.x, _p.y, _p.z, r);
    if (t < maxT && (!best || t < best.t)) best = { t, head, zone: head ? 'head' : 'torso', occupant: true };
  }
  return best;
}
// The pilot is dead: the searchlight and the guns go quiet, the rotors start winding down and the chopper drops.
function pilotDown(h) {
  if (h.downed || h.falling) return;
  h.downed = true; h.vy = 0; h.burst = 0; slump(h.pilot); showSearchlight(h.light, false);
  reward(h.x, h.z, DOWN.cash, 'Pilot down'); addHeat(DOWN.heat);
}
// The pilotless chopper comes down, spinning a little as the tail rotor slows, and lands hard on whatever is under it:
// the street or a roof. It crushes anyone and dents anything it lands on, then stays there as a chopper the player
// can fly (a vehicle of kind 'heli', kinds/heli.js); the next police chopper may come a while later.
function comeDown(h, dt) {
  h.spin = Math.max(0.15, h.spin - dt * DOWN.spinDown);
  h.vy = Math.max(-DOWN.fall, h.vy - DOWN.gravity * dt); h.y += h.vy * dt;
  h.yaw += dt * 1.4 * (1 - h.spin);
  if (Math.random() < 0.5) emit(h.x, h.y + 0.6, h.z, 1, '#8a8490', 1.5, 1.4, 0.6, 1.5, 1);
  const floor = Math.max(roofTop(h.x, h.z, 0), groundAt(h.x, h.z));
  h.grp.position.set(h.x, h.y, h.z); h.grp.rotation.set(0.12 * h.spin, h.yaw, 0);
  if (h.y - SKID > floor) return;
  const impact = -h.vy;
  touchDown(h.x, floor, h.z, impact);
  const v = spawnVehicle('heli', h.x, h.z, h.yaw);
  v.y = floor; v.hp = Math.max(1, h.hp); v.rotor = h.spin; v.pilotDead = true; v.K.pose(v, 0);
  removeHeli(40);
}
// the thump of a chopper landing hard: dust, a shudder, and whoever is under it is crushed
function touchDown(x, y, z, impact) {
  emit(x, y + 0.3, z, 18, '#cfc8d8', 5, 0.9, 0.5, 1, 1.5);
  Sound.thud(1, { x, y, z });
  cam.shake = Math.max(cam.shake, clamp(1 - Math.hypot(P.x - x, P.z - z, P.y - y) / 40, 0, 1) * 0.6);
  for (const e of all()) {
    if (e.removed || Math.hypot(e.x - x, e.z - z) > DOWN.crush) continue;
    if (e.kind === 'npc' && e.alive && !e.vehicle) e.hurt(DOWN.crushDmg, new THREE.Vector3(0, -1, 0), true);
    else if (e.kind === 'vehicle' && !e.dead) e.damage(impact * 8, true, true);
  }
  if (P.alive && !P.vehicle && Math.hypot(P.x - x, P.z - z) < DOWN.crush && Math.abs(P.y - y) < 2) hurtPlayer(DOWN.crushDmg);
}

// the highest building top within `pad` of (x, z), 0 over open street
export function roofTop(x, z, pad = PAD) {
  let top = 0;
  for (const b of tallBoxes) if (b.h > top && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) top = b.h;
  return top;
}
// the lowest it may fly here and over the next `ahead` metres along (ux, uz)
export function safeY(x, z, ux, uz, ahead) {
  let y = 0;
  for (let s = 0; s <= ahead; s += PAD) y = Math.max(y, roofTop(x + ux * s, z + uz * s) + CLEAR);
  return Math.max(y, roofTop(x + ux * ahead, z + uz * ahead) + CLEAR);
}
// the height it chases: CRUISE_Y, or higher over a player who is up high
export function heliTarget() { return Math.max(CRUISE_Y, P.y + ABOVE); }
// move `step` metres along (ux, uz), unless that would put the cabin into a building: then it hovers and climbs first
function fly(h, ux, uz, step) {
  const nx = h.x + ux * step, nz = h.z + uz * step;
  if (h.y - 3 < roofTop(nx, nz)) return;
  h.x = nx; h.z = nz;
}

// The searchlight points at the street under the player and stops at the first building in the way:
// the beam ends there and the spot of light lands on that wall or roof instead of the street.
export function aimLight(h) {
  const p = h.grp.position;
  _o.set(p.x, p.y + BEAM_Y, p.z);
  return shineAt(h.light, _o, P.x, groundAt(P.x, P.z), P.z);
}
export const searchlightShade = searchlightShadeOf;

export function spawnHeli() {
  const m = buildHeliMesh(), light = makeSearchlight(searchlightShadeOf), pilot = makePilot();
  seatPilot(m.seat, pilot);
  const a = rnd(0, 6.28), x = P.x + Math.cos(a) * 120, z = P.z + Math.sin(a) * 120;
  const h = Object.assign(Object.create(Heli), { grp: m.grp, rotor: m.rotor, rotor2: m.rotor2, lr: m.lr, seat: m.seat, pilot, light, beam: light.beam, spot: light.spot, x, z, y: Math.max(34, heliTarget(), roofTop(x, z) + CLEAR), hp: HELI_HP, pilotHp: PILOT.hp, alive: true, ang: a, fireT: 3, burst: 0, burstT: 0, los: false, losT: 0, sight: newSight(), vy: 0, falling: false, downed: false, spin: 1, yaw: 0 });
  m.grp.position.set(h.x, h.y, h.z); scene.add(m.grp);
  G.heli = addEntity(h);
  showBig('Chopper inbound');
}
// clear the chopper away; the next one may come `cooldown` seconds later
export function removeHeli(cooldown) {
  if (!G.heli) return;
  removeEntity(G.heli); G.heli = null;
  if (cooldown != null) G.heliT = cooldown;
}
