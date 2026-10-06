import { entities } from '../entities/registry.js';
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
// the play area: the inner faces of the walls round the city (world/edges.js) and the waterline
export const W = { minX: -207.5, maxX: 252, minZ: -207.5, maxZ: 207.5 };
export const ROADS = [-200, -150, -100, -50, 0, 50, 100, 150, 200];
function pushOut(o, r, x0, x1, z0, z1) {
  const cx = clamp(o.x, x0, x1), cz = clamp(o.z, z0, z1), dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) { const d = Math.sqrt(d2); o.x += dx / d * (r - d); o.z += dz / d * (r - d); }
  else { const l = o.x - x0, rr = x1 - o.x, t = o.z - z0, b = z1 - o.z, m = Math.min(l, rr, t, b); if (m === l) o.x = x0 - r; else if (m === rr) o.x = x1 + r; else if (m === t) o.z = z0 - r; else o.z = z1 + r; }
  return true;
}
// a capsule along a heading (bikes): the segment runs from `back` to `front` metres along the yaw
export function pushOutSeg(o, r, x, z, yaw, back, front) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), t = clamp((o.x - x) * fx + (o.z - z) * fz, back, front), cx = x + fx * t, cz = z + fz * t;
  const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz; if (d2 >= r * r) return false;
  const d = Math.sqrt(d2); if (d > 1e-4) { o.x = cx + dx / d * r; o.z = cz + dz / d * r; } else { o.x = cx + fz * r; o.z = cz - fx * r; }
  return true;
}
// a box turned to a heading (cars): half width hw across, half length hl along the yaw
const _lo = { x: 0, z: 0 };
export function pushOutOBB(o, r, x, z, yaw, hw, hl) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = o.x - x, rz = o.z - z;
  _lo.x = rx * fz - rz * fx; _lo.z = rx * fx + rz * fz; // into box space: x across, z along
  if (!pushOut(_lo, r, -hw, hw, -hl, hl)) return false;
  o.x = x + _lo.x * fz + _lo.z * fx; o.z = z - _lo.x * fx + _lo.z * fz;
  return true;
}
// push a moving circle out of buildings, props and anything in the world with a pushOut trait
export function collide(o, r, self) {
  let hit = false;
  for (const c of nearColliders(o.x, o.z)) if (pushOut(o, r, c.x0, c.x1, c.z0, c.z1)) hit = true;
  for (const e of entities) {
    if (!e.pushOut || e === self || Math.abs(e.x - o.x) > 6 || Math.abs(e.z - o.z) > 6) continue;
    if (e.pushOut(o, r)) hit = true;
  }
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
// like wallHit, but also says which face of the building the ray struck: n gets its outward normal
// (straight up when nothing is in the way and the ray runs its full length)
export function wallHitFace(ox, oy, oz, dx, dy, dz, maxT, n) {
  let best = maxT, hit = null;
  for (const b of tallBoxes) { const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, 0, b.z0, b.x1, b.h, b.z1); if (t < best) { best = t; hit = b; } }
  n.set(0, 1, 0);
  if (hit) {
    const x = ox + dx * best, y = oy + dy * best, z = oz + dz * best;
    let d = Math.abs(y - hit.h);
    for (const [e, nx, nz] of [[Math.abs(x - hit.x0), -1, 0], [Math.abs(x - hit.x1), 1, 0], [Math.abs(z - hit.z0), 0, -1], [Math.abs(z - hit.z1), 0, 1]]) if (e < d) { d = e; n.set(nx, 0, nz); }
  }
  return best;
}
export function blocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz); if (L < 0.01) return false;
  return wallHit(ax, ay, az, dx / L, dy / L, dz / L, L) < L - 0.05;
}
