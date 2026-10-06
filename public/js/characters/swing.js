// Melee swings: how far through a swing someone is, when it lands, and the pose it puts them in.
// Pure numbers (no Three.js), so the timing and the poses are easy to test and tune.
//
// A pose sets the right arm (r), optionally the left arm (l) and right leg (leg) as rotations, and how far
// the body twists (tw, radians; positive turns to the character's left), and how far the wrist turns the weapon
// back towards the line of the arm (wr), so a bat comes round flat instead of pointing at the sky. Arms hang down at [0, 0, 0];
// x below 0 raises an arm forward (-π/2 points it straight ahead), and z sweeps it across the body
// (on the right arm, positive z pulls it in towards the left side).

// keyframes per swing: [k, pose], with k from 0 (start) to 1 (end); the hit lands at HIT_AT
const GUARD = { r: [-0.95, 0, 0.35], l: [-1.15, 0, -0.35], tw: 0 };
const mirror = p => ({ r: p.l && [p.l[0], p.l[1], -p.l[2]], l: p.r && [p.r[0], p.r[1], -p.r[2]], leg: p.leg, tw: -(p.tw || 0) });
const JAB = [[0, GUARD], [0.18, { r: [-0.7, 0, 0.3], l: [-1.15, 0, -0.35], tw: -0.25 }], [0.35, { r: [-1.62, 0, 0.12], l: [-1.0, 0, -0.4], tw: 0.4 }], [0.6, { r: [-1.5, 0, 0.2], l: [-1.05, 0, -0.38], tw: 0.3 }], [1, GUARD]];
export const MELEE_ANIMS = {
  // a right jab, a left jab, then a front kick (step 0, 1, 2 of a combo)
  punch: [
    JAB,
    JAB.map(([k, p]) => [k, mirror(p)]),
    [[0, GUARD], [0.2, { ...GUARD, leg: 0.35, tw: -0.15 }], [0.4, { r: [-0.7, 0, 0.5], l: [-0.8, 0, -0.5], leg: -1.5, tw: 0.25 }], [0.65, { ...GUARD, leg: -1.2, tw: 0.15 }], [1, GUARD]],
  ],
  // two hands, round from the right shoulder and across the body (bat, golf club, katana)
  swing: [[[0, { r: [-0.8, 0, 0.1], l: [-0.85, 0, -0.5], tw: 0 }], [0.35, { r: [-1.45, 0, -1.25], l: [-1.4, 0, -0.95], tw: -0.75, wr: 0.3 }], [0.5, { r: [-1.4, 0, 0.95], l: [-1.4, 0, 0.6], tw: 0.7, wr: 0.85 }], [0.7, { r: [-1.2, 0, 1.15], l: [-1.2, 0, 0.85], tw: 0.8, wr: 0.85 }], [1, { r: [-0.8, 0, 0.1], l: [-0.85, 0, -0.5], tw: 0 }]]],
  // one hand, raised over the shoulder and brought down at a slant (nightstick, machete)
  chop: [[[0, { r: [-0.6, 0, 0.15], tw: 0 }], [0.38, { r: [-2.75, 0, -0.35], tw: -0.35 }], [0.5, { r: [-1.0, 0, 0.4], tw: 0.35, wr: 0.9 }], [0.7, { r: [-0.75, 0, 0.45], tw: 0.25, wr: 0.6 }], [1, { r: [-0.6, 0, 0.15], tw: 0 }]]],
  // pulled back, then thrust straight ahead (knife)
  stab: [[[0, { r: [-1.0, 0, 0.2], tw: 0 }], [0.28, { r: [-0.75, 0, -0.1], tw: -0.3 }], [0.42, { r: [-1.68, 0, 0.12], tw: 0.35 }], [0.65, { r: [-1.5, 0, 0.15], tw: 0.2 }], [1, { r: [-1.0, 0, 0.2], tw: 0 }]]],
  // held out in front in both hands while it cuts (chainsaw)
  saw: [[[0, { r: [-1.05, 0, 0.15], l: [-1.0, 0, -0.5], tw: 0.1 }], [1, { r: [-1.05, 0, 0.15], l: [-1.0, 0, -0.5], tw: 0.1 }]]],
};
export const HIT_AT = { punch: [0.35, 0.35, 0.4], swing: [0.5], chop: [0.5], stab: [0.42], saw: [0] };

// what someone holding a melee weapon does with their arms while ready to swing (right mouse, or an NPC squaring up)
export const READY = { punch: GUARD, swing: { r: [-0.8, 0, 0.1], l: [-0.85, 0, -0.5], tw: 0 }, chop: { r: [-0.6, 0, 0.15] }, stab: { r: [-1.0, 0, 0.2] }, saw: MELEE_ANIMS.saw[0][0][1] };

const mix = (a, b, t) => a == null ? b : b == null ? a : a + (b - a) * t;
const mix3 = (a, b, t) => !a ? b : !b ? a : [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// the pose k (0..1) of the way through a swing; step picks the move within a combo
export function swingPose(anim, k, step = 0) {
  const moves = MELEE_ANIMS[anim], keys = moves[step % moves.length];
  k = Math.min(1, Math.max(0, k));
  let i = 0; while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
  const [k0, a] = keys[i], [k1, b] = keys[i + 1], t = k1 > k0 ? Math.min(1, Math.max(0, (k - k0) / (k1 - k0))) : 1;
  const s = t * t * (3 - 2 * t); // ease in and out of each key
  return { r: mix3(a.r, b.r, s), l: mix3(a.l, b.l, s), leg: a.leg == null && b.leg == null ? null : mix(a.leg ?? 0, b.leg ?? 0, s), tw: mix(a.tw || 0, b.tw || 0, s), wr: mix(a.wr || 0, b.wr || 0, s) };
}

// start a swing on an actor; dur is how long the whole move takes
export function startSwing(a, anim, dur, step = 0) {
  const at = HIT_AT[anim];
  a.swing = { anim, t: 0, dur, step, hitAt: at[step % at.length], hit: false };
  return a.swing;
}
// move a swing on; onHit runs once, when the blow lands. Returns false once the swing is over.
export function tickSwing(a, dt, onHit) {
  const s = a.swing; if (!s) return false;
  s.t += dt;
  if (!s.hit && s.t >= s.hitAt * s.dur) { s.hit = true; onHit && onHit(s); }
  if (s.t >= s.dur) { a.swing = null; return false; }
  return true;
}
// how strongly a swing's pose replaces the walking pose: eased in at the start, out at the end
export const swingWeight = s => Math.min(1, s.t / (s.dur * 0.12 + 1e-4), (s.dur - s.t) / (s.dur * 0.25 + 1e-4));
