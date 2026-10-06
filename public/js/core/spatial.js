import { P, cam } from './state.js';
import { clamp } from './util.js';

// ================= WHERE SOUNDS ARE HEARD FROM =================
// Every sound with a source in the world is placed at that source: the Web Audio listener sits at the player's
// head and faces where the camera looks, and each source gets its own HRTF panner (core/audio.js), so a siren
// behind you sounds behind you, a chopper overhead sounds above you, and two police cars are two sirens.
// How loud a source is with distance is worked out here, so the game and the tests share one set of curves.

// the listener: at the player's head, facing the camera's view (+z at yaw 0; the right ear is then -x, the way
// the player strafes in player.js)
export const EAR_Y = 1.6;
export function listenerPose() {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  return {
    x: P.x, y: (P.y || 0) + EAR_Y, z: P.z,
    fx: sy * cp, fy: sp, fz: cy * cp, // forward
    ux: -sy * sp, uy: cp, uz: -cy * sp, // up, square to forward
  };
}
// the listener's right ear, as a unit vector (forward × up)
export function rightEar(L = listenerPose()) {
  return { x: L.fy * L.uz - L.fz * L.uy, y: L.fz * L.ux - L.fx * L.uz, z: L.fx * L.uy - L.fy * L.ux };
}
export const distToEar = (at, L = listenerPose()) => Math.hypot(at.x - L.x, (at.y ?? EAR_Y) - L.y, at.z - L.z);
export const distToPlayer = e => Math.hypot(e.x - P.x, e.z - P.z);

// How each kind of sound carries. `ref` is the distance it plays at full volume within; past that it follows
// the inverse distance law (half as loud at twice the distance, -6 dB per doubling, the way sound spreads in
// the open), then fades out over the last quarter before `max`, where it is dropped altogether so far-off
// sources cost nothing. A profile with its own `curve(d)` (the bike engine's) uses that instead.
export const HEAR = {
  shot: { ref: 10, max: 160 },
  boom: { ref: 22, max: 240 },
  voice: { ref: 4, max: 70 }, // screams
  horn: { ref: 6, max: 110 },
  thud: { ref: 4, max: 70 },
  near: { ref: 3, max: 3.5 }, // the player's own bumps: always at full volume, just placed on the side they came from
  ting: { ref: 2, max: 20 }, // a near miss whizzing past
  reload: { ref: 3, max: 35 }, // clicks and clacks of someone reloading
  siren: { ref: 10, max: 160 },
  rotor: { ref: 18, max: 200 },
};
export function falloff(d, p) {
  if (p.curve) return d >= p.max ? 0 : clamp(p.curve(d), 0, 1);
  if (d >= p.max) return 0;
  const inv = p.ref / Math.max(d, p.ref), fade = clamp((p.max - d) / (p.max * 0.25), 0, 1);
  return inv * fade;
}
export const heard = (at, p, L) => falloff(distToEar(at, L), p);

// Air soaks up the highs of far sounds, so distant ones are duller as well as quieter: a lowpass that is
// wide open up close and closes to AIR_FAR Hz at the profile's range.
export const AIR_NEAR = 18000, AIR_FAR = 2200;
export function airCutoff(d, p) {
  const k = clamp(d / p.max, 0, 1);
  return AIR_NEAR * Math.pow(AIR_FAR / AIR_NEAR, Math.sqrt(k));
}

// Doppler: the pitch of a source closing on the listener at `closing` m/s (negative when moving away), kept
// to a believable range so a frame's jitter can't warble it.
export const SPEED_OF_SOUND = 343;
export const doppler = closing => clamp(SPEED_OF_SOUND / (SPEED_OF_SOUND - clamp(closing, -60, 60)), 0.85, 1.18);

// a point `r` metres from the player's head in the direction (dx, dz): for a bump against the player's own
// vehicle, which should come from the side it hit
export function beside(dx, dz, r = 1.5) {
  const d = Math.hypot(dx, dz) || 1;
  return { x: P.x + dx / d * r, y: (P.y || 0) + EAR_Y, z: P.z + dz / d * r };
}
// a source at an entity, `h` metres above its feet
export const at = (e, h = 1) => ({ x: e.x, y: (e.y || 0) + h, z: e.z });
