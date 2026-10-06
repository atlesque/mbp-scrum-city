import { clamp } from '../core/util.js';
import { box } from '../render/geometry.js';
import { pushOut, rayBox } from './collision.js';

// ================= ROOFTOPS =================
// A few ordinary city buildings get a lit door at street level. E takes the stairs (a short fade, no
// stairwell) to a fenced roof with a stair hut, whose door leads back down. The buildings are picked
// after the city is built, without the seeded random, so the rest of the layout stays the same.
// The three landmarks get a door too (world/landmarks.js hands their roofs over in landmarkRoofs).
// Every other flat roof can be stood on as well: jump (twice, in the air) or vault over a railing to get across.
export const ROOF_COUNT = 8;
const RAIL = 0.35; // the walkable area stops this far in from the wall line
const RAIL_H = 1.15; // railings stop anyone whose feet are lower than this over the roof; higher, they pass over
const HUT = { w: 3, h: 2.7, d: 3 };
const FACES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const STAND = 0.06; // feet sit this far over a solid top (a hut, an air-con unit, a landmark's roof)
export const STEP = 0.6; // a top up to this far above the feet is stepped (or pulled) up onto
// every flat-roofed building city.js puts up ({ x0, x1, z0, z1, h, face, col, trim, parapet? }), filled while it builds
export const roofSpots = [];
// other flat tops city.js puts up that never get a door (shops, the hospital): { x0, x1, z0, z1, floor }
export const flatRoofs = [];
// the landmarks' roofs, filled by world/landmarks.js in world metres: { area, floor, blocks?, door? } (see doorRoof)
export const landmarkRoofs = [];
// the roofs with doors, filled by buildRooftops
export const ROOFS = [];
// every roof the player can stand on, door or not, filled by buildRooftops: { area, floor, blocks, rails }
export const SURFACES = [];

// the railings round a roof as thin walls, just inside its edge (the wall line x0..z1)
function railsFor(x0, x1, z0, z1, floor) {
  const y0 = floor, y1 = floor + RAIL_H, a = 0.03, b = 0.13;
  return [
    { x0, x1, z0: z0 + a, z1: z0 + b, y0, y1 }, { x0, x1, z0: z1 - b, z1: z1 - a, y0, y1 },
    { x0: x0 + a, x1: x0 + b, z0, z1, y0, y1 }, { x0: x1 - b, x1: x1 - a, z0, z1, y0, y1 },
  ];
}
// Lay out one roof: the street door, the walkable area, the hut and the things on the roof to walk round.
export function makeRoof(b) {
  const fn = FACES[b.face], cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
  const halfN = (fn[0] ? w : d) / 2, halfU = (fn[0] ? d : w) / 2; // half depths along the facing and across it
  // local (u across the face, v out of it) to world
  const at = (u, v) => ({ x: cx + (fn[0] ? 0 : u) + fn[0] * v, z: cz + (fn[0] ? u : 0) + fn[1] * v });
  const rect = (u, v, hu, hv) => { const c = at(u, v), hx = fn[0] ? hv : hu, hz = fn[0] ? hu : hv; return { x0: c.x - hx, x1: c.x + hx, z0: c.z - hz, z1: c.z + hz }; };
  const floor = b.h + 0.64, hutV = -halfN * 0.2;
  const ac = [-1, 1].map(s => ({ ...rect(s * halfU * 0.55, -halfN * 0.62, 0.9, 0.7), y0: floor, y1: floor + 1.15 }));
  return {
    ...b, cx, cz, fn, floor, yaw: Math.atan2(fn[0], fn[1]),
    door: at(0, halfN), // middle of the street face
    street: at(0, halfN + 1.1), // where the player stands to use it, and lands coming down
    walk: { x0: b.x0 + RAIL, x1: b.x1 - RAIL, z0: b.z0 + RAIL, z1: b.z1 - RAIL },
    area: { x0: b.x0 - 0.25, x1: b.x1 + 0.25, z0: b.z0 - 0.25, z1: b.z1 + 0.25 }, // the roof trim sticks out past the walls
    hut: { ...rect(0, hutV, HUT.w / 2, HUT.d / 2), c: at(0, hutV), door: at(0, hutV + HUT.d / 2) },
    hutOut: at(0, hutV + HUT.d / 2 + 1.1),
    gun: 'sniper', gunAt: at(-halfU * 0.45, halfN * 0.4), // a sniper rifle waits on every roof (main.js)
    ac,
    blocks: [{ ...rect(0, hutV, HUT.w / 2, HUT.d / 2), y0: floor, y1: floor + HUT.h + 0.25 }, ...ac, ...(b.parapet ? [b.parapet] : [])],
    rails: railsFor(b.x0, b.x1, b.z0, b.z1, floor),
  };
}
// A landmark's roof with a door (world/landmarks.js gives it in world metres): the street door in the wall at `door`,
// facing fn, and the stair hut at `hut` with its door facing hfn. No gravel and no air-con: the building has its own roof.
export function doorRoof(o) {
  const { area: A, floor, fn, hfn } = o, at = (p, f, k) => ({ x: p.x + f[0] * k, z: p.z + f[1] * k });
  const hut = { x0: o.hut.x - HUT.w / 2, x1: o.hut.x + HUT.w / 2, z0: o.hut.z - HUT.d / 2, z1: o.hut.z + HUT.d / 2, c: o.hut, door: at(o.hut, hfn, HUT.d / 2) };
  return {
    x0: A.x0, x1: A.x1, z0: A.z0, z1: A.z1, h: floor, col: o.col, trim: o.trim, landmark: true,
    cx: (A.x0 + A.x1) / 2, cz: (A.z0 + A.z1) / 2, fn, hfn, floor, yaw: Math.atan2(fn[0], fn[1]), hutYaw: Math.atan2(hfn[0], hfn[1]),
    door: o.door, street: at(o.door, fn, 1.1),
    walk: { x0: A.x0 + RAIL, x1: A.x1 - RAIL, z0: A.z0 + RAIL, z1: A.z1 - RAIL }, area: A,
    hut, hutOut: at(o.hut, hfn, HUT.d / 2 + 1.1),
    gun: o.gun, gunAt: o.gunAt, jetpackAt: o.jetpackAt,
    ac: [],
    blocks: [{ x0: hut.x0, x1: hut.x1, z0: hut.z0, z1: hut.z1, y0: floor, y1: floor + HUT.h + 0.25 }, ...(o.blocks || [])],
    rails: railsFor(A.x0, A.x1, A.z0, A.z1, floor),
  };
}
// a roof without a door or railings: walk off its edge and you fall
export const plainRoof = (area, floor, blocks = []) => ({ area, floor, blocks, rails: [] });

