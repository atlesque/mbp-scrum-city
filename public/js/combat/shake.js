// Screen shake from explosions: bigger blasts shake harder and reach further, and the shake fades with distance.
export const SHAKE = {
  reachMul: 4,   // a blast is felt out to this many blast radii (rocket 40 m, car 36 m, bike 24 m)
  falloff: 1.5,  // > 1 drops off quickly away from the blast, so only nearby ones really rattle the camera
  refR: 10,      // blast radius that shakes at full strength (a rocket)
  minSize: 0.5, maxSize: 1.4,
  cap: 1.3,      // stacked blasts add up, to this much at most
};
// How much shake one blast of radius R gives at distance d.
export function blastShake(R, d) {
  const reach = R * SHAKE.reachMul;
  if (!(d < reach)) return 0;
  const size = Math.min(SHAKE.maxSize, Math.max(SHAKE.minSize, R / SHAKE.refR));
  return size * Math.pow(1 - d / reach, SHAKE.falloff);
}
// Adds a blast's shake to what is already there, capped, never lowering a bigger shake already running.
export function stackShake(cur, add) {
  return add > 0 ? Math.max(cur, Math.min(SHAKE.cap, cur + add)) : cur;
}
