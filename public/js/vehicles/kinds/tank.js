import { carKind } from './car.js';
import { CANNON } from '../../data/tank.js';
import { G, I, P, cam } from '../../core/state.js';
import { kb } from '../../core/controls.js';
import { angDiff, clamp } from '../../core/util.js';
import { Sound } from '../../core/audio.js';
import { fireRocket } from '../../combat/combat.js';
import { muzzleFlash } from '../../render/effects.js';
import { all } from '../../entities/registry.js';

export const tank = carKind({ hw: 1.8, hl: 3.6, sill: 3, wx: 1.4, wz: 2.6, h: 2.5, circles: [2.2, -2.2], front: 3.6 }, K => ({
  tracks: true, shieldsDriver: true, topAt: undefined, ai: {}, armor: { shot: 0.1, blast: 0.6 },
  handling: { ...K.handling, top: 10, boostTop: 10, accel: 3, boostAccel: 3 },
  ram: { mass: 60, hull: [2.2, 1.8], heavierAt: 1, sameAt: Infinity },
  crash: { exitSpeed: 12, hurt: 0 }, blast: { y: 1.2, r: 14, dmg: 340 },
  camera: { dist: 13, aimDist: 10, height: 4, fovPerSpeed: 0.1, minArm: 6 },
  engineVoice: 'diesel', occupantHit: () => null,
  tip: () => `Army tank: <em>${kb('forward')}</em>/<em>${kb('back')}</em> drive, <em>${kb('left')}</em>/<em>${kb('right')}</em> pivot. Mouse aims the turret, fire shoots the cannon (4 s reload). <em>${kb('ride')}</em> gets out. Tracks resist spike strips.`,
  init(v) { v.turretYaw = v.yaw; v.pitch = 0; v.cannonT = 1; },
  drive(v, dt, c) {
    const sign = (c.throttle ? 1 : 0) - (c.brake ? 1 : 0), want = sign * (sign < 0 ? 4 : 10);
    const accel = sign ? 3 : 5;
    v.v += clamp(want - v.v, -accel * dt, accel * dt);
    v.yaw += (c.steer || 0) * 0.9 * dt; v.slip = 0;
    v.x += Math.sin(v.yaw) * v.v * dt; v.z += Math.cos(v.yaw) * v.v * dt;
    // Tracks crush nearby barricades before the hull is pushed out of their collision boxes.
    for (const r of all('roadblock')) if (Math.hypot(r.x - v.x, r.z - v.z) < 7 && Math.abs(v.v) > 1) r.damage(1000);
  },
  afterDrive() {},
  pose(v) {
    v.mesh.grp.position.set(v.x, 0, v.z); v.mesh.grp.rotation.set(0, v.yaw, 0);
    v.mesh.turret.rotation.y = v.turretYaw - v.yaw; v.mesh.gun.rotation.x = -v.pitch;
  },
  guns(v, dt) {
    v.cannonT = Math.max(0, v.cannonT - dt);
    v.turretYaw += clamp(angDiff(v.turretYaw, cam.yaw), -CANNON.traverse * dt, CANNON.traverse * dt);
    v.pitch = clamp(cam.pitch, -0.12, 0.5);
    const trigger = I.mouseL || I.clickQ > 0; I.clickQ = Math.max(0, I.clickQ - dt);
    if (!trigger || v.dead || v.burnT > 0 || v.cannonT > 0 || Math.abs(angDiff(v.turretYaw, cam.yaw)) > 0.1) return;
    const dir = new THREE.Vector3(Math.sin(v.turretYaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.turretYaw) * Math.cos(v.pitch));
    const from = new THREE.Vector3(v.x - Math.sin(v.yaw) * 0.3, 2.05, v.z - Math.cos(v.yaw) * 0.3).addScaledVector(dir, CANNON.barrel);
    fireRocket(from, dir, CANNON.damage, CANNON.blast); muzzleFlash(from, true); Sound.shot('cannon', 1.2);
    I.clickQ = 0; v.cannonT = CANNON.reload; P.lastShot = G.time; cam.shake = Math.max(cam.shake, 0.35);
  },
  // The shared tank geometry must survive the removal of another tank.
  dispose() {},
}));