// Choose n buildings spread over the map: first the one closest to `near` (the spawn), then each time
// the one farthest from those already chosen. Only roofs big enough for the hut and of a sensible height.
export function pickRoofs(spots, n, near) {
  const ok = spots.filter(b => b.h >= 9 && b.h <= 30 && b.x1 - b.x0 >= 10 && b.z1 - b.z0 >= 10).map(makeRoof);
  if (!ok.length) return [];
  const dist = (a, p) => Math.hypot(a.street.x - p.x, a.street.z - p.z);
  const out = [ok.reduce((best, r) => dist(r, near) < dist(best, near) ? r : best)];
  while (out.length < Math.min(n, ok.length)) {
    let best = null, bd = -1;
    for (const r of ok) { if (out.includes(r)) continue; const d = Math.min(...out.map(o => dist(r, o.street))); if (d > bd) { bd = d; best = r; } }
    out.push(best);
  }
  return out;
}

// The highest top under (x, z) that feet at height y can be on: a roof, or a hut or air-con unit on one, no more
// than STEP above them; the street (0) when there is none. roof is the roof it belongs to.
export function surfaceAt(x, z, y, list = SURFACES) {
  let floor = 0, roof = null;
  for (const s of list) {
    const A = s.area;
    if (x < A.x0 || x > A.x1 || z < A.z0 || z > A.z1 || s.floor > y + STEP) continue;
    if (s.floor > floor) { floor = s.floor; roof = s; }
    for (const b of s.blocks) {
      const top = b.y1 + STAND;
      if (top > floor && top <= y + STEP && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) { floor = top; roof = s; }
    }
  }
  return { floor, roof };
}
// Keep a circle with its feet at height y out of the huts, air-con units and railings on the roofs round it
// that reach above its feet (and not over its head).
export function collideRoofs(o, r, y, list = SURFACES) {
  let hit = false;
  for (const s of list) {
    const A = s.area;
    if (o.x < A.x0 - 2 || o.x > A.x1 + 2 || o.z < A.z0 - 2 || o.z > A.z1 + 2 || y + 1.8 < s.floor || y > s.floor + 8) continue;
    for (const b of s.blocks) if (y < b.y1 + STAND - 0.01 && y + 1.8 > b.y0 && pushOut(o, r, b.x0, b.x1, b.z0, b.z1)) hit = true;
    for (const b of s.rails) if (y < b.y1 && y + 1.8 > b.y0 && pushOut(o, r, b.x0, b.x1, b.z0, b.z1)) hit = true;
  }
  return hit;
}
// one roof only, with the feet on it
export const collideRoof = (o, r, roof, y = roof.floor) => collideRoofs(o, r, y, [roof]);

// how far a ray (the camera's, looking back from the player) gets before the hut or an air-con unit
export function roofHit(roof, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  for (const b of roof.blocks) { const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1); if (t < best) best = t; }
  return best;
}

