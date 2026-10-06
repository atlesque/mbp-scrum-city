import { Sound } from '../core/audio.js';
import { pan3d, vol3d } from '../core/spatial.js';
import { clamp, lerp } from '../core/util.js';
import { blockedAhead } from './vehicle.js';

// Arcade driving shared by every kind: throttle, brakes and a bicycle-model steer with the turn
// rate capped (gentler the faster you go). The numbers come from the vehicle's handling (v.H).
export function arcadeDrive(v, dt, c, wb) {
  const H = v.H;
  pedals(v, dt, c, H);
  const sp = Math.abs(v.v), maxYaw = lerp(H.turnLow, H.turnHigh, clamp(sp / 40, 0, 1)), maxSteer = sp < 0.5 ? H.maxSteer : Math.min(H.maxSteer, Math.atan(maxYaw * wb / sp));
  v.steer = lerp(v.steer, c.steer * maxSteer, Math.min(1, dt * (c.steer ? 3.5 : 5)));
  v.yawRate = v.v * Math.tan(v.steer) / wb; v.yaw += v.yawRate * dt;
  v.x += Math.sin(v.yaw) * v.v * dt; v.z += Math.cos(v.yaw) * v.v * dt;
}
// throttle, brakes, handbrake and rolling resistance on the speed along the heading (v.v)
function pedals(v, dt, c, H) {
  const top = c.boost ? H.boostTop : H.top;
  if (c.throttle) v.v += v.v < -0.5 ? H.reverseBrake * dt : (c.boost ? H.boostAccel : H.accel) * clamp(1 - (v.v / top) ** 2, -0.6, 1) * dt;
  if (c.brake) v.v = v.v > 0.4 ? v.v - H.brake * dt : Math.max(-H.reverseTop, v.v - H.reverseAccel * dt);
  if (c.handbrake) v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), H.handbrake * dt);
  if (!c.throttle && !c.brake) v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), (H.coast + H.drag * v.v * v.v) * dt);
}

// Cars: the same pedals, but the body can slide. Besides its speed along the heading (v.v) the car carries a
// sideways speed (v.slip, towards its right-hand side, +X in the model) that the tyres scrub away at `grip` per
// second, turning most of it back into forward speed. Whatever the heading turns faster than the tyres can follow
// becomes slip, so a car with grip tracks through a turn while one without it slides wide.
//   grip, gripFast       tyre grip at low speed and at full lock above 25 m/s (a fast hard turn lets the tail out a little)
//   steerRate            how fast the wheels turn in (per second)
//   drift: { min, grip, throttleGrip, handbrakeGrip, turn, angle, keep, exit, hold }
//     the handbrake while steering above `min` m/s kicks the tail out (handbrakeGrip) and starts a drift: grip stays
//     low (throttleGrip with the gas held, so a slide can be held) and the car turns `turn` times as hard (less and
//     less as the slide nears `angle` radians from the heading, so it holds a drift rather than spinning), keeping
//     `keep` of the scrubbed speed; after `hold` seconds the drift ends once the slip falls under `exit` m/s
export function driftDrive(v, dt, c, wb) {
  const H = v.H, D = H.drift;
  pedals(v, dt, c, H);
  const sp = Math.abs(v.v), slip = v.slip || 0;
  // a tap of the handbrake is enough: the drift gets `hold` seconds to build up before it can end
  if (c.handbrake && c.steer && sp > D.min) { if (!v.drifting) v.driftT = 0; v.drifting = true; }
  else if (v.drifting && ((Math.abs(slip) < D.exit && v.driftT > D.hold) || sp < 3)) v.drifting = false;
  if (v.drifting) v.driftT += dt;
  // past a good drift angle the car stops swinging round any further, so a held slide doesn't become a spin
  const angle = Math.atan2(Math.abs(slip), Math.abs(v.v)), turn = v.drifting ? D.turn * clamp(1.4 - angle / D.angle, 0.15, 1) : 1;
  const maxYaw = lerp(H.turnLow, H.turnHigh, clamp(sp / 40, 0, 1)) * turn, maxSteer = sp < 0.5 ? H.maxSteer : Math.min(H.maxSteer, Math.atan(maxYaw * wb / sp));
  v.steer = lerp(v.steer, c.steer * maxSteer, Math.min(1, dt * (c.steer ? H.steerRate : H.steerRate * 1.4)));
  v.yawRate = v.v * Math.tan(v.steer) / wb * turn;
  // the heading turns under the car: what was forward speed is partly sideways now
  const d = v.yawRate * dt, cd = Math.cos(d), sd = Math.sin(d), f = v.v * cd + slip * sd, s = -v.v * sd + slip * cd;
  v.yaw += d;
  // the tyres scrub the slide away, handing most of it back as speed along the heading
  const lock = Math.abs(v.steer) / (H.maxSteer || 1), grip = c.handbrake && v.drifting ? D.handbrakeGrip : v.drifting ? (c.throttle ? D.throttleGrip : D.grip) : lerp(H.grip, H.gripFast, clamp((sp - 25) / 10, 0, 1) * lock);
  const s2 = s * Math.exp(-grip * dt), keep = (v.drifting ? D.keep : 0.97) * Math.min(1, Math.abs(f) / 5);
  v.v = (Math.sign(f) || 1) * Math.sqrt(f * f + keep * (s * s - s2 * s2)); v.slip = s2;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  v.x += (fx * v.v + fz * v.slip) * dt; v.z += (fz * v.v - fx * v.slip) * dt;
}

