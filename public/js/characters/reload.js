import { clamp, lerp } from '../core/util.js';

// ================= RELOAD MOVES =================
// Each move is keyframes over the reload, u from 0 to 1: [u, right arm x, right arm z, left arm x, left arm z, gun roll].
// Arm x is the swing (0 hangs down, -1.57 points ahead, -3 is overhead), arm z brings a hand across the body
// (+ for the right arm, - for the left) and gun roll turns the gun on its barrel to show the magazine well.
// The pose eases in from and back out to whatever the arms were doing, so a move needn't start or end in the aim.
// Key times line up with the clicks in each gun's reload sound.
const AIM = -1.57, AIM_L = -1.49, AIM_LZ = -0.62;
export const RELOAD_ANIMS = {
  // one hand drops the magazine and fetches a fresh one from the belt, slaps it in, then racks the slide
  pistol: [
    [0, AIM, 0, 0, 0, 0], [0.12, -1.0, 0.45, -0.3, 0, 0.5], [0.3, -1.0, 0.45, 0.2, 0.1, 0.5], [0.45, -1.0, 0.45, -1.0, -0.55, 0.5],
    [0.62, -1.0, 0.45, -0.95, -0.5, 0.35], [0.75, -1.05, 0.4, -1.25, -0.4, 0.2], [0.86, -1.05, 0.4, -0.8, -0.55, 0.1], [1, AIM, 0, 0, 0, 0],
  ],
  // a two-handed gun tipped on its side: magazine out, a new one from the belt, slapped home, bolt pulled
  mag: [
    [0, AIM, 0, AIM_L, AIM_LZ, 0], [0.14, -1.1, 0.3, -1.0, -0.5, 0.6], [0.24, -1.1, 0.3, -0.85, -0.45, 0.6], [0.42, -1.1, 0.3, 0.25, 0.1, 0.6],
    [0.68, -1.1, 0.3, -1.0, -0.5, 0.6], [0.74, -1.12, 0.3, -0.92, -0.52, 0.55], [0.84, -1.15, 0.28, -1.3, -0.35, 0.3],
    [0.9, -1.15, 0.28, -1.1, -0.45, 0.2], [1, AIM, 0, AIM_L, AIM_LZ, 0],
  ],
  // three shells thumbed into the tube from the belt, then the pump racked back and forward
  pump: [
    [0, -1.2, 0.25, -1.05, -0.5, -0.9], [0.03, -1.2, 0.25, -1.05, -0.5, -0.9], [0.14, -1.2, 0.25, 0.1, 0.05, -0.9],
    [0.25, -1.2, 0.25, -1.05, -0.5, -0.9], [0.36, -1.2, 0.25, 0.1, 0.05, -0.9], [0.48, -1.2, 0.25, -1.05, -0.5, -0.9],
    [0.6, -1.3, 0.15, AIM_L, AIM_LZ, -0.3], [0.7, -1.45, 0.05, AIM_L, AIM_LZ, 0], [0.75, -1.45, 0.05, -1.15, -0.5, 0],
    [0.84, -1.45, 0.05, AIM_L, AIM_LZ, 0], [1, AIM, 0, AIM_L, AIM_LZ, 0],
  ],
  // bolt action: the bolt lifted and pulled back, the magazine swapped from the belt, the bolt pushed home and locked
  bolt: [
    [0, AIM, 0, AIM_L, AIM_LZ, 0], [0.07, -1.35, 0.15, -1.2, -0.25, 0], [0.15, -1.35, 0.15, -1.38, -0.08, 0], [0.22, -1.15, 0.3, -1.0, -0.5, 0.4],
    [0.4, -1.15, 0.3, 0.25, 0.1, 0.4], [0.58, -1.15, 0.3, -1.0, -0.5, 0.4], [0.64, -1.15, 0.3, -0.95, -0.5, 0.35],
    [0.72, -1.35, 0.15, -1.38, -0.08, 0], [0.8, -1.35, 0.15, -1.15, -0.28, 0], [0.86, -1.35, 0.15, -1.22, -0.2, 0], [1, AIM, 0, AIM_L, AIM_LZ, 0],
  ],
  // the minigun lowered, the empty ammo box unlatched and swung away, a full one hooked on and slammed home
  box: [
    [0, AIM, 0, AIM_L, AIM_LZ, 0], [0.08, -0.95, 0.3, -0.9, -0.5, 0], [0.14, -0.95, 0.3, -0.75, -0.5, 0], [0.3, -0.9, 0.3, 0.45, 0.3, 0],
    [0.45, -0.9, 0.3, 0.1, 0.1, 0], [0.64, -0.95, 0.3, -0.9, -0.5, 0], [0.76, -0.95, 0.3, -0.85, -0.5, 0],
    [0.82, -1.0, 0.3, -1.2, -0.45, 0], [0.88, -1.0, 0.3, -0.9, -0.5, 0], [1, AIM, 0, AIM_L, AIM_LZ, 0],
  ],
  // a rocket pulled from the back over the shoulder, slid into the front of the tube, then the latch closed
  tube: [
    [0, AIM, 0, AIM_L, AIM_LZ, 0], [0.12, -1.3, 0.2, -2.9, 0.2, 0], [0.3, -1.3, 0.2, -1.8, -0.3, 0], [0.5, -1.3, 0.2, -1.55, -0.5, 0],
    [0.72, -1.3, 0.2, -1.05, -0.55, 0], [0.8, -1.3, 0.2, -1.05, -0.55, 0], [0.85, -1.35, 0.2, -1.25, -0.5, 0], [1, AIM, 0, AIM_L, AIM_LZ, 0],
  ],
};
const ss = t => t * t * (3 - 2 * t);
// the move's pose at u: { rx, rz, lx, lz, roll }
export function reloadPose(name, u) {
  const keys = RELOAD_ANIMS[name] || RELOAD_ANIMS.mag;
  u = clamp(u, 0, 1);
  let i = 1; while (i < keys.length - 1 && keys[i][0] < u) i++;
  const a = keys[i - 1], b = keys[i], t = ss(clamp((u - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1));
  return { rx: lerp(a[1], b[1], t), rz: lerp(a[2], b[2], t), lx: lerp(a[3], b[3], t), lz: lerp(a[4], b[4], t), roll: lerp(a[5], b[5], t) };
}
// lay the move over the arms the walk or aim already set, easing in over the first and out over the last 10%
export function applyReload(c, name, u) {
  const p = reloadPose(name, u), w = ss(clamp(Math.min(u, 1 - u) / 0.1, 0, 1));
  c.armR.rotation.x = lerp(c.armR.rotation.x, p.rx, w); c.armR.rotation.z = lerp(c.armR.rotation.z, p.rz, w);
  c.armL.rotation.x = lerp(c.armL.rotation.x, p.lx, w); c.armL.rotation.z = lerp(c.armL.rotation.z, p.lz, w);
  c.gunHolder.rotation.y = p.roll * w;
}