// a door in a wall facing fn: dark frame, warm lit panel (neon, so it glows at night) and a sign above
function door(plain, neon, sign, x, y, z, fn, label) {
  const along = (w, t) => [fn[0] ? t : w, fn[0] ? w : t];
  const [fw, fd] = along(1.7, 0.1), [pw, pd] = along(1.25, 0.08);
  box(plain, fw, 2.2, fd, x + fn[0] * 0.05, y + 1.1, z + fn[1] * 0.05, '#2e2838');
  box(neon, pw, 1.95, pd, x + fn[0] * 0.11, y + 0.98, z + fn[1] * 0.11, '#ffd889');
  const [hw, hd] = along(0.08, 0.08);
  box(plain, hw, 0.3, hd, x + fn[0] * 0.17 + fn[1] * 0.4, y + 1.05, z + fn[1] * 0.17 - fn[0] * 0.4, '#3b3446'); // handle
  sign({ text: label, x: x + fn[0] * 0.2, y: y + 2.42, z: z + fn[1] * 0.2, ry: Math.atan2(fn[0], fn[1]), w: 1.3, color: '#5dff9e', font: '"Bowlby One", Impact, sans-serif' });
}

// Pick the roofs and build their doors, huts, railings and gravel into the city's geometry, then list every roof to stand on.
export function buildRooftops({ plain, neon, sign }, near) {
  ROOFS.length = 0; ROOFS.push(...pickRoofs(roofSpots, ROOF_COUNT, near));
  SURFACES.length = 0; SURFACES.push(...ROOFS);
  for (const b of roofSpots) if (!ROOFS.some(r => r.x0 === b.x0 && r.z0 === b.z0 && r.x1 === b.x1)) SURFACES.push(plainRoof({ x0: b.x0 - 0.25, x1: b.x1 + 0.25, z0: b.z0 - 0.25, z1: b.z1 + 0.25 }, b.h + 0.6, b.parapet ? [b.parapet] : []));
  for (const f of flatRoofs) SURFACES.push(plainRoof({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 }, f.floor, f.blocks));
  for (const L of landmarkRoofs) {
    if (!L.door) { SURFACES.push(plainRoof(L.area, L.floor, L.blocks)); continue; }
    const R = doorRoof(L); ROOFS.push(R); SURFACES.push(R);
  }
  for (const R of ROOFS) {
    const { fn, floor } = R, hfn = R.hfn || fn;
    door(plain, neon, sign, R.door.x, 0.14, R.door.z, fn, 'Roof');
    if (!R.landmark) box(plain, R.x1 - R.x0 - 0.3, 0.04, R.z1 - R.z0 - 0.3, R.cx, floor - 0.02, R.cz, '#8f8698'); // gravel over the roof slab
    // railings: two rails on posts round the edge
    const rx0 = R.x0 + 0.08, rx1 = R.x1 - 0.08, rz0 = R.z0 + 0.08, rz1 = R.z1 - 0.08, lx = rx1 - rx0, lz = rz1 - rz0;
    for (const y of [0.55, 1.08]) {
      box(plain, lx, 0.07, 0.07, R.cx, floor + y, rz0, '#ece6f2'); box(plain, lx, 0.07, 0.07, R.cx, floor + y, rz1, '#ece6f2');
      box(plain, 0.07, 0.07, lz, rx0, floor + y, R.cz, '#ece6f2'); box(plain, 0.07, 0.07, lz, rx1, floor + y, R.cz, '#ece6f2');
    }
    const post = (x, z) => box(plain, 0.09, 1.12, 0.09, x, floor + 0.56, z, '#ece6f2');
    for (let k = 0, n = Math.ceil(lx / 2.2); k <= n; k++) { post(rx0 + lx * k / n, rz0); post(rx0 + lx * k / n, rz1); }
    for (let k = 1, n = Math.ceil(lz / 2.2); k < n; k++) { post(rx0, rz0 + lz * k / n); post(rx1, rz0 + lz * k / n); }
    // the stair hut, its door facing the same way as the street door (on a landmark, wherever the roof leaves room)
    const H = R.hut;
    box(plain, H.x1 - H.x0, HUT.h, H.z1 - H.z0, H.c.x, floor + HUT.h / 2, H.c.z, R.col);
    box(plain, H.x1 - H.x0 + 0.3, 0.25, H.z1 - H.z0 + 0.3, H.c.x, floor + HUT.h + 0.12, H.c.z, R.trim);
    door(plain, neon, sign, H.door.x, floor, H.door.z, hfn, 'Exit');
    box(neon, 0.3, 0.12, 0.3, H.door.x + hfn[0] * 0.4, floor + HUT.h - 0.05, H.door.z + hfn[1] * 0.4, '#ffe6a8'); // lamp over the door
    // air-con units
    for (const a of R.ac) {
      box(plain, a.x1 - a.x0, 1.1, a.z1 - a.z0, (a.x0 + a.x1) / 2, floor + 0.55, (a.z0 + a.z1) / 2, '#b9b3c2');
      box(plain, 0.9, 0.06, 0.9, (a.x0 + a.x1) / 2, floor + 1.12, (a.z0 + a.z1) / 2, '#4a4452');
    }
  }
}
