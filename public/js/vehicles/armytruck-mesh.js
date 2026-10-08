import { charMat } from '../characters/character.js';
import { GB, addGeo, box, cylG, tube } from '../render/geometry.js';
import { BODY } from './firetruck-mesh.js';
import { hubWheelGeo, wheelAt } from './wheels.js';

// ================= ARMY TRUCK: THE MODEL =================
// The troop truck soldiers arrive in at five stars (models/army.js). It shares the fire engine's footprint (BODY), so
// it drives, rams and gets hit as a truck (kinds/truck.js). Truck space: +z forward, ground at y 0.

// ---- an original low-poly six-wheel troop truck in olive drab: bonneted cab, canvas tilt over the bed, +z forward ----
const OLIVE = '#4b5a32', DKOLIVE = '#36422a', CANVAS = '#6b6a45', DKCANVAS = '#545336', GLASS = '#26364a', DARK = '#1c1c20', METAL = '#55574f';
function truckGeometry() {
  const g = new GB(), L = BODY.hl, W = BODY.hw;
  // chassis rails, bumper with tow hooks
  box(g, 1.9, 0.35, 2 * L - 0.2, 0, 0.8, 0, DARK);
  box(g, 2 * W + 0.1, 0.25, 0.3, 0, 0.85, L - 0.1, DKOLIVE);
  for (const s of [-1, 1]) box(g, 0.14, 0.14, 0.2, s * 0.75, 0.75, L + 0.1, METAL);
  // the bonnet: a short square nose with a slatted grille and headlights behind wire guards
  box(g, 1.9, 0.75, 1.3, 0, 1.4, L - 0.85, OLIVE);
  box(g, 1.5, 0.55, 0.04, 0, 1.38, L - 0.18, DARK);
  for (let i = 0; i < 5; i++) box(g, 0.05, 0.5, 0.05, -0.6 + i * 0.3, 1.38, L - 0.15, DKOLIVE);
  for (const s of [-1, 1]) {
    addGeo(g, cylG(10), s * 0.82, 1.32, L - 0.17, 0.26, 0.06, 0.26, Math.PI / 2, 0, 0, '#e8e2b0');
    for (let i = 0; i < 3; i++) box(g, 0.03, 0.3, 0.03, s * 0.82 + (i - 1) * 0.08, 1.32, L - 0.12, DARK);
    // mudguards over the front wheels
    box(g, 0.5, 0.1, 1.3, s * (W - 0.2), 1.25, L - 1.15, DKOLIVE);
  }
  // the cab: square, with a split windscreen and a canvas roof
  box(g, 2 * W, 1.25, 1.5, 0, 1.75, L - 2.25, OLIVE);
  box(g, 2 * W - 0.1, 0.12, 1.55, 0, 2.43, L - 2.25, DKCANVAS);
  for (const s of [-1, 1]) {
    box(g, 0.95, 0.6, 0.04, s * 0.52, 2.05, L - 1.49, GLASS);
    box(g, 0.04, 0.55, 0.9, s * (W + 0.005), 2.05, L - 2.15, GLASS);
    // a white star on each door
    box(g, 0.02, 0.36, 0.36, s * (W + 0.01), 1.55, L - 2.15, '#e8e6dc');
    box(g, 0.025, 0.22, 0.22, s * (W + 0.015), 1.55, L - 2.15, OLIVE);
    box(g, 0.05, 0.4, 0.06, s * (W + 0.08), 2.1, L - 1.6, DARK); box(g, 0.04, 0.24, 0.16, s * (W + 0.12), 2.25, L - 1.6, DARK); // mirrors
    box(g, 0.25, 0.06, 0.6, s * (W + 0.05), 0.95, L - 2.2, METAL); // step
  }
  box(g, 0.04, 0.6, 0.06, 0, 2.05, L - 1.48, DKOLIVE);
  // a spare wheel and a jerrycan behind the cab
  addGeo(g, cylG(12), -0.5, 1.75, L - 3.1, 1.0, 0.3, 1.0, Math.PI / 2, 0, 0, DARK);
  box(g, 0.45, 0.6, 0.2, 0.6, 1.6, L - 3.1, OLIVE);
  // the bed: low olive sides with a canvas tilt over hoops, open at the back so the troops can jump out
  const B0 = L - 3.3, B1 = -L;
  box(g, 2 * W, 0.18, B0 - B1, 0, 1.15, (B0 + B1) / 2, DKOLIVE);
  for (const s of [-1, 1]) {
    box(g, 0.08, 0.55, B0 - B1, s * (W - 0.04), 1.5, (B0 + B1) / 2, OLIVE);
    box(g, 0.06, 1.05, B0 - B1, s * (W - 0.03), 2.3, (B0 + B1) / 2, CANVAS);
    box(g, 0.5, 0.1, 2.0, s * (W - 0.2), 1.1, -2.3, DKOLIVE); // rear mudguards
  }
  box(g, 2 * W, 0.08, B0 - B1, 0, 2.86, (B0 + B1) / 2, CANVAS);
  box(g, 2 * W, 1.65, 0.06, 0, 2.0, B0 - 0.03, CANVAS);
  for (let z = B1 + 0.4; z < B0; z += 1.2) box(g, 2 * W + 0.04, 0.06, 0.08, 0, 2.88, z, DKCANVAS); // the hoops showing through
  for (const s of [-1, 1]) for (let z = B1 + 0.4; z < B0; z += 1.2) box(g, 0.02, 1.05, 0.08, s * (W + 0.005), 2.3, z, DKCANVAS);
  // the dark inside, two benches and the rolled-up back flap; tail lights and a tow hitch
  box(g, 2 * W - 0.2, 1.6, 0.04, 0, 2.05, B1 + 0.25, DARK);
  box(g, 2 * W, 0.22, 0.25, 0, 2.8, B1 + 0.05, DKCANVAS);
  for (const s of [-1, 1]) { box(g, 0.2, 0.15, 0.04, s * 1.0, 1.0, B1 - 0.01, '#ff3040'); box(g, 0.08, 1.0, 0.08, s * (W - 0.04), 1.85, B1 + 0.04, OLIVE); }
  box(g, 0.3, 0.2, 0.3, 0, 0.8, B1 - 0.1, METAL);
  // a radio aerial off the back of the cab
  tube(g, [-W + 0.15, 2.4, L - 3.0], [-W + 0.15, 4.4, L - 3.0], 0.015, DARK, 4);
  return g.geometry();
}
let GEO = null;
export function buildArmyTruck() {
  if (!GEO) { GEO = truckGeometry(); GEO.userData.shared = true; }
  const grp = new THREE.Group(), body = new THREE.Mesh(GEO, charMat); grp.add(body);
  const wheels = [];
  for (const s of [-1, 1]) for (const z of [BODY.hl - 1.15, -1.7, -2.95]) {
    const wh = wheelAt(hubWheelGeo(s, { r: 0.55, width: 0.42, cap: 0.32, tyre: '#151612', capCol: OLIVE, slotCol: DKOLIVE, slots: 8 }), charMat, s * 1.05, 0.55, z, 0.55);
    grp.add(wh); wheels.push(wh);
  }
  return { grp, wheels, meshes: [body, ...wheels] };
}
