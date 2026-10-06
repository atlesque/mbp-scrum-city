// Bodies thrown by explosions: the launch a blast gives a corpse, and the ballistic flight that
// follows (gravity, tumbling, a small bounce, then the slide the dead already do on the ground).
// Pure numbers, so the rules are easy to test and tune.

export const FLING = {
  gravity: 22,     // m/s²
  minOut: 7,       // outward speed at the blast's edge, m/s
  maxOut: 22,      // outward speed at its centre
  minUp: 6,        // upward speed at the edge
  maxUp: 17,       // upward speed at the centre
  spin: 9,         // tumble rate at the centre, rad/s
  bounce: 0.3,     // share of the falling speed kept on a hard landing
  bounceMin: 5,    // landing faster than this bounces, slower settles
  landSlide: 0.55, // share of the horizontal speed kept on each landing
};

// launch for a body at offset (dx, dz) from a blast of radius R, or null when out of reach.
// rand() picks a direction when the body sits right on the centre; power above 1 throws further
// (rockets), mostly outward with a bit more height.
export function blastLaunch(dx, dz, R, rand = Math.random, power = 1) {
  const d = Math.hypot(dx, dz); if (d >= R) return null;
  const f = 1 - d / R;
  let nx = dx / d, nz = dz / d;
  if (!(d > 0.05)) { const a = rand() * Math.PI * 2; nx = Math.cos(a); nz = Math.sin(a); }
  const out = (FLING.minOut + (FLING.maxOut - FLING.minOut) * f) * power, lift = Math.sqrt(power);
  return {
    vx: nx * out, vz: nz * out,
    vy: (FLING.minUp + (FLING.maxUp - FLING.minUp) * f) * lift,
    spin: FLING.spin * (0.4 + 0.6 * f),
  };
}

// apply a launch to a body ({ x, z, y?, svx, svz, vy, flip, flipV })
export function launch(b, l) {
  b.svx = (b.svx || 0) + l.vx; b.svz = (b.svz || 0) + l.vz;
  b.vy = Math.max(b.vy || 0, 0) + l.vy; b.y = b.y || 0;
  b.flipV = l.spin; b.flip = b.flip || 0;
}

export const airborne = b => b.y > 0 || b.vy > 0;

// one step of flight; returns true while the body is still in the air
export function flyStep(b, dt) {
  b.x += b.svx * dt; b.z += b.svz * dt;
  b.vy -= FLING.gravity * dt; b.y += b.vy * dt; b.flip += b.flipV * dt;
  if (b.y > 0) return true;
  b.y = 0;
  b.svx *= FLING.landSlide; b.svz *= FLING.landSlide;
  if (b.vy < -FLING.bounceMin) { b.vy = -b.vy * FLING.bounce; b.flipV *= 0.5; return true; }
  b.vy = 0; b.flipV = 0;
  return false;
}

// on the ground the tumble eases back to the nearest whole turn, so the body lies flat
export function settleFlip(b, dt) {
  if (!b.flip) return;
  const T = Math.PI * 2, target = Math.round(b.flip / T) * T;
  b.flip += (target - b.flip) * Math.min(1, dt * 10);
  if (Math.abs(target - b.flip) < 0.01) b.flip = 0;
}
