import { box, wallBox } from '../render/geometry.js';
import { addCollider } from './collision.js';
import { glowMaterials, loadModel, placeModel } from './models.js';
import { LANDMARK_MODELS, landmarkMats, landmarkParts } from './landmark-models/index.js';

// ================= LANDMARKS =================
// Hand-built buildings that take a whole block of the city, in place of the generated ones.
// Each type is drawn in block-local metres (the lot runs -16..16 on both axes, the front faces -z)
// and the site's `face` turns it to the street it fronts ('n', 'e', 's' or 'w').
// To add one, add a detailed model to world/landmark-models/ (or a builder to LANDMARK_TYPES) and a site to LANDMARK_SITES.
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
// The detailed models (world/landmark-models/, one file per building) are built once per type and shared by
// every site that uses them. They are drawn with the front at -z, so a half turn makes them face +Z like a .glb.
const detailed = new Map(); // type -> { group, colliders } in .glb convention
function detailedModel(type) {
  if (!detailed.has(type)) {
    const { group, colliders } = landmarkParts(type), wrap = new THREE.Group();
    group.rotation.y = Math.PI; wrap.add(group);
    const mats = landmarkMats(); mats.lit.userData.glow = 1; glowMaterials.add(mats.lit); // windows light up after dark
    detailed.set(type, { group: wrap, colliders: colliders.map(([x0, x1, z0, z1, top]) => [-x1, -x0, -z1, -z0, top]) });
  }
  return detailed.get(type);
}
// the yellow name sign on each building's street front, in the model's own metres (front at -z)
const SIGNS = {
  vac: ['VAC Gent', -2.5, 9, -15.3, 9], // on the glazed band under the glass slits
  teirlinck: ['Herman Teirlinck', 0.5, 3.2, -16.4, 10], // over the stepped-back entrance
  belpaire: ['Belpaire', 11.5, 4.5, -6.9, 8], // on WTC I's plinth
};

// stands in for a model that did not load and has no builder: a plain glazed block
function placeholder(g, S) { S.mass(-12, 12, -12, 12, 0, 16, '#d9d2c8', true); }

// builders drawn straight into the city geometry; a type with a detailed model (LANDMARK_MODELS) needs none
export const LANDMARK_TYPES = { placeholder };
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
  const S = site(g, cx, cz, s.face);
  if (LANDMARK_MODELS[s.type]) {
    const o = placeModel(detailedModel(s.type), cx, cz, s.face);
    if (SIGNS[s.type]) S.sign(...SIGNS[s.type]);
    return o;
  }
  (LANDMARK_TYPES[s.type] || LANDMARK_TYPES.placeholder)(g, S);
}
