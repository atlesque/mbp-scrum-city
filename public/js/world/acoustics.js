import { clamp } from '../core/util.js';
import { wallHit } from './collision.js';

// ================= HOW THE STREET AROUND YOU SOUNDS =================
// Shots, bangs and horns ring off the buildings around the listener (the echo bus in core/audio.js). roomAt
// sends a ring of level rays out from the listener's head: the more of them hit a wall close by, the more of each
// sound comes back as echo, and the further the walls, the later the first slap returns. A narrow street rings,
// a park or the beach is nearly dry. Up on a roof the street is below you: what comes back is the far side of the
// city, late and faint.
export const ECHO_RAYS = 8, ECHO_REACH = 45; // rays, and how far (m) a wall still sends a slap back
export const ROOF_Y = 5; // feet this high are up on a roof
const SPEED_OF_SOUND = 343;

// { wet: how much of a sound's echo is heard (0 to 1), delay: seconds until the first slap, tail: how long the ring
// hangs on (0 short to 1 long) }
export function roomAt(x, y, z, feet = 0) {
  let hits = 0, sum = 0;
  for (let i = 0; i < ECHO_RAYS; i++) {
    const a = i / ECHO_RAYS * Math.PI * 2, t = wallHit(x, y, z, Math.sin(a), 0, Math.cos(a), ECHO_REACH);
    if (t < ECHO_REACH) { hits++; sum += t; }
  }
  const shut = hits / ECHO_RAYS, mean = hits ? sum / hits : ECHO_REACH;
  const r = { wet: 0.06 + 0.5 * shut ** 1.3, delay: clamp(2 * mean / SPEED_OF_SOUND, 0.03, 0.26), tail: clamp(mean / ECHO_REACH, 0.2, 1) };
  if (feet > ROOF_Y) { r.wet = Math.max(r.wet * 0.6, 0.18); r.delay = Math.max(r.delay, 0.22); r.tail = 1; }
  return r;
}
