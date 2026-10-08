// ================= SUN PATH =================
// Where the sun sits in the sky over the day/night loop (render/lighting.js). It comes up on the far side
// of the city at dawn, swings low across the sky and goes down where it always set, sinking below the
// horizon as dusk falls. Through the night it carries on round underneath, and the moon hangs opposite it.
//
// p is the share of the loop gone: sunset until 0.35, dusk to 0.45, night until 0.85, dawn to 0.95.
export const RISE = 0.86, SET = 0.44; // the sun crosses the horizon here, in the middle of dawn and dusk
export const PEAK = 0.45;             // highest the sun gets, in radians above the horizon (about 26°)
const SUNSET_AZ = Math.atan2(0.32, 1); // the old fixed sun direction (1, 0.13, 0.32): where it goes down
const DAY = (SET - RISE + 1) % 1;

// height above the horizon (radians, negative below it) and bearing round the y axis
export function sunAngles(p) {
  const f = ((p - RISE) % 1 + 1) % 1;
  if (f <= DAY) { const t = f / DAY; return { el: PEAK * Math.sin(Math.PI * t), az: SUNSET_AZ + Math.PI * (1 - t) }; }
  const t = (f - DAY) / (1 - DAY);
  return { el: -PEAK * Math.sin(Math.PI * t), az: SUNSET_AZ - Math.PI * t };
}

// unit vector towards the sun, into out ({x, y, z})
export function sunDir(p, out = { x: 0, y: 0, z: 0 }) {
  const { el, az } = sunAngles(p), c = Math.cos(el);
  out.x = c * Math.cos(az); out.y = Math.sin(el); out.z = c * Math.sin(az);
  return out;
}

// with the time of day pinned (lighting.set: 0 sunset, 1 night), the sun sinks straight down from its
// sunset spot instead of following the clock
export function pinnedSunDir(n, out = { x: 0, y: 0, z: 0 }) {
  const el = 0.13 - n * 0.5, c = Math.cos(el);
  out.x = c * Math.cos(SUNSET_AZ); out.y = Math.sin(el); out.z = c * Math.sin(SUNSET_AZ);
  return out;
}
