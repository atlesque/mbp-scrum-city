// Bailing out of a moving vehicle: the player is thrown out of the door side, square to the way the vehicle was
// going, keeps a share of its speed, tumbles along the road and gets up. It only ever stings a little, and the
// vehicle they just left lets them through for a moment so it can't roll over them on its way past.
// Pure numbers, so the rules are easy to test and tune.

export const BAIL = {
  hurtMin: 3,      // HP for bailing just above the kind's crash.exitSpeed
  hurtPerMs: 0.25, // more for every m/s above that
  hurtMax: 12,     // and never more than this, even at top speed
  out: 3.5,        // sideways speed out of the door, m/s
  outPerMs: 0.08,  // more the faster the vehicle was going
  outMax: 6.5,
  keep: 0.3,       // share of the vehicle's own speed the player keeps
  hop: 3,          // upward speed of the jump out, m/s
  gravity: 18,     // m/s², as on foot
  friction: 13,    // m/s² of slowing while sliding and rolling on the road
  rollR: 0.45,     // radius the body rolls over, m
  ghost: 1.5,      // seconds the vehicle just left ignores the player
};

// damage for leaving at `speed` (m/s) from a kind that counts it as a crash above `from`
export function bailDamage(speed, from) {
  if (!(speed > from)) return 0;
  return Math.min(BAIL.hurtMax, BAIL.hurtMin + (speed - from) * BAIL.hurtPerMs);
}

// the throw out of a vehicle facing `yaw` and moving at (vx, vz); side 1 is the door side (the vehicle's local +x,
// where kinds put exitAt), -1 the other. Sideways is always away from the vehicle, whatever it was doing.
export function bailLaunch(yaw, vx, vz, side) {
  const sx = Math.cos(yaw) * side, sz = -Math.sin(yaw) * side, sp = Math.hypot(vx, vz);
  const out = Math.min(BAIL.outMax, BAIL.out + sp * BAIL.outPerMs);
  return { vx: vx * BAIL.keep + sx * out, vz: vz * BAIL.keep + sz * out, vy: BAIL.hop, side, roll: 0, t: 0 };
}

// one step of the tumble for a body { x, z, y, vx, vz, vy } and its launch `T`; true while it is still going.
// It flies the short hop, slides and rolls sideways (T.roll, radians round the way it faces) and comes up standing.
export function tumbleStep(b, T, dt) {
  T.t += dt;
  b.x += b.vx * dt; b.z += b.vz * dt;
  if (b.y > 0 || b.vy > 0) {
    b.vy -= BAIL.gravity * dt; b.y += b.vy * dt;
    if (b.y <= 0) { b.y = 0; b.vy = 0; }
  } else {
    const sp = Math.hypot(b.vx, b.vz), dec = BAIL.friction * dt;
    if (sp <= dec) b.vx = b.vz = 0; else { const k = 1 - dec / sp; b.vx *= k; b.vz *= k; }
  }
  // the body rolls with its sideways speed, and on the last turn eases up onto its feet
  const sp = Math.hypot(b.vx, b.vz), turn = Math.PI * 2;
  if (sp > 1.5) T.roll += T.side * sp / BAIL.rollR * dt * 0.5;
  else { const end = Math.ceil(Math.abs(T.roll) / turn - 0.15) * turn * T.side; T.roll += (end - T.roll) * Math.min(1, dt * 8); }
  const settled = Math.abs(T.roll - Math.round(T.roll / turn) * turn) < 0.02;
  if (sp === 0 && b.y === 0 && settled && T.t > 0.4) { T.roll = 0; return false; }
  return T.t < 4; // never stuck rolling
}
