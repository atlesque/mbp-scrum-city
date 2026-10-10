import { kb } from '../../core/controls.js';
import { emit as emitEvent } from '../../core/events.js';
import { G, P } from '../../core/state.js';
import { seatedLegs } from '../../characters/character.js';
import { angDiff, clamp, lerp, rnd } from '../../core/util.js';
import { emit } from '../../render/effects.js';
import { scene } from '../../render/scene.js';
import { groundAt } from '../../world/city.js';
import { collide, pushOutOBB, raySphere } from '../../world/collision.js';
import { all } from '../../entities/registry.js';
import { driftDrive, followLane, keepLane, keepOnGrid } from '../drive.js';
import { blockedAhead, lightsOn, smash } from '../vehicle.js';
import { skidMark } from '../skids.js';
import { rolling, spinWheels } from '../wheels.js';

// The body of a car, in its own space (+z forward): half width and half length, the bottom of the windows (shots above
// it reach whoever is inside), the wheels (half the track and half the wheelbase), how tall it is for bullets, the
// circles along it that keep it out of walls, and the shape of its top for a bike riding over it (topAt): height along
// the length, front first, and across. A bigger body (the fire truck, kinds/truck.js) makes its own kind with carKind.
const SEDAN = {
  hw: 1.0, hl: 2.15, sill: 0.95, wx: 0.82, wz: 1.35, h: 1.55, circles: [1.15, -1.15], front: 2.2,
  along: [[2.15, 0.75], [1.85, 0.95], [1.05, 1.02], [0.35, 1.5], [-0.75, 1.5], [-1.2, 1.05], [-1.8, 1.0], [-2.15, 0.8]],
  across: [[1.0, 0.85], [0.65, 1.5], [0, 1.5]],
};
const SKID = 3; // sideways speed (m/s) above which the tyres squeal, smoke and leave marks
const profile = (pts, t) => { for (let i = 1; i < pts.length; i++) { const [t1, h1] = pts[i], [t0, h0] = pts[i - 1]; if (t >= t1) return lerp(h1, h0, (t - t1) / (t0 - t1)); } return pts[pts.length - 1][1]; };

// the circles along a car's body, out in the world; `settle` then moves the car by half of what pushing them out moved
// them all together (for two circles, to halfway between them, as a car always did)
const circlesOf = c => { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); return c.K.body.circles.map(l => ({ x: c.x + fx * l, z: c.z + fz * l, x0: c.x + fx * l, z0: c.z + fz * l })); };
function settle(c, pts) { for (const p of pts) { c.x += (p.x - p.x0) / 2; c.z += (p.z - p.z0) / 2; } }

// Cars: four wheels, no lean, the driver sits inside out of sight. See kinds/bike.js for what each field means.
// AI traffic keeps its body out of other cars' instead of driving through them
function keepApart(c) {
  const pts = circlesOf(c);
  let hit = false;
  for (const o of all('vehicle')) {
    if (o === c || !o.K.enclosed || Math.abs(o.x - c.x) > 9 || Math.abs(o.z - c.z) > 9) continue;
    for (const p of pts) if (o.pushOut(p, c.K.body.hw)) hit = true;
  }
  if (hit) settle(c, pts);
  return hit;
}

