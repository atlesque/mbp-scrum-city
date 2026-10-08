import { sweepHit } from '../world/collision.js';

// ================= FOLLOW CAMERA =================
// The camera hangs on a spring arm behind the player. The arm stops in front of the first building it meets, as a ball of
// radius CAM_R so the edges of the view stay out of the walls too, and eases back out once the way is clear.
// It hangs off the right shoulder, or the left when a wall on the right would bring it in close behind the player's head.
// Where the arm can't get far enough back (a narrow alley, a car parked against a wall), it swings up over the player's head,
// lifting only as far as it takes to get minArm of room.
export const CAM_R = 0.3;
export const LIFTS = [0, 0.3, 0.6, 0.9, 1.2, 1.4]; // radians the arm may swing up, tried in order
// how far the view tilts: down to nearly straight at the player's feet (to shoot what's below, say from the jetpack), and up
export const PITCH_MIN = -1.45, PITCH_MAX = 1.15;
const MAX_LIFTED = PITCH_MIN; // the steepest the arm may hang, looking down on the player; as steep as the aim, so the crosshair stays on the shot line
let extra = null; // a rooftop's hut and air-con units while the player is up there
export function cameraRoof(roof) { extra = roof ? roof.blocks : null; }
const EASE_OUT = 5, EASE_LIFT = 4, EASE_SIDE = 5; // per second
const LOOK = 30, LOOK_LIFTED = 1.5, FULL_LIFT = 1.2; // metres along the aim the camera looks at, level and swung up FULL_LIFT or more

// how much of the arm fits, leaving (x, y, z) backwards from a view at yaw and pitch
export function armRoom(x, y, z, yaw, pitch, want) {
  const cp = Math.cos(pitch);
  return sweepHit(x, y, z, -Math.sin(yaw) * cp, -Math.sin(pitch), -Math.cos(yaw) * cp, want, CAM_R, extra);
}
// the shoulder offset that fits beside (x, y, z), up to `side` metres: to the right, or to the left when side is negative
export function shoulderRoom(x, y, z, yaw, side) {
  const g = side < 0 ? -1 : 1, a = Math.abs(side);
  return g * Math.max(0, Math.min(a, sweepHit(x, y, z, -Math.cos(yaw) * g, 0, Math.sin(yaw) * g, a + 0.05, CAM_R, extra) - 0.05));
}
// which shoulder to look over, 1 (right) or -1 (left): the right, unless a wall there leaves the arm clearly less room than the left would
export function pickSide(x, y, z, yaw, pitch, side, want, cur = 1) {
  const reach = g => { const o = shoulderRoom(x, y, z, yaw, side * g); return armRoom(x - Math.cos(yaw) * o, y, z + Math.sin(yaw) * o, yaw, pitch, want); };
  const right = reach(1), left = reach(-1);
  if (cur > 0) return right < want - 0.01 && left > right * 1.3 + 0.2 ? -1 : 1;
  return right >= left - 0.05 ? 1 : -1;
}
// one frame of the shoulder: s.side eases between the two; returns the offset to the right of (x, y, z) to hang the arm from
export function stepShoulder(s, x, y, z, yaw, pitch, side, want, dt) {
  const goal = pickSide(x, y, z, yaw, pitch, side, want, s.side < 0 ? -1 : 1);
  s.side += (goal - s.side) * Math.min(1, dt * EASE_SIDE);
  return shoulderRoom(x, y, z, yaw, side * s.side);
}
// the least lift that leaves minArm of room (or the whole arm, if that is shorter); failing that, the lift with the most room.
// Lowering the arm again asks for a bit more room than raising it did, so it doesn't bob at the threshold.
export function pickLift(x, y, z, yaw, pitch, want, minArm, cur = 0) {
  const need = Math.min(want, minArm);
  let best = 0, most = -1;
  for (const l of LIFTS) {
    const room = armRoom(x, y, z, yaw, Math.max(MAX_LIFTED, pitch - l), want);
    if (room >= (l < cur - 0.01 ? Math.min(want, need * 1.3) : need) - 1e-3) return l;
    if (room > most + 0.05) { most = room; best = l; }
  }
  return best;
}
// one frame of the arm from the pivot (x, y, z). s = { arm, lift } carries over between frames; sets s.pitch and s.arm,
// the arm's angle and length to place the camera with this frame, and s.look: how far ahead along the aim the camera looks.
// Swung up, the arm also shortens towards minArm and the camera looks closer in, so the player stays in view below it.
export function stepArm(s, x, y, z, yaw, pitch, want, minArm, dt) {
  const goal = pickLift(x, y, z, yaw, pitch, want, minArm, s.lift);
  s.lift += (goal - s.lift) * Math.min(1, dt * EASE_LIFT);
  s.pitch = Math.max(MAX_LIFTED, pitch - s.lift);
  const k = Math.min(1, s.lift / FULL_LIFT);
  s.look = LOOK + (LOOK_LIFTED - LOOK) * k;
  const room = armRoom(x, y, z, yaw, s.pitch, Math.min(want, want + (minArm * 1.2 - want) * k));
  s.arm = room < s.arm ? room : s.arm + (room - s.arm) * Math.min(1, dt * EASE_OUT);
  return s;
}
