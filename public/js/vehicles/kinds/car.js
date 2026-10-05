import { emit as emitEvent } from '../../core/events.js';
import { G, P } from '../../core/state.js';
import { seatedLegs } from '../../characters/character.js';
import { rnd } from '../../core/util.js';
import { emit } from '../../render/effects.js';
import { scene } from '../../render/scene.js';
import { collide, pushOutOBB, raySphere } from '../../world/collision.js';
import { arcadeDrive, followLane, wrapMap } from '../drive.js';
import { blockedAhead } from '../vehicle.js';

const HW = 1.0, HL = 2.15; // half width and half length of the body
const SILL = 0.95; // bottom of the windows: shots above it reach whoever is inside

// Cars: four wheels, no lean, the driver sits inside out of sight. See kinds/bike.js for what each field means.
export const car = {
  verb: 'drive',
  handling: { top: 30, boostTop: 40, accel: 8, boostAccel: 11, brake: 24, reverseBrake: 18, reverseTop: 7, reverseAccel: 6, handbrake: 18, coast: 1.2, drag: 0.006, turnLow: 1.4, turnHigh: 0.7, maxSteer: 0.6 },
  traffic: { look: 7.5, decel: 30, accel: 6, patience: 3, hornAfter: 1.5 },
  fx: { smokeRate: 4, smokeY: 1.2, smokeSpeed: 1.5, smokeLife: 2, smokeSize: 0.6, fireRate: 0.6, fireY: 1.3, fireSize: 0.35, spread: 0.6, fuse: 1.6, boomFuse: 0.25 },
  blast: { y: 0.8, r: 7, dmg: 140 },
  wreckReward: { heat: 3, cash: [40, 160] },
  bumper: { back: -2.2, front: 2.6, half: 1.15, slow: 0.9 },
  crash: { exitSpeed: 9, hurt: 0.5 },
  camera: { dist: 7.4, aimDist: 4.2, height: 2.2, fovPerSpeed: 0.3 },
  laneHalf: 1.7, trafficDespawn: Infinity, reachMax: 1.6, stopsWhileBurning: true, enclosed: true,
  wheelbase: 2.7,
  tip: M => `The ${M.name}. <em>W</em>/<em>S</em> gas and brake, <em>A</em>/<em>D</em> steer, <em>Shift</em> boost, <em>Space</em> handbrake, <em>F</em> to get out.`,

  build(v) { return v.model.mesh(v); },
  pose(c, dt) {
    const m = c.mesh;
    m.grp.position.set(c.x, 0, c.z); m.grp.rotation.set(0, c.yaw, c.wreckRoll || 0);
    if (c.dead || c.burnT > 0) return;
    if (m.lr) { const on = (G.time * 6 | 0) % 2 === 0; m.lr.visible = on; m.lb.visible = !on; }
    if (c.hp < 50 && dt && Math.random() < dt * 6) emit(c.x + Math.sin(c.yaw) * 1.8, 1.1, c.z + Math.cos(c.yaw) * 1.8, 1, '#8a8090', 1, 1.4, 0.4, 2, 1);
  },
  drive(v, dt, c) { arcadeDrive(v, dt, c, car.wheelbase); },
  collideSelf(c) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), F = { x: c.x + fx * 1.15, z: c.z + fz * 1.15 }, R = { x: c.x - fx * 1.15, z: c.z - fz * 1.15 };
    const h1 = collide(F, HW, c), h2 = collide(R, HW, c);
    c.x = (F.x + R.x) / 2; c.z = (F.z + R.z) / 2; return h1 || h2;
  },
  ai: {
    traffic(c, dt) { followLane(c, dt, car.traffic); wrapMap(c); c.yaw = Math.atan2(c.dirX, c.dirZ); const a = c.driver; if (a) { a.x = c.x; a.z = c.z; a.yaw = c.yaw; } },
    // a police car racing up the player's road; it parks and lets the officers out when close
    respond(c, dt) {
      c.respT += dt;
      const along = c.dirZ ? c.z : c.x, pAlong = c.dirZ ? P.z : P.x, rem = (pAlong - along) * (c.dirZ || c.dirX);
      const b = blockedAhead(c, 6, false);
      if (rem < 12 || c.respT > 10 || (b && (c.blockT = (c.blockT || 0) + dt) > 1)) { c.mode = 'parked'; c.v = 0; emitEvent('police:arrived', { vehicle: c }); }
      else if (!b) { c.v = Math.min(20, c.v + 14 * dt); c.x += c.dirX * c.v * dt; c.z += c.dirZ * c.v * dt; }
      else c.v = 0;
    },
  },
  // nobody at the wheel: roll to a stop
  coast(c, dt) {
    if (!c.v) return;
    const dec = 6 * dt; c.v = Math.abs(c.v) <= dec ? 0 : c.v - Math.sign(c.v) * dec;
    c.x += Math.sin(c.yaw) * c.v * dt; c.z += Math.cos(c.yaw) * c.v * dt; if (car.collideSelf(c)) c.v *= 0.4;
  },
  // the driver sits behind the wheel, seen through the windows; the seat keeps their gun where drive-by shots come from
  seat(c, ch) {
    c.mesh.seat.add(ch.root); ch.root.position.set(0, 0, 0); ch.root.rotation.set(0, 0, 0);
    ch.shadow.visible = false; ch.legL.geometry = ch.legR.geometry = seatedLegs(ch);
    ch.body.position.y = 0; ch.body.rotation.set(0, 0, 0); ch.legL.rotation.set(-1, 0, 0); ch.legR.rotation.set(-1, 0, 0); // knees up, feet on the floor
    ch.armL.rotation.set(-1.1, 0, 0.1); ch.armR.rotation.set(-1.1, 0, -0.1, 'XYZ');
  },
  unseat(c, ch) {
    scene.add(ch.root); ch.shadow.visible = true; ch.legL.geometry = ch.legR.geometry = ch.legGeo;
    ch.legL.rotation.set(0, 0, 0); ch.legR.rotation.set(0, 0, 0); ch.armL.rotation.set(0, 0, 0, 'XYZ'); ch.armR.rotation.set(0, 0, 0, 'XYZ');
  },
  aim() {},
  // a shot through the glass at the person behind the wheel: { t, head } or null
  occupantHit(c, o, d, maxT) {
    const s = c.mesh.seat.position, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const x = c.x + s.x * cy + s.z * sy, z = c.z - s.x * sy + s.z * cy;
    let best = null;
    for (const [y, r, head] of [[s.y + 1.74, 0.2, true], [s.y + 1.2, 0.34, false]]) {
      const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, x, y, z, r);
      if (t < maxT && o.y + d.y * t > SILL && (!best || t < best.t)) best = { t, head };
    }
    return best;
  },
  seatZ: () => -0.3,
  exitAt: c => ({ x: c.x + Math.cos(c.yaw) * (HW + 0.7), z: c.z - Math.sin(c.yaw) * (HW + 0.7) }),
  hitBox(c) { const sy = Math.abs(Math.sin(c.yaw)), cy = Math.abs(Math.cos(c.yaw)); return { hx: sy * HL + cy * HW, hz: cy * HL + sy * HW, h: 1.55 }; },
  pushOut(c, o, r) { return pushOutOBB(o, r, c.x, c.z, c.yaw, HW, HL); },
  // distance from the player to the nearest point of the body
  reach(c, p) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = p.x - c.x, rz = p.z - c.z;
    const lx = rx * fz - rz * fx, lz = rx * fx + rz * fz;
    return Math.hypot(Math.max(0, Math.abs(lx) - HW), Math.max(0, Math.abs(lz) - HL));
  },
  onDriverGone(c) { c.mode = 'parked'; },
  onPlayerEnter(c) { c.v = 0; c.steer = 0; },
  onPlayerExit(c) { c.mode = 'parked'; },
  wreck(c) { c.wreckRoll = rnd(-0.15, 0.15); },
  blip() {},
  dispose(c) { c.mesh.m.geometry.dispose(); if (c.mesh.win) c.mesh.win.geometry.dispose(); },
};
