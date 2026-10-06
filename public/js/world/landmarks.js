import { seeded } from '../core/util.js';
import { box, wallBox } from '../render/geometry.js';
import { addCollider } from './collision.js';
import { loadModel, placeModel } from './models.js';

// ================= LANDMARKS =================
// Hand-built buildings that take a whole block of the city, in place of the generated ones.
// Each type draws itself in block-local metres (the lot runs -16..16 on both axes, the front faces -z)
// and the site's `face` turns it to the street it fronts ('n', 'e', 's' or 'w').
// To add one, add a builder to LANDMARK_TYPES and a site to LANDMARK_SITES.
// A site can also name a `model`: a .glb in public/models/ (see world/models.js) drawn in place of the builder.
// If the file is missing or fails to load, the site falls back to its builder, or to a plain block without one.
export const LANDMARK_SITES = [
  { block: [2, 3], type: 'vac', face: 'e' },
  { block: [2, 4], type: 'belpaire', face: 'e' },
  { block: [3, 5], type: 'teirlinck', face: 'n' },
];
const SIGN_FONT = '"Bowlby One", Impact, sans-serif';
const VL_YELLOW = '#ffe615'; // the Flemish government's yellow

// local (x, z) to world, by quarter turns so every box stays axis aligned (wallBox needs that)
const TURN = { n: [1, 0, 0, 1], s: [-1, 0, 0, -1], e: [0, -1, 1, 0], w: [0, 1, -1, 0] };
function site(g, cx, cz, face) {
  const [a, b, c, d] = TURN[face];
  const at = (x, z) => [cx + a * x + b * z, cz + c * x + d * z];
  const rect = (x0, x1, z0, z1) => { const [p, q] = at(x0, z0), [r, s] = at(x1, z1); return [Math.min(p, r), Math.max(p, r), Math.min(q, s), Math.max(q, s)]; };
  const S = {
    at, rect,
    // a solid block: windowed walls when `glazed`, plain otherwise; returns its world rect
    mass(x0, x1, z0, z1, y0, h, col, glazed, solid = true) {
      const R = rect(x0, x1, z0, z1), w = R[1] - R[0], dd = R[3] - R[2], mx = (R[0] + R[1]) / 2, mz = (R[2] + R[3]) / 2;
      if (glazed) wallBox(g.walls, g.plain, mx, y0 + h / 2, mz, w, h, dd, col);
      else box(g.plain, w, h, dd, mx, y0 + h / 2, mz, col);
      if (solid) addCollider(R[0], R[1], R[2], R[3], y0 + h, true);
      return R;
    },
    // a plain box given in local coordinates, no collider
    part(x0, x1, z0, z1, y0, h, col, gb = g.plain) {
      const R = rect(x0, x1, z0, z1);
      box(gb, R[1] - R[0], h, R[3] - R[2], (R[0] + R[1]) / 2, y0 + h / 2, (R[2] + R[3]) / 2, col);
    },
    sign(text, x, y, z, w) {
      const [sx, sz] = at(x, z), [fx, fz] = at(0, -1), ry = Math.atan2(fx - cx, fz - cz);
      g.sign({ text, x: sx, y, z: sz, ry, w, color: VL_YELLOW, font: SIGN_FONT });
    },
  };
  return S;
}
// the four faces of a world rect: [along-x?, fixed coord, from, to, outward sign]
const faces = R => [[true, R[2], R[0], R[1], -1], [true, R[3], R[0], R[1], 1], [false, R[0], R[2], R[3], -1], [false, R[1], R[2], R[3], 1]];
// slim brick piers on every face, on the seams between the window columns (world multiples of 3 m)
function piers(gb, R, y0, h, col, out = 0.45, wide = 0.7) {
  for (const [ax, fixed, from, to, sgn] of faces(R)) for (let t = Math.ceil((from + 0.8) / 3) * 3; t < to - 0.8; t += 3) {
    if (ax) box(gb, wide, h, out, t, y0 + h / 2, fixed + sgn * out / 2, col);
    else box(gb, out, h, wide, fixed + sgn * out / 2, y0 + h / 2, t, col);
  }
}

