import { bikes, cars } from '../core/state.js';
import { clamp } from '../core/util.js';

// ================= COLLISION =================
export const colliders = [], tallBoxes = [], HASH = new Map(), HC = 20;
const hkey = (i, j) => (i + 100) * 1000 + (j + 100);
export function addCollider(x0, x1, z0, z1, h, tall) {
  const c = { x0, x1, z0, z1, h }; colliders.push(c); if (tall) tallBoxes.push(c);
  for (let i = Math.floor(x0 / HC); i <= Math.floor(x1 / HC); i++) for (let j = Math.floor(z0 / HC); j <= Math.floor(z1 / HC); j++) {
    const k = hkey(i, j); if (!HASH.has(k)) HASH.set(k, []); HASH.get(k).push(c);
  }
}
const _near = [];
function nearColliders(x, z) {
  _near.length = 0; const ci = Math.floor(x / HC), cj = Math.floor(z / HC);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const l = HASH.get(hkey(i, j)); if (l) for (const c of l) if (!_near.includes(c)) _near.push(c); }
  return _near;
}
const W = { minX: -205, maxX: 252, minZ: -205, maxZ: 205 };
export const ROADS = [-200, -150, -100, -50, 0, 50, 100, 150, 200];
function pushOut(o, r, x0, x1, z0, z1) {
  const cx = clamp(o.x, x0, x1), cz = clamp(o.z, z0, z1), dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) { const d = Math.sqrt(d2); o.x += dx / d * (r - d); o.z += dz / d * (r - d); }
  else { const l = o.x - x0, rr = x1 - o.x, t = o.z - z0, b = z1 - o.z, m = Math.min(l, rr, t, b); if (m === l) o.x = x0 - r; else if (m === rr) o.x = x1 + r; else if (m === t) o.z = z0 - r; else o.z = z1 + r; }
  return true;
}
// bikes are a capsule along their heading
function pushOutSeg(o, r, b) {
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), t = clamp((o.x - b.x) * fx + (o.z - b.z) * fz, -0.8, 0.85), cx = b.x + fx * t, cz = b.z + fz * t;
  const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz; if (d2 >= r * r) return false;
  const d = Math.sqrt(d2); if (d > 1e-4) { o.x = cx + dx / d * r; o.z = cz + dz / d * r; } else { o.x = cx + fz * r; o.z = cz - fx * r; }
  return true;
}
export function collide(o, r, self) {
  let hit = false;
  for (const c of nearColliders(o.x, o.z)) if (pushOut(o, r, c.x0, c.x1, c.z0, c.z1)) hit = true;
  for (const car of cars) { if (Math.abs(car.x - o.x) > 6 || Math.abs(car.z - o.z) > 6) continue; if (pushOut(o, r, car.x - car.hx, car.x + car.hx, car.z - car.hz, car.z + car.hz)) hit = true; }
  for (const b of bikes) { if (b === self || Math.abs(b.x - o.x) > 3 || Math.abs(b.z - o.z) > 3) continue; if (pushOutSeg(o, r + 0.3, b)) hit = true; }
  const ox = o.x, oz = o.z; o.x = clamp(o.x, W.minX, W.maxX); o.z = clamp(o.z, W.minZ, W.maxZ);
  return hit || ox !== o.x || oz !== o.z;
}
export function isFree(x, z, r = 0.8) {
  if (x < W.minX + 2 || x > W.maxX - 6 || z < W.minZ + 2 || z > W.maxZ - 2) return false;
  for (const c of nearColliders(x, z)) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return false;
  return true;
}
export const onRoad = (x, z) => ROADS.some(r => Math.abs(x - r) < 6.5 || Math.abs(z - r) < 6.5) && x < 207;
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return Infinity; } else { let a = (x0 - ox) / dx, b = (x1 - ox) / dx; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return Infinity; } else { let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return Infinity; } else { let a = (z0 - oz) / dz, b = (z1 - oz) / dz; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (tmax < Math.max(tmin, 0)) return Infinity;
  return Math.max(tmin, 0);
}
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz, tc = lx * dx + ly * dy + lz * dz; if (tc < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc; if (d2 > r * r) return Infinity; return tc - Math.sqrt(r * r - d2);
}
export function wallHit(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  for (const b of tallBoxes) { const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, 0, b.z0, b.x1, b.h, b.z1); if (t < best) best = t; }
  return best;
}
export function blocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz); if (L < 0.01) return false;
  return wallHit(ax, ay, az, dx / L, dy / L, dz / L, L) < L - 0.05;
}
