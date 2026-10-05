import { Sound } from '../core/audio.js';
import { pan3d, vol3d } from '../core/spatial.js';
import { clamp, lerp } from '../core/util.js';
import { blockedAhead } from './vehicle.js';

// Arcade driving shared by every kind: throttle, brakes and a bicycle-model steer with the turn
// rate capped (gentler the faster you go). The numbers come from the vehicle's handling (v.H).
export function arcadeDrive(v, dt, c, wb) {
  const H = v.H, top = c.boost ? H.boostTop : H.top;
  if (c.throttle) v.v += v.v < -0.5 ? H.reverseBrake * dt : (c.boost ? H.boostAccel : H.accel) * clamp(1 - (v.v / top) ** 2, -0.6, 1) * dt;
  if (c.brake) v.v = v.v > 0.4 ? v.v - H.brake * dt : Math.max(-H.reverseTop, v.v - H.reverseAccel * dt);
  if (c.handbrake) v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), H.handbrake * dt);
  if (!c.throttle && !c.brake) v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), (H.coast + H.drag * v.v * v.v) * dt);
  const sp = Math.abs(v.v), maxYaw = lerp(H.turnLow, H.turnHigh, clamp(sp / 40, 0, 1)), maxSteer = sp < 0.5 ? H.maxSteer : Math.min(H.maxSteer, Math.atan(maxYaw * wb / sp));
  v.steer = lerp(v.steer, c.steer * maxSteer, Math.min(1, dt * (c.steer ? 3.5 : 5)));
  v.yawRate = v.v * Math.tan(v.steer) / wb; v.yaw += v.yawRate * dt;
  v.x += Math.sin(v.yaw) * v.v * dt; v.z += Math.cos(v.yaw) * v.v * dt;
}

// Lane following for AI traffic: slow for whatever is ahead, honk at the player, nudge past stuck
// vehicles, then wrap around the edge of the map. T holds the kind's traffic tuning.
export function followLane(v, dt, T) {
  v.ignoreT -= dt; v.hornT -= dt;
  const blk = blockedAhead(v, T.look, v.ignoreT > 0);
  if (blk) {
    v.v = Math.max(0, v.v - T.decel * dt); v.waitT += dt;
    if (blk === 'car' && v.waitT > T.patience) { v.ignoreT = 1.5; v.waitT = 0; }
    if (blk === 'player' && v.waitT > T.hornAfter && v.hornT <= 0) { Sound.horn(vol3d(v.x, v.z), pan3d(v.x, v.z)); v.hornT = 3; }
  } else { v.v = Math.min(v.top, v.v + T.accel * dt); v.waitT = 0; }
  v.x += v.dirX * v.v * dt; v.z += v.dirZ * v.v * dt;
}
export function wrapMap(v) {
  if (v.x > 204) v.x = -214; else if (v.x < -214) v.x = 204;
  if (v.z > 214) v.z = -214; else if (v.z < -214) v.z = 214;
}
