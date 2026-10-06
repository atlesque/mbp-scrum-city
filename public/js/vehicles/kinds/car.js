import { emit as emitEvent } from '../../core/events.js';
import { G, P } from '../../core/state.js';
import { seatedLegs } from '../../characters/character.js';
import { angDiff, rnd } from '../../core/util.js';
import { emit } from '../../render/effects.js';
import { scene } from '../../render/scene.js';
import { collide, pushOutOBB, raySphere } from '../../world/collision.js';
import { all } from '../../entities/registry.js';
import { arcadeDrive, followLane, keepLane, keepOnGrid } from '../drive.js';
import { blockedAhead } from '../vehicle.js';

const HW = 1.0, HL = 2.15; // half width and half length of the body
const SILL = 0.95; // bottom of the windows: shots above it reach whoever is inside

// Cars: four wheels, no lean, the driver sits inside out of sight. See kinds/bike.js for what each field means.
// AI traffic keeps its body out of other cars' instead of driving through them
function keepApart(c) {
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), F = { x: c.x + fx * 1.15, z: c.z + fz * 1.15 }, R = { x: c.x - fx * 1.15, z: c.z - fz * 1.15 };
  let hit = false;
  for (const o of all('vehicle')) {
    if (o === c || o.K !== car || Math.abs(o.x - c.x) > 6 || Math.abs(o.z - c.z) > 6) continue;
    if (o.pushOut(F, HW)) hit = true;
    if (o.pushOut(R, HW)) hit = true;
  }
  if (hit) { c.x = (F.x + R.x) / 2; c.z = (F.z + R.z) / 2; }
  return hit;
}

