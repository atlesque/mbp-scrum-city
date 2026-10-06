import { P, cam } from './state.js';
import { clamp } from './util.js';

// volume and stereo pan for a sound at a world position, heard from the player
export function vol3d(x, z) { const d = Math.hypot(x - P.x, z - P.z); return clamp(1 - d / 110, 0, 1) ** 1.5; }
// stereo pan (-1 left, 1 right) for a sound at offset dx, dz from the listener, facing `yaw`. It eases to the
// middle within PAN_NEAR metres, so something right on top of you doesn't flick between ears, and stops short
// of a hard left or right so the far ear still hears a little. Pass near = 0 for a bump against the player's own
// vehicle, which comes from the side it hit however close that is.
export const PAN_NEAR = 4, PAN_WIDTH = 0.9;
export function panFor(dx, dz, yaw, near = PAN_NEAR) {
  const d = Math.hypot(dx, dz); if (d < 1e-3) return 0;
  return clamp((dx * -Math.cos(yaw) + dz * Math.sin(yaw)) / d, -1, 1) * (near ? Math.min(1, d / near) : 1) * PAN_WIDTH;
}
export const pan3d = (x, z) => panFor(x - P.x, z - P.z, cam.yaw);
export const distToPlayer = e => Math.hypot(e.x - P.x, e.z - P.z);
