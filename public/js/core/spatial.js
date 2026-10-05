import { P, cam } from './state.js';
import { clamp } from './util.js';

// volume and stereo pan for a sound at a world position, heard from the player
export function vol3d(x, z) { const d = Math.hypot(x - P.x, z - P.z); return clamp(1 - d / 110, 0, 1) ** 1.5; }
export function pan3d(x, z) { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1; return clamp((dx * -Math.cos(cam.yaw) + dz * Math.sin(cam.yaw)) / d, -1, 1) * 0.8; }
export const distToPlayer = e => Math.hypot(e.x - P.x, e.z - P.z);
