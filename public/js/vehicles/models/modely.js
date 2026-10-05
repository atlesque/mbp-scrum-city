import { charMat } from '../../characters/character.js';
import { GB, addGeo, box, boxAB, cylG, loft } from '../../render/geometry.js';
import { carGlassMat } from '../materials.js';

// ================= TESLA MODEL Y (white) =================
// Car space like the sedan: +z forward, ground at y 0, inside the car kind's 2.0 x 4.3 footprint.
// A tall smooth crossover: no grille, thin light bars, a black glass roof and a long sloping tailgate.
const WHITE = '#f2f3f0', TRIM = '#18191d', GLASS_ROOF = '#121419';
const sec = (z, lo, hi, w, wt) => ({ z, y: (lo + hi) / 2, h: hi - lo, w, wt });

function modelYMesh() {
  const g = new GB(), glass = new GB();
  // body: low rounded nose, rising hood, flat flanks, a tucked-in tail
  loft(g, [sec(2.17, 0.42, 0.8, 1.7, 1.56), sec(2.0, 0.3, 0.9, 1.94, 1.82), sec(1.0, 0.28, 1.0, 2.0, 1.9), sec(-1.6, 0.28, 1.02, 2.0, 1.9), sec(-2.05, 0.34, 1.02, 1.96, 1.84), sec(-2.17, 0.44, 0.98, 1.8, 1.7)], WHITE);
  // greenhouse: one sweep of glass from the windscreen over the roof and down the tailgate
  loft(glass, [sec(0.98, 0.98, 1.02, 1.84, 1.8), sec(0.05, 0.98, 1.6, 1.86, 1.48), sec(-1.0, 0.98, 1.6, 1.86, 1.48), sec(-2.02, 0.98, 1.08, 1.8, 1.66)], '#ffffff');
  // black glass roof panel and window trim
  loft(g, [sec(0.6, 1.3, 1.34, 1.62, 1.58), sec(0.05, 1.6, 1.63, 1.46, 1.42), sec(-1.0, 1.6, 1.63, 1.46, 1.42), sec(-1.7, 1.26, 1.29, 1.56, 1.52)], GLASS_ROOF);
  for (const sx of [-1, 1]) {
    boxAB(g, [sx * 0.92, 1.0, 0.95], [sx * 0.75, 1.6, 0.05], 0.06, 0.08, TRIM); // A pillar
    box(g, 0.06, 0.62, 0.12, sx * 0.84, 1.3, -0.45, TRIM); // B pillar
    boxAB(g, [sx * 0.75, 1.6, -1.0], [sx * 0.88, 1.06, -1.95], 0.06, 0.1, TRIM); // C pillar
    box(g, 0.05, 0.04, 2.9, sx * 0.94, 0.99, -0.5, TRIM); // window line
    box(g, 0.22, 0.12, 0.1, sx * 1.04, 1.06, 0.78, WHITE); box(g, 0.08, 0.1, 0.1, sx * 0.94, 1.02, 0.78, TRIM); // mirrors
  }
  box(g, 2.02, 0.14, 3.0, 0, 0.36, -0.2, TRIM); // rocker cladding
  // wheels: black tyres with grey aero covers
  for (const sx of [-1, 1]) for (const sz of [-1.42, 1.42]) {
    addGeo(g, cylG(14), sx * 0.88, 0.37, sz, 0.74, 0.26, 0.74, 0, 0, Math.PI / 2, '#141218');
    addGeo(g, cylG(14), sx * 0.88, 0.37, sz, 0.5, 0.28, 0.5, 0, 0, Math.PI / 2, '#9a9da4');
  }
  // lights: slim headlight bars, a light bar across the tailgate, a dark lower intake
  for (const sx of [-1, 1]) boxAB(g, [sx * 0.4, 0.79, 2.14], [sx * 0.86, 0.84, 1.98], 0.09, 0.06, '#eaf6ff');
  box(g, 1.0, 0.1, 0.06, 0, 0.47, 2.15, TRIM);
  box(g, 1.62, 0.06, 0.05, 0, 0.9, -2.13, '#ff2a40'); for (const sx of [-1, 1]) box(g, 0.3, 0.1, 0.05, sx * 0.72, 0.88, -2.14, '#ff2a40');
  box(g, 1.7, 0.16, 0.08, 0, 0.42, -2.14, TRIM);
  // interior seen through the glass: dash, wheel, the centre screen and seats
  box(g, 1.7, 0.16, 0.36, 0, 1.0, 0.7, '#1c1a22'); box(g, 0.3, 0.28, 0.05, 0.45, 1.06, 0.38, '#141218');
  box(g, 0.36, 0.24, 0.03, 0, 1.18, 0.6, '#0b0d12');
  for (const sx of [-1, 1]) box(g, 0.5, 0.66, 0.16, sx * 0.45, 0.96, -0.82, '#e8e4dc');
  const grp = new THREE.Group(), m = new THREE.Mesh(g.geometry(), charMat), win = new THREE.Mesh(glass.geometry(), carGlassMat); grp.add(m, win);
  const seat = new THREE.Group(); seat.position.set(0.45, -0.42, -0.4); grp.add(seat);
  return { grp, m, win, seat, solid: [m], lit: [win] };
}

export default {
  id: 'modely', kind: 'car', name: 'Tesla Model Y', short: 'Model Y', tag: 'Tesla',
  hp: 150,
  mesh: modelYMesh,
  // electric: quick off the line, one long gear, a high whine instead of an engine note
  handling: { accel: 11, boostAccel: 14, top: 32, boostTop: 42, coast: 0.9 },
  engine: { rev: 1.15, gears: [0, 52] },
  traffic: { weight: 0.35, speed: [10, 14] },
};
