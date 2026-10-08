import { box, wallBox } from '../render/geometry.js';
import { addCollider } from './collision.js';
import { FACE_YAW, glowMaterials, loadModel, placeModel, turnBox } from './models.js';
import { STAND, landmarkRoofs } from './rooftops.js';
import { LANDMARK_MODELS, landmarkMats, landmarkParts } from './landmark-models/index.js';
import { ROOF_DOOR_X } from './landmark-models/teirlinck.js';

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
const detailed = new Map(); // type -> { group, colliders, onRoof } in .glb convention
function detailedModel(type) {
  if (!detailed.has(type)) {
    const { group, colliders, onRoof } = landmarkParts(type), wrap = new THREE.Group();
    group.rotation.y = Math.PI; wrap.add(group);
    const mats = landmarkMats(); mats.lit.userData.glow = 1; glowMaterials.add(mats.lit); // windows light up after dark
    const flip = ([x0, x1, z0, z1, ...y]) => [-x1, -x0, -z1, -z0, ...y];
    detailed.set(type, { group: wrap, colliders: colliders.map(flip), onRoof: onRoof.map(flip) });
  }
  return detailed.get(type);
}
// the yellow name sign on each building's street front, in the model's own metres (front at -z)
const SIGNS = {
  vac: ['VAC Gent', -2.5, 9, -15.3, 9], // on the glazed band under the glass slits
  teirlinck: ['Herman Teirlinck', 0.5, 3.2, -16.4, 10], // over the stepped-back entrance
  belpaire: ['Belpaire', 11.5, 4.5, -6.9, 8], // on WTC I's plinth
};

// The roofs that can be reached by the stairs, in the model's own metres (front at -z): which solid volume's top
// (`rect`, as in the model's k.solid), where the street door sits in the wall and which way it faces, where the stair
// hut stands on the roof and which way its door faces, and what waits up there. Every other solid top of a landmark
// can be stood on too, without railings; what stands on the roofs (Kit.roofPart) comes with the model.
const ROOFTOPS = {
  vac: { rect: [-9, 4, -15, 11], door: [-6, -15], dir: [0, -1], hut: [-2.5, 5], hutDir: [0, -1], gun: 'sniper', gunAt: [0, -10], chuteAt: [2, 3] },
  // the tower, 59 m up, with its plant room; the rocket launcher waits here instead of a sniper rifle
  teirlinck: { rect: [-16, 0, 0, 16], door: [ROOF_DOOR_X, -16], dir: [0, -1], hut: [-12, 3], hutDir: [1, 0], gun: 'rpg', gunAt: [-3, 12], chuteAt: [-13, 13] },
  // the new middle block's roof garden round the red pavilion, with the jetpack (and on all three, a parachute at chuteAt)
  belpaire: { rect: [-7, 7, -9, 12], door: [3, -9], dir: [0, -1], hut: [-3, 9], hutDir: [1, 0], gun: 'sniper', gunAt: [-4, -7.6], jetpackAt: [3.5, 9], chuteAt: [0.5, 10] },
};
const ROOF_COLS = { vac: ['#cfcbc6', '#a9a59f'], teirlinck: ['#dcc08a', '#8f8e88'], belpaire: ['#eef0ee', '#c8322f'] };
// hand a placed model's tops to world/rooftops.js: colliders are [x0, x1, z0, z1, top] and onRoof the things standing
// on them, [x0, x1, z0, z1, y0, y1], in the model's metres (.glb convention, front at +z); spec (front at -z) picks the
// one with the door. A thing goes to the highest top it stands on (or is sunk into), or next to (a pergola's posts).
function addRoofs(colliders, cx, cz, face, type, spec, onRoof = []) {
  const a = FACE_YAW[face], c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const dir = ([x, z]) => [-x * c - z * s, x * s - z * c]; // half turn to the .glb front, then the site's turn
  const at = p => { const [x, z] = dir(p); return { x: cx + x, z: cz + z }; };
  const area = ([x0, x1, z0, z1]) => { const [a0, a1, b0, b1] = turnBox([x0, x1, z0, z1], cx, cz, face); return { x0: a0, x1: a1, z0: b0, z1: b1 }; };
  const flip = ([x0, x1, z0, z1]) => [-x1, -x0, -z1, -z0]; // the spec's front-at--z metres to the colliders' .glb ones
  const under = p => {
    let best = null; const x = (p[0] + p[1]) / 2, z = (p[2] + p[3]) / 2;
    for (const C of colliders) if (x > C[0] - 0.5 && x < C[1] + 0.5 && z > C[2] - 0.5 && z < C[3] + 0.5 && C[4] <= p[4] + 1 && (!best || C[4] > best[4])) best = C;
    return best;
  };
  const parts = onRoof.map(p => ({ C: under(p), b: { ...area(p), y0: p[4], y1: p[5] } }));
  for (const C of colliders) {
    const floor = C[4] + STAND, r = { area: area(C), floor, blocks: parts.filter(p => p.C === C).map(p => p.b) };
    if (spec && flip(spec.rect).every((v, i) => Math.abs(v - C[i]) < 1e-6)) {
      Object.assign(r, {
        door: at(spec.door), fn: dir(spec.dir), hut: at(spec.hut), hfn: dir(spec.hutDir), col: ROOF_COLS[type][0], trim: ROOF_COLS[type][1],
        gun: spec.gun, gunAt: at(spec.gunAt), jetpackAt: spec.jetpackAt && at(spec.jetpackAt), chuteAt: at(spec.chuteAt),
      });
    }
    landmarkRoofs.push(r);
  }
}

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
  if (m) { addRoofs(m.colliders, cx, cz, s.face); return placeModel(m, cx, cz, s.face); }
  const S = site(g, cx, cz, s.face);
  if (LANDMARK_MODELS[s.type]) {
    const d = detailedModel(s.type), o = placeModel(d, cx, cz, s.face);
    addRoofs(d.colliders, cx, cz, s.face, s.type, ROOFTOPS[s.type], d.onRoof);
    if (SIGNS[s.type]) S.sign(...SIGNS[s.type]);
    return o;
  }
  (LANDMARK_TYPES[s.type] || LANDMARK_TYPES.placeholder)(g, S);
}