// Lane following for AI traffic: slow for whatever is ahead, honk at the player, nudge past stuck
// vehicles. T holds the kind's traffic tuning. keepOnGrid afterwards turns it at the edge of the map.
export function followLane(v, dt, T) {
  v.ignoreT -= dt; v.hornT -= dt;
  const blk = blockedAhead(v, T.look, v.ignoreT > 0);
  if (blk) {
    v.v = Math.max(0, v.v - T.decel * dt); v.waitT += dt;
    if (blk === 'car' && v.waitT > T.patience) { v.ignoreT = T.passFor || 1.5; v.waitT = 0; }
    if (blk === 'player' && v.waitT > T.hornAfter && v.hornT <= 0) { Sound.horn(vol3d(v.x, v.z), pan3d(v.x, v.z)); v.hornT = 3; }
  } else { v.v = Math.min(v.top, v.v + T.accel * dt); v.waitT = 0; }
  v.x += v.dirX * v.v * dt; v.z += v.dirZ * v.v * dt;
}
// The city is walled in, so traffic turns onto the ring road at the edge instead of driving off it:
// a road meeting the ring turns either way, the ring turns inwards at its corners, and traffic on the
// ring sometimes turns back into town at a junction. Lanes match laneFor in traffic.js.
const RING = 200, IN_ROADS = [-150, -100, -50, 0, 50, 100, 150];
const nearRoad = p => IN_ROADS.concat([-RING, RING]).reduce((a, b) => Math.abs(b - p) < Math.abs(a - p) ? b : a);
export function keepOnGrid(v, dt) {
  const alongX = v.dirX !== 0, pos = alongX ? v.x : v.z, dir = alongX ? v.dirX : v.dirZ, road = nearRoad(alongX ? v.z : v.x);
  // the lane of a crossing road r when turning towards t
  const lane = (r, t) => alongX ? r - 3 * t : r + 3 * t;
  const turn = (t, at) => { if (alongX) { v.x = at; v.dirX = 0; v.dirZ = t; } else { v.z = at; v.dirZ = 0; v.dirX = t; } v.edgeT = 0; };
  // nearing the edge: pick a way once (always inwards on the ring), then turn on reaching that lane
  if (Math.abs(road) === RING) v.edgeT = -Math.sign(road);
  else if (!v.edgeT && pos * dir > RING - 12) v.edgeT = Math.random() < 0.5 ? 1 : -1;
  const edge = lane(RING * dir, v.edgeT || 1);
  if (v.edgeT && (pos - edge) * dir >= 0) return turn(v.edgeT, edge);
  // on the ring: now and then turn back into town
  if (Math.abs(road) === RING && dt) {
    const prev = pos - dir * v.v * dt, t = -Math.sign(road);
    for (const r of IN_ROADS) { const l = lane(r, t); if ((prev - l) * (pos - l) < 0 && Math.random() < 0.3) return turn(t, l); }
  }
}

// Back into the lane after a shove, or out round something stuck in it: slide the car across towards its lane
// (or towards the oncoming lane while it is going round, ignoreT) and point it the way it is actually moving.
// Returns the heading to steer to.
export function keepLane(v, dt) {
  const alongX = v.dirX !== 0, road = nearRoad(alongX ? v.z : v.x), dir = alongX ? v.dirX : v.dirZ;
  const lane = alongX ? road + 3 * dir : road - 3 * dir, out = v.ignoreT > 0 ? (alongX ? -3.6 : 3.6) * dir : 0;
  const pos = alongX ? v.z : v.x, step = clamp(lane + out - pos, -3 * dt, 3 * dt);
  if (alongX) v.z += step; else v.x += step;
  const side = dt ? step / dt : 0;
  return Math.atan2(v.dirX * Math.max(v.v, 4) + (alongX ? 0 : side), v.dirZ * Math.max(v.v, 4) + (alongX ? side : 0));
}