// Virginie Lovelinggebouw, VAC Gent (POLO, 2014): a dark brick tower of two staggered slabs, 22 floors
// (90 m) beside Gent-Sint-Pieters, on an L-shaped brick podium. Big two-storey bay windows are cut into
// the brick at random, one landing for every two office floors.
function vac(g, S) {
  const BRICK = '#6e5248', TOP = '#4b3d3a', GLASS = '#dde8f2', r = seeded(9040);
  S.mass(-16, 16, -16, -7, 0, 12.8, BRICK); // the low public arm along the street
  S.mass(-16, -7, -7, 16, 0, 12.8, BRICK);
  S.part(-16.3, 16.3, -16.3, -6.7, 12.8, 0.5, TOP); S.part(-16.3, -6.7, -6.7, 16.3, 12.8, 0.5, TOP);
  S.mass(-12, 12, -16.4, -15.9, 0.2, 3.2, GLASS, true, false); // glazed ground floor and entrance
  S.part(-11, -4, -18.4, -16, 3.6, 0.3, '#f4f0ea'); // entrance canopy
  const slabs = [S.mass(-3, 9, -5, 7, 0, 64.2, BRICK), S.mass(4, 15, 1, 14, 0, 51.4, BRICK)];
  for (const [i, R] of slabs.entries()) {
    const h = i ? 51.4 : 64.2;
    box(g.plain, R[1] - R[0] + 0.4, 0.6, R[3] - R[2] + 0.4, (R[0] + R[1]) / 2, h + 0.3, (R[2] + R[3]) / 2, TOP);
    box(g.plain, 3, 2, 3, (R[0] + R[1]) / 2 + 1, h + 1.6, (R[2] + R[3]) / 2, '#8c8a90'); // plant room
    bays(g, R, 13, h - 2, r, GLASS);
  }
  for (const R of [S.rect(-16, 16, -16, -7), S.rect(-16, -7, -7, 16)]) bays(g, R, 6.6, 12.8, r, GLASS, 0.5);
  S.sign('VAC Gent', 0, 9.6, -16.3, 12);
}
// two-storey windows (2 x 2 window cells) scattered over each face of a brick volume
function bays(g, R, yFrom, yTo, r, col, odds = 0.8) {
  for (const [ax, fixed, from, to, sgn] of faces(R)) {
    const first = Math.ceil((from + 3.5) / 3) * 3, cells = Math.floor((Math.floor((to - 3.5) / 3) * 3 - first) / 3) + 1; if (cells < 1) continue;
    for (let y = 0.2 + Math.ceil((yFrom - 0.2) / 6.4) * 6.4; y + 6.4 <= yTo; y += 6.4) {
      const n = r() < odds ? (cells > 3 && r() < 0.5 ? 2 : 1) : 0, used = [];
      for (let k = 0; k < n; k++) {
        const c = Math.floor(r() * cells); if (used.some(u => Math.abs(u - c) < 2)) continue; used.push(c);
        const t = first + c * 3, o = fixed + sgn * 0.2;
        if (ax) wallBox(g.walls, g.plain, t, y + 3.2, o, 6, 6.4, 0.4, col); else wallBox(g.walls, g.plain, o, y + 3.2, t, 0.4, 6.4, 6, col);
      }
    }
  }
}

// Herman Teirlinckgebouw, Tour & Taxis, Brussels (Neutelings Riedijk, 2017): a six-storey block of pale
// buff brick whose wings meander around covered winter gardens, the facades a tight colonnade of brick
// piers under a deep cornice, with a tall portal into the covered interior street.
function teirlinck(g, S) {
  const BRICK = '#e2d2ae', PIER = '#d8c49a', CORNICE = '#cdb88e';
  const wings = [[-16, 16, -16, -7, 22.6], [-16, 16, 7, 16, 25.8], [-16, -8, -7, 7, 19.4], [8, 16, -7, 7, 19.4]];
  for (const [x0, x1, z0, z1, h] of wings) {
    const R = S.mass(x0, x1, z0, z1, 0, h, BRICK, true);
    piers(g.plain, R, 0, h - 0.6, PIER);
    box(g.plain, R[1] - R[0] + 1.4, 1, R[3] - R[2] + 1.4, (R[0] + R[1]) / 2, h + 0.1, (R[2] + R[3]) / 2, CORNICE);
    box(g.plain, R[1] - R[0] + 1, 0.5, R[3] - R[2] + 1, (R[0] + R[1]) / 2, 3.6, (R[2] + R[3]) / 2, CORNICE);
  }
  S.mass(-8, 8, -7, 7, 0, 18, BRICK, true); // the covered interior street, with a glass winter-garden roof
  S.part(-8.4, 8.4, -7.4, 7.4, 18, 0.8, '#bfe3e8');
  S.part(-5, 5, -16.6, -16, 0, 10.6, '#2c3546'); // the portal
  S.part(-6.2, 6.2, -16.8, -16, 10.6, 1.2, CORNICE);
  for (const x of [-5.6, 5.6]) S.part(x - 0.6, x + 0.6, -16.8, -16, 0, 10.6, CORNICE);
  S.sign('Herman Teirlinck', 0, 15, -16.9, 14);
}