export const car = {
  verb: 'drive',
  handling: { top: 30, boostTop: 40, accel: 8, boostAccel: 11, brake: 24, reverseBrake: 18, reverseTop: 7, reverseAccel: 6, handbrake: 18, coast: 1.2, drag: 0.006, turnLow: 1.4, turnHigh: 0.7, maxSteer: 0.6 },
  traffic: { look: 7.5, decel: 30, accel: 6, patience: 3, hornAfter: 1.5, passFor: 3.5 },
  fx: { smokeRate: 4, smokeY: 1.2, smokeSpeed: 1.5, smokeLife: 2, smokeSize: 0.6, fireRate: 0.6, fireY: 1.3, fireSize: 0.35, spread: 0.6, fuse: 1.6, boomFuse: 0.25 },
  blast: { y: 0.8, r: 9, dmg: 240 }, // big enough to set off a car parked alongside and drop anyone within a few metres
  wreckReward: { heat: 3, cash: [40, 160] },
  bumper: { back: -2.2, front: 2.6, half: 1.15, slow: 0.9 },
  crash: { exitSpeed: 9, hurt: 0.5 },
  ram: { mass: 4, hull: [1.15, HW], heavierAt: 3, sameAt: Infinity }, // see vehicles/knock.js
  camera: { dist: 7.4, aimDist: 4.2, height: 2.2, fovPerSpeed: 0.3 },
  laneHalf: 1.7, trafficDespawn: Infinity, reachMax: 1.6, stopsWhileBurning: true, enclosed: true,
  wheelbase: 2.7,
  tip: M => `The ${M.name}. <em>W</em>/<em>S</em> gas and brake, <em>A</em>/<em>D</em> steer, <em>Shift</em> boost, <em>Space</em> handbrake, <em>F</em> to get out.`,

  build(v) { return v.model.mesh(v); },
  pose(c, dt) {
    const m = c.mesh;
    m.grp.position.set(c.x, c.air || 0, c.z); m.grp.rotation.set(c.tilt || 0, c.yaw, c.wreckRoll || 0, 'YXZ');
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
    // follow the lane without driving through other cars; a shove leaves the driver stunned, then they get back in lane
    traffic(c, dt) {
      if (c.dazeT > 0) { c.dazeT -= dt; c.v = 0; return; }
      followLane(c, dt, car.traffic); keepOnGrid(c, dt);
      c.yaw += angDiff(c.yaw, keepLane(c, dt)) * Math.min(1, dt * 5);
      if (keepApart(c)) c.v *= 0.9;
      const a = c.driver; if (a) { a.x = c.x; a.z = c.z; a.yaw = c.yaw; }
    },
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
  // thrown by an explosion: up into the air, tumbling end over end and spinning, then the usual skid on landing
  tossScale: 0.5,
  toss(c, vx, vz, up) {
    c.kvx = (c.kvx || 0) + vx; c.kvz = (c.kvz || 0) + vz; c.avy = Math.max(c.avy || 0, 0) + up; c.air = Math.max(c.air || 0, 0.01);
    c.kspin = (c.kspin || 0) + rnd(-1, 1) * Math.hypot(vx, vz) * 0.12; c.tiltV = (Math.random() < 0.5 ? 1 : -1) * up * (c.dead || c.burnT > 0 ? 0.35 : 0.08); c.tilt = c.tilt || 0; c.v = 0;
  },
  // shoved by another car (see vehicles/knock.js): skid sideways and spin until the tyres bite
  slide(c, dt) {
    if (c.air > 0) {
      c.avy -= 22 * dt; c.air += c.avy * dt; c.tilt += c.tiltV * dt;
      if (c.air <= 0) { // lands: on its wheels, or on its roof if it's a wreck that turned over (only wrecks tumble far)
        const T = Math.PI * 2, t = ((c.tilt % T) + T) % T, roof = (c.dead || c.burnT > 0) && t > Math.PI / 2 && t < Math.PI * 1.5;
        c.air = 0; c.avy = 0; c.tiltV = 0; c.tilt = roof ? Math.PI : 0; c.kvx *= 0.6; c.kvz *= 0.6;
        emit(c.x, 0.2, c.z, 12, '#ffd23e', 5, 0.35, 0.06, -12, 1.5); emit(c.x, 0.3, c.z, 6, '#8a8090', 3, 0.8, 0.5, 1, 1);
      }
    }
    const sp = Math.hypot(c.kvx || 0, c.kvz || 0), dec = c.air > 0 ? 0 : 11 * dt;
    if (sp <= dec) c.kvx = c.kvz = 0; else { const k = 1 - dec / sp; c.kvx *= k; c.kvz *= k; }
    c.kspin = Math.abs(c.kspin || 0) < 0.05 ? 0 : c.kspin * Math.max(0, 1 - dt * 3);
    c.x += c.kvx * dt; c.z += c.kvz * dt; c.yaw += c.kspin * dt;
    if (car.collideSelf(c)) { c.kvx *= 0.5; c.kvz *= 0.5; c.kspin *= 0.5; }
    if (sp > 4 && dt && Math.random() < dt * 20) emit(c.x + rnd(-1, 1), 0.15, c.z + rnd(-1, 1), 1, '#cfc8d8', 2, 0.6, 0.35, 1, 1); // tyre smoke
    // a traffic car comes out of it facing along its road again
    if (!c.kvx && !c.kvz && !c.kspin && c.mode === 'traffic') { const a = Math.round(c.yaw / (Math.PI / 2)) * Math.PI / 2; if (Math.round(Math.sin(a)) === -c.dirX && Math.round(Math.cos(a)) === -c.dirZ) { c.dirX = -c.dirX; c.dirZ = -c.dirZ; } }
    const a = c.driver; if (a) { a.x = c.x; a.z = c.z; a.yaw = c.yaw; }
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
  onPlayerEnter(c) { c.v = 0; c.steer = 0; c.air = c.avy = c.tilt = c.tiltV = 0; },
  onPlayerExit(c) { c.mode = 'parked'; },
  wreck(c) { c.wreckRoll = rnd(-0.15, 0.15); },
  blip() {},
  dispose(c) { c.mesh.m.geometry.dispose(); if (c.mesh.win) c.mesh.win.geometry.dispose(); },
};