// a car kind for body `B` (see SEDAN); `extra(K)` returns what to override of the car kind K (handling, camera, blast, ...)
export function carKind(B = SEDAN, extra = () => ({})) {
const { hw: HW, hl: HL, sill: SILL, wx: WX, wz: WZ } = B;
const K = {
  body: B, front: B.front,
  // the capsule it breaks props with (world/props.js): half its length either side of the centre, and how wide
  hull: { half: B.circles[0], r: HW },
  verb: 'drive',
  handling: { top: 30, boostTop: 40, accel: 8, boostAccel: 11, brake: 24, reverseBrake: 18, reverseTop: 7, reverseAccel: 6, handbrake: 7, coast: 1.2, drag: 0.006, turnLow: 2.0, turnHigh: 1.0, maxSteer: 0.65,
    steerRate: 6, grip: 10, gripFast: 5, drift: { min: 9, grip: 3, throttleGrip: 2, handbrakeGrip: 1.4, turn: 1.3, angle: 0.75, keep: 0.8, exit: 1.2, hold: 0.5 } }, // see driftDrive in drive.js
  traffic: { look: 7.5, decel: 30, accel: 6, patience: 3, hornAfter: 1.5, passFor: 3.5 },
  fx: { smokeRate: 4, smokeY: 1.2, smokeSpeed: 1.5, smokeLife: 2, smokeSize: 0.6, fireRate: 0.6, fireY: 1.3, fireSize: 0.35, spread: 0.6, fuse: 1.6, boomFuse: 0.25, crashFuse: 45 },
  blast: { y: 0.8, r: 9, dmg: 240 }, // big enough to set off a car parked alongside and drop anyone within a few metres
  wreckReward: { heat: 3, cash: [40, 160] },
  bumper: { back: -2.2, front: 2.6, half: 1.15, slow: 0.9 },
  crash: { exitSpeed: 9, hurt: 0.5 },
  ram: { mass: 4, hull: [B.circles[0], HW], heavierAt: 3, sameAt: Infinity }, // see vehicles/knock.js
  camera: { dist: 7.4, aimDist: 4.2, height: 2.2, fovPerSpeed: 0.3, minArm: 3.4 }, // minArm: see game/camera.js
  laneHalf: 1.7, trafficDespawn: Infinity, reachMax: 1.6, stopsWhileBurning: true, enclosed: true,
  ambientEngine: true, engineVoice: 'four', engineNear: 0.06, jack: 'pull the driver out of',
  wheelbase: WZ * 2,
  tip: M => `The ${M.name}. <em>${kb('forward')}</em>/<em>${kb('back')}</em> gas and brake, <em>${kb('left')}</em>/<em>${kb('right')}</em> steer, <em>${kb('sprint')}</em> boost, <em>${kb('jump')}</em> handbrake (steer with it to drift),${M.siren ? ` <em>${kb('siren')}</em> siren,` : ''} <em>${kb('ride')}</em> to get out.`,

  build(v) { return v.model.mesh(v); },
  pose(c, dt) {
    const m = c.mesh, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    // sit on whatever is under the wheels (kerbs, park paths, the beach), eased so a kerb reads as a bump
    const g = (l, a) => groundAt(c.x + fz * l + fx * a, c.z - fx * l + fz * a);
    const fl = g(-WX, WZ), fr = g(WX, WZ), rl = g(-WX, -WZ), rr = g(WX, -WZ), k = Math.min(1, dt * 14);
    const tP = Math.atan2((fl + fr) - (rl + rr), 4 * WZ), tR = Math.atan2((fr + rr) - (fl + rl), 4 * WX), tY = (fl + fr + rl + rr) / 4;
    if (c.gy == null || !dt) { c.gy = tY; c.gp = tP; c.gr = tR; } else { c.gy = lerp(c.gy, tY, k); c.gp = lerp(c.gp, tP, k); c.gr = lerp(c.gr, tR, k); }
    // the body leans out of a turn and rocks on a slide
    const lean = c.driver === P ? clamp((c.v || 0) * (c.yawRate || 0) * 0.005 - (c.slip || 0) * 0.004, -0.07, 0.07) : 0;
    c.lean = dt ? lerp(c.lean || 0, lean, Math.min(1, dt * 6)) : lean;
    m.grp.position.set(c.x, c.gy + (c.air || 0), c.z); m.grp.rotation.set(-c.gp, c.yaw, c.gr + c.lean + (c.wreckRoll || 0), 'YXZ');
    spinWheels(m.wheels, rolling(c) * dt);
    if (c.dead || c.burnT > 0) return;
    if (m.lr) { const lit = lightsOn(c), on = (G.time * 6 | 0) % 2 === 0; m.lr.visible = lit && on; m.lb.visible = lit && !on; }
    if (c.hp < 50 && dt && Math.random() < dt * 6) emit(c.x + Math.sin(c.yaw) * 1.8, 1.1, c.z + Math.cos(c.yaw) * 1.8, 1, '#8a8090', 1, 1.4, 0.4, 2, 1);
  },
  drive(v, dt, c) { driftDrive(v, dt, c, K.wheelbase); },
  // sliding: tyre smoke and black marks off the rear wheels, and a squeal (see updateEngineSound)
  afterDrive(c, dt) {
    const s = Math.abs(c.slip || 0), on = s > SKID && Math.abs(c.v) > 2;
    c.skid = on ? clamp((s - SKID) / 8, 0.15, 1) : 0;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    for (const l of [-WX, WX]) {
      const x = c.x + fz * l - fx * WZ, z = c.z - fx * l - fz * WZ, key = l < 0 ? 'skidL' : 'skidR', last = c[key];
      if (on && last) skidMark(last.x, last.z, x, z, groundAt(x, z));
      c[key] = on ? { x, z } : null;
      if (on && Math.random() < dt * 9 * c.skid) emit(x, 0.15 + c.gy, z, 1, '#d8d2e0', 1.2, 0.8, 0.22, 1.5, 1);
    }
  },

  collideSelf(c) {
    const pts = circlesOf(c);
    let hit = false; for (const p of pts) if (collide(p, HW, c)) hit = true;
    settle(c, pts); return hit;
  },
  ai: {
    // follow the lane without driving through other cars; a shove leaves the driver stunned, then they get back in lane
    traffic(c, dt) {
      if (c.dazeT > 0) { c.dazeT -= dt; c.v = 0; return; }
      followLane(c, dt, K.traffic); keepOnGrid(c, dt);
      c.yaw += angDiff(c.yaw, keepLane(c, dt)) * Math.min(1, dt * 5);
      if (keepApart(c)) c.v *= 0.9;
      const a = c.driver; if (a) { a.x = c.x; a.z = c.z; a.yaw = c.yaw; }
    },
    // a police car or army truck racing up the player's road; it parks and lets its crew out when close
    respond(c, dt) {
      c.respT += dt;
      const along = c.dirZ ? c.z : c.x, pAlong = c.dirZ ? P.z : P.x, rem = (pAlong - along) * (c.dirZ || c.dirX);
      const b = blockedAhead(c, 6, false);
      if (rem < 12 || c.respT > 10 || (b && (c.blockT = (c.blockT || 0) + dt) > 1)) { c.mode = 'parked'; c.v = 0; emitEvent('police:arrived', { vehicle: c }); }
      else if (!b) { c.v = Math.min(20, c.v + 14 * dt); c.x += c.dirX * c.v * dt; c.z += c.dirZ * c.v * dt; }
      else c.v = 0;
    },
  },
  // shoved by another car (see vehicles/knock.js): skid sideways and spin until the tyres bite
  slide(c, dt) {
    // thrown by a blast: up in the air there's no road to skid on, so it keeps its speed until it lands with a bump
    if (c.air > 0) { c.avy -= 22 * dt; c.air += c.avy * dt; if (c.air <= 0) { c.air = 0; c.avy = 0; c.kvx *= 0.7; c.kvz *= 0.7; emit(c.x, 0.2, c.z, 10, '#ffd23e', 4, 0.3, 0.06, -12, 1.5); } }
    const sp = Math.hypot(c.kvx || 0, c.kvz || 0), dec = c.air > 0 ? 0 : 11 * dt;
    if (sp <= dec) c.kvx = c.kvz = 0; else { const k = 1 - dec / sp; c.kvx *= k; c.kvz *= k; }
    c.kspin = Math.abs(c.kspin || 0) < 0.05 ? 0 : c.kspin * Math.max(0, 1 - dt * 3);
    c.x += c.kvx * dt; c.z += c.kvz * dt; c.yaw += c.kspin * dt;
    if (!(c.air > 0)) smash(c, c.kvx, c.kvz); // a car sent skidding takes palms and lamps down too
    if (K.collideSelf(c)) { c.kvx *= 0.5; c.kvz *= 0.5; c.kspin *= 0.5; }
    if (sp > 4 && dt && Math.random() < dt * 20) emit(c.x + rnd(-1, 1), 0.15, c.z + rnd(-1, 1), 1, '#cfc8d8', 2, 0.6, 0.35, 1, 1); // tyre smoke
    // a traffic car comes out of it facing along its road again
    if (!c.kvx && !c.kvz && !c.kspin && c.mode === 'traffic') { const a = Math.round(c.yaw / (Math.PI / 2)) * Math.PI / 2; if (Math.round(Math.sin(a)) === -c.dirX && Math.round(Math.cos(a)) === -c.dirZ) { c.dirX = -c.dirX; c.dirZ = -c.dirZ; } }
    const a = c.driver; if (a) { a.x = c.x; a.z = c.z; a.yaw = c.yaw; }
  },
  // nobody at the wheel: roll to a stop
  coast(c, dt) {
    if (!c.v) return;
    const dec = 6 * dt; c.v = Math.abs(c.v) <= dec ? 0 : c.v - Math.sign(c.v) * dec;
    c.x += Math.sin(c.yaw) * c.v * dt; c.z += Math.cos(c.yaw) * c.v * dt; if (K.collideSelf(c)) c.v *= 0.4;
  },
  // the driver sits behind the wheel, seen through the windows; the seat keeps their gun where drive-by shots come from
  seat(c, ch) {
    c.mesh.seat.add(ch.root); ch.root.position.set(0, 0, 0); ch.root.rotation.set(0, 0, 0);
    ch.shadow.visible = false; ch.legL.geometry = ch.legR.geometry = seatedLegs(ch);
    const knees = c.mesh.seat.userData.knees ?? -1; // knees up, feet on the floor; a low car lifts them higher
    ch.body.position.y = 0; ch.body.rotation.set(0, 0, 0); ch.legL.rotation.set(knees, 0, 0); ch.legR.rotation.set(knees, 0, 0);
    ch.armL.rotation.set(-1.1, 0, 0.1); ch.armR.rotation.set(-1.1, 0, -0.1, 'XYZ');
  },
  unseat(c, ch) {
    scene.add(ch.root); ch.shadow.visible = true; ch.legL.geometry = ch.legR.geometry = ch.legGeo;
    ch.legL.rotation.set(0, 0, 0); ch.legR.rotation.set(0, 0, 0); ch.armL.rotation.set(0, 0, 0, 'XYZ'); ch.armR.rotation.set(0, 0, 0, 'XYZ');
  },
  aim() {},
  // a shot through the glass at the person behind the wheel: { t, head } or null
  occupantHit(c, o, d, maxT) {
    const s = c.mesh.seat.position, k = c.mesh.seat.scale.y, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const x = c.x + s.x * cy + s.z * sy, z = c.z - s.x * sy + s.z * cy;
    let best = null;
    for (const [y, r, head] of [[s.y + 1.74 * k, 0.2 * k, true], [s.y + 1.2 * k, 0.34 * k, false]]) {
      const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, x, y, z, r);
      if (t < maxT && o.y + d.y * t > SILL && (!best || t < best.t)) best = { t, head };
    }
    return best;
  },
  seatZ: () => -0.3,
  exitAt: c => ({ x: c.x + Math.cos(c.yaw) * (HW + 0.7), z: c.z - Math.sin(c.yaw) * (HW + 0.7) }),
  hitBox(c) { const sy = Math.abs(Math.sin(c.yaw)), cy = Math.abs(Math.cos(c.yaw)); return { hx: sy * HL + cy * HW, hz: cy * HL + sy * HW, h: B.h }; },
  pushOut(c, o, r) { return pushOutOBB(o, r, c.x, c.z, c.yaw, HW, HL); },
  // how high the top of the body is at (x, z), for a bike riding over it (see vehicles/knock.js); -Infinity off it
  topAt(c, x, z) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = x - c.x, rz = z - c.z;
    const lx = Math.abs(rx * fz - rz * fx), lz = rx * fx + rz * fz;
    if (lx > HW || Math.abs(lz) > HL) return -Infinity;
    return Math.min(profile(B.along, lz), profile(B.across, lx)) + (c.gy || 0) + (c.air || 0);
  },
  // distance from the player to the nearest point of the body
  reach(c, p) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = p.x - c.x, rz = p.z - c.z;
    const lx = rx * fz - rz * fx, lz = rx * fx + rz * fz;
    return Math.hypot(Math.max(0, Math.abs(lx) - HW), Math.max(0, Math.abs(lz) - HL));
  },
  onDriverGone(c) { c.mode = 'parked'; },
  onPlayerEnter(c) { c.v = 0; c.steer = 0; c.slip = 0; c.drifting = false; },
  // bailing out of a slide leaves the car skidding on the way it was going
  onPlayerExit(c) {
    c.mode = 'parked'; c.skid = 0; c.skidL = c.skidR = null;
    if (Math.abs(c.slip || 0) > 1) { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); c.kvx = fx * c.v + fz * c.slip; c.kvz = fz * c.v - fx * c.slip; c.kspin = (c.yawRate || 0) * 0.5; c.v = 0; }
    c.slip = 0; c.drifting = false; c.yawRate = 0;
  },
  wreck(c) { c.wreckRoll = rnd(-0.15, 0.15); },
  blip() {},
  // the detailed models share one geometry between all their cars (models/carkit.js), so that stays
  dispose(c) { for (const m of [c.mesh.m, c.mesh.win, c.mesh.lamps]) if (m && !m.geometry.userData.shared) m.geometry.dispose(); },
};
return Object.assign(K, extra(K));
}
export const car = carKind();

