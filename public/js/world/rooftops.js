import { clamp } from '../core/util.js';
import { box } from '../render/geometry.js';
import { pushOut, rayBox } from './collision.js';

// ================= ROOFTOPS =================
// A few ordinary city buildings get a lit door at street level. E takes the stairs (a short fade, no
// stairwell) to a fenced roof with a stair hut, whose door leads back down. The buildings are picked
// after the city is built, without the seeded random, so the rest of the layout stays the same.
export const ROOF_COUNT = 8;
const RAIL = 0.35; // railings stand this far in from the wall line; the player keeps inside them
const HUT = { w: 3, h: 2.7, d: 3 };
const FACES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
// every flat-roofed building city.js puts up ({ x0, x1, z0, z1, h, face, col, trim }), filled while it builds
export const roofSpots = [];
// the roofs with doors, filled by buildRooftops
export const ROOFS = [];

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
    hut: { ...rect(0, hutV, HUT.w / 2, HUT.d / 2), c: at(0, hutV), door: at(0, hutV + HUT.d / 2) },
    hutOut: at(0, hutV + HUT.d / 2 + 1.1),
    ac,
    blocks: [{ ...rect(0, hutV, HUT.w / 2, HUT.d / 2), y0: floor, y1: floor + HUT.h + 0.25 }, ...ac],
  };
}

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

// Keep a circle on a roof: inside the railings and out of the hut and the air-con units.
export function collideRoof(o, r, roof) {
  const W = roof.walk, ox = o.x, oz = o.z;
  o.x = clamp(o.x, W.x0 + r, W.x1 - r); o.z = clamp(o.z, W.z0 + r, W.z1 - r);
  let hit = ox !== o.x || oz !== o.z;
  for (const b of roof.blocks) if (pushOut(o, r, b.x0, b.x1, b.z0, b.z1)) hit = true;
  return hit;
}

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

// Pick the roofs and build their doors, huts, railings and gravel into the city's geometry.
export function buildRooftops({ plain, neon, sign }, near) {
  ROOFS.length = 0; ROOFS.push(...pickRoofs(roofSpots, ROOF_COUNT, near));
  for (const R of ROOFS) {
    const { fn, floor } = R;
    door(plain, neon, sign, R.door.x, 0.14, R.door.z, fn, 'Roof');
    // gravel over the roof slab
    box(plain, R.x1 - R.x0 - 0.3, 0.04, R.z1 - R.z0 - 0.3, R.cx, floor - 0.02, R.cz, '#8f8698');
    // railings: two rails on posts round the edge
    const rx0 = R.x0 + 0.08, rx1 = R.x1 - 0.08, rz0 = R.z0 + 0.08, rz1 = R.z1 - 0.08, lx = rx1 - rx0, lz = rz1 - rz0;
    for (const y of [0.55, 1.08]) {
      box(plain, lx, 0.07, 0.07, R.cx, floor + y, rz0, '#ece6f2'); box(plain, lx, 0.07, 0.07, R.cx, floor + y, rz1, '#ece6f2');
      box(plain, 0.07, 0.07, lz, rx0, floor + y, R.cz, '#ece6f2'); box(plain, 0.07, 0.07, lz, rx1, floor + y, R.cz, '#ece6f2');
    }
    const post = (x, z) => box(plain, 0.09, 1.12, 0.09, x, floor + 0.56, z, '#ece6f2');
    for (let k = 0, n = Math.ceil(lx / 2.2); k <= n; k++) { post(rx0 + lx * k / n, rz0); post(rx0 + lx * k / n, rz1); }
    for (let k = 1, n = Math.ceil(lz / 2.2); k < n; k++) { post(rx0, rz0 + lz * k / n); post(rx1, rz0 + lz * k / n); }
    // the stair hut, its door facing the same way as the street door
    const H = R.hut;
    box(plain, H.x1 - H.x0, HUT.h, H.z1 - H.z0, H.c.x, floor + HUT.h / 2, H.c.z, R.col);
    box(plain, H.x1 - H.x0 + 0.3, 0.25, H.z1 - H.z0 + 0.3, H.c.x, floor + HUT.h + 0.12, H.c.z, R.trim);
    door(plain, neon, sign, H.door.x, floor, H.door.z, fn, 'Exit');
    box(neon, 0.3, 0.12, 0.3, H.door.x + fn[0] * 0.4, floor + HUT.h - 0.05, H.door.z + fn[1] * 0.4, '#ffe6a8'); // lamp over the door
    // air-con units
    for (const a of R.ac) {
      box(plain, a.x1 - a.x0, 1.1, a.z1 - a.z0, (a.x0 + a.x1) / 2, floor + 0.55, (a.z0 + a.z1) / 2, '#b9b3c2');
      box(plain, 0.9, 0.06, 0.9, (a.x0 + a.x1) / 2, floor + 1.12, (a.z0 + a.z1) / 2, '#4a4452');
    }
  }
}
