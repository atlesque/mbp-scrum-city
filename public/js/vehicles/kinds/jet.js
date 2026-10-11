import { heli, floorUnder } from './heli.js';
import { G, P, cam } from '../../core/state.js';
import { kb } from '../../core/controls.js';
import { angDiff, clamp, lerp } from '../../core/util.js';
import { collide } from '../../world/collision.js';
import { armHeli } from '../heli-guns.js';
import { strapOnChute } from '../../game/parachute.js';
import { emit } from '../../render/effects.js';

// Arcade fixed-wing flight: taxi to takeoff speed, then keep moving forward in the air.
export function jetStep(v, dt, c, piloted = true) {
  const throttle = c.fwd > 0, brake = c.fwd < 0;
  const want = !piloted || brake ? 0 : throttle ? (c.boost ? 68 : 48) : v.landed ? 0 : 32;
  v.speed += clamp(want - v.speed, -(brake ? 16 : 8) * dt, 12 * dt);
  v.engine = lerp(v.engine, piloted ? (throttle ? 1 : 0.5) : 0, Math.min(1, dt * 2));
  const turn = clamp(angDiff(v.yaw, c.yaw), -1.3 * dt, 1.3 * dt) - (c.side || 0) * 0.7 * dt;
  if (v.speed > 1 || !v.landed) v.yaw += turn;
  v.roll = lerp(v.roll || 0, v.landed ? 0 : clamp(-turn / Math.max(dt, 0.001) * 0.35, -0.6, 0.6), Math.min(1, dt * 5));
  if (piloted && v.speed >= 18) v.vy = lerp(v.vy, c.up ? 13 : c.down ? -10 : clamp(cam.pitch * v.speed * 0.25, -8, 8), Math.min(1, dt * 3));
  else if (!v.landed) v.vy -= 12 * dt;
  else v.vy = 0;
  v.vx = Math.sin(v.yaw) * v.speed; v.vz = Math.cos(v.yaw) * v.speed;
  v.x += v.vx * dt; v.z += v.vz * dt; v.y = Math.min(160, v.y + v.vy * dt);
  const o = { x: v.x, z: v.z };
  if (collide(o, 2.2, v, v.y)) {
    if (v.speed > 12 && !v.dead) v.damage(v.speed * 22, false, true);
    v.speed = 0; v.vx = v.vz = 0; v.x = o.x; v.z = o.z;
  }
  const floor = floorUnder(v.x, v.z, v.y), land = v.y <= floor;
  if (land) {
    if ((!piloted && !v.landed || v.vy < -8) && !v.dead) v.damage(Math.max(100, Math.abs(v.vy) * 75), false, true);
    v.y = floor; v.vy = 0;
  }
  v.floor = floor; v.landed = land; v.v = v.speed;
}
export const jet = {
  ...heli, jet: true, rotor: false,
  gunTip: { x: 0, y: -0.1, z: 6.3 }, pods: [{ x: -2.8, y: -0.2, z: 1 }, { x: 2.8, y: -0.2, z: 1 }],
  camera: { dist: 19, aimDist: 16, height: 5, fovPerSpeed: 0.12, minArm: 7 },
  ram: { mass: 9, hull: [3, 1.5], heavierAt: 3, sameAt: Infinity },
  tip: () => `Ghost fighter: <em>${kb('forward')}</em> throttle, <em>${kb('back')}</em> brake, mouse turns, <em>${kb('left')}</em>/<em>${kb('right')}</em> bank, <em>${kb('jump')}</em> climb after accelerating, <em>${kb('wheelie')}</em> descend, <em>${kb('sprint')}</em> afterburner. <em>1</em> cannon, <em>2</em> rockets. <em>${kb('ride')}</em> exits with a parachute in flight.`,
  init(v) { Object.assign(v, { y: floorUnder(v.x, v.z, 0), speed: 0, v: 0, vx: 0, vz: 0, vy: 0, engine: 0, landed: true, roll: 0, floor: floorUnder(v.x, v.z, 0) }); },
  build(v) { return v.model.mesh(); },
  drive: jetStep,
  coast(v, dt) { jetStep(v, dt, { fwd: -1, side: 0, yaw: v.yaw }, false); },
  pose(v, dt) {
    v.mesh.grp.position.set(v.x, v.y + 0.8, v.z);
    v.mesh.grp.rotation.set(-Math.atan2(v.vy, Math.max(1, v.speed)), v.yaw, v.roll || 0, 'YXZ');
    v.mesh.gear.visible = v.y - v.floor < 5; v.onRoof = v.y > 1 && v.landed;
    if (v.engine > 0.6 && v.driver === P && !v.dead && dt && Math.random() < dt * 18) {
      const x = v.x - Math.sin(v.yaw) * 4.7, z = v.z - Math.cos(v.yaw) * 4.7;
      emit(x, v.y + 1, z, 2, '#ff9b45', 2, 0.25, 0.3);
    }
  },
  onPlayerEnter(v) { cam.yaw = v.yaw; cam.pitch = 0.03; armHeli(v); if (!P.chute) strapOnChute(true); },
  onPlayerExit(v) { v.mode = 'parked'; },
  exitAt: v => ({ x: v.x + Math.cos(v.yaw) * 3, z: v.z - Math.sin(v.yaw) * 3 }),
  wreck(v) { v.engine = 0; },
  blip(v, radar) {
    if (Math.hypot(v.x - P.x, v.z - P.z) < 45) v.discovered = true;
    if (v.discovered) radar.dot(v.x, v.z, '#9ddcff', 10, false, 'dia');
  },
  dispose(v) { v.mesh.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== v.mesh.body.material) o.material.dispose(); }); },
};