// Belpairegebouw, Brussels North (51N4E, l'AUC and Jaspers-Eyers, 2024): the two 1970s World Trade Center
// towers stripped back to their cores and re-clad in light glass, joined by a new lower tract hung with
// sun-shading fins, all on a two-storey public plinth with a glasshouse docked to the street.
function belpaire(g, S) {
  const GLASS = '#93acc6', WHITE = '#eef0f0', PLINTH = '#d6e8ef';
  S.mass(-16, 16, -11, 11, 0, 7, PLINTH, true);
  S.part(-16.3, 16.3, -11.3, 11.3, 7, 0.4, WHITE);
  for (const x0 of [-16, 5]) {
    const R = S.mass(x0, x0 + 11, -6, 6, 7, 66.2, GLASS, true), w = R[1] - R[0] + 0.25, d = R[3] - R[2] + 0.25, mx = (R[0] + R[1]) / 2, mz = (R[2] + R[3]) / 2;
    for (let y = 10.2; y < 73; y += 6.4) box(g.plain, w, 0.35, d, mx, y, mz, WHITE); // a band every other floor
    for (const [x, z] of [[R[0], R[2]], [R[0], R[3]], [R[1], R[2]], [R[1], R[3]]]) box(g.plain, 0.6, 66.2, 0.6, x, 7 + 33.1, z, WHITE);
    box(g.plain, w + 0.4, 1.4, d + 0.4, mx, 73.9, mz, WHITE);
    box(g.plain, w - 4, 2.6, d - 4, mx, 75.5, mz, '#9aa3ad');
  }
  S.mass(-5, 5, -8, 8, 7, 38.4, '#e9e4da', true); // the new tract between the towers
  for (let x = -4.25; x <= 4.3; x += 1.7) for (const z of [-8.5, 8.5]) S.part(x - 0.12, x + 0.12, z - 0.5, z + 0.5, 7, 38.4, WHITE);
  S.part(-5.4, 5.4, -8.4, 8.4, 45.4, 0.6, WHITE);
  S.mass(-6, 6, -15.5, -11, 0, 4.4, '#cfeee4', true); // the glasshouse
  S.part(-6.2, 6.2, -15.7, -10.8, 4.4, 0.3, WHITE); S.part(-4, 4, -14.5, -12, 4.7, 1.2, '#cfeee4');
  S.sign('Belpaire', 11, 5, -11.4, 9);
}

// stands in for a model that did not load and has no builder: a plain glazed block
function placeholder(g, S) { S.mass(-12, 12, -12, 12, 0, 16, '#d9d2c8', true); }

export const LANDMARK_TYPES = { vac, teirlinck, belpaire, placeholder };
export const landmarkAt = (i, j) => LANDMARK_SITES.find(s => s.block[0] === i && s.block[1] === j);
const models = new Map(); // site -> prepared model, filled by loadLandmarkModels
// fetch every site's model before the world is built (buildWorld is synchronous)
export async function loadLandmarkModels(sites = LANDMARK_SITES) {
  await Promise.all(sites.filter(s => s.model).map(async s => { const m = await loadModel(s.model); if (m) models.set(s, m); }));
}
// g: { walls, plain, neon } geometry builders and sign(spec) to queue a neon sign
export function buildLandmark(g, s, cx, cz) {
  const m = models.get(s);
  if (m) return placeModel(m, cx, cz, s.face);
  (LANDMARK_TYPES[s.type] || placeholder)(g, site(g, cx, cz, s.face));
}
