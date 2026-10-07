import { charMat } from '../characters/character.js';
import { GB, addGeo, box, cylG, tube } from '../render/geometry.js';
import { hubWheelGeo, wheelAt } from './wheels.js';

// ================= FIRE TRUCK: THE MODEL =================
// Shared by the fire engine that answers crash fires (vehicles/firetruck.js) and the one the player drives
// (models/firetruck.js, kinds/truck.js). Truck space: +z forward, ground at y 0.
//   hw, hl   half width and half length of the body
export const BODY = { hw: 1.3, hl: 4.3 };
// the side of the truck the hoses come off (its pump panel), in the truck's space: x across, z along
export const PUMP = { x: BODY.hw + 0.05, y: 1.2, z: 1.2 };

// ---- the model: an original low-poly fire engine, red with a white band, a ladder on the roof, +z forward ----
const RED = '#c8141e', DKRED = '#8e0d14', WHITE = '#f2efe6', CHROME = '#c9ccd2', GLASS = '#26364a', DARK = '#1c1c22', SHUTTER = '#b5bac2';
function truckGeometry() {
  const g = new GB(), L = BODY.hl, W = BODY.hw;
  // chassis and the cab: a tall flat-fronted crew cab with big windows
  box(g, 2.3, 0.4, 2 * L - 0.3, 0, 0.75, 0, DARK);
  box(g, 2 * W, 1.95, 2.0, 0, 1.9, L - 1.0, RED);
  box(g, 2 * W + 0.02, 0.14, 2.02, 0, 2.94, L - 1.0, WHITE);
  box(g, 2 * W - 0.2, 0.85, 0.04, 0, 2.3, L + 0.01, GLASS);
  for (const s of [-1, 1]) { box(g, 0.04, 0.7, 0.75, s * (W + 0.005), 2.3, L - 0.55, GLASS); box(g, 0.04, 0.7, 0.75, s * (W + 0.005), 2.3, L - 1.5, GLASS); }
  box(g, 1.5, 0.55, 0.04, 0, 1.3, L + 0.01, '#2a2a30');
  for (let i = 0; i < 4; i++) box(g, 1.4, 0.04, 0.05, 0, 1.12 + i * 0.12, L + 0.02, CHROME);
  for (const s of [-1, 1]) { box(g, 0.36, 0.22, 0.05, s * 0.88, 1.15, L + 0.02, '#fff4cc'); box(g, 0.08, 0.5, 0.08, s * (W + 0.05), 2.4, L - 0.15, DARK); box(g, 0.05, 0.3, 0.2, s * (W + 0.1), 2.55, L - 0.15, DARK); }
  box(g, 2 * W + 0.1, 0.3, 0.25, 0, 0.75, L + 0.05, CHROME);
  // the body behind: equipment lockers with roller shutters down both sides, the pump panel and a white band
  box(g, 2 * W, 2.15, 2 * L - 2.1, 0, 1.97, -1.05, RED);
  box(g, 2 * W + 0.02, 0.12, 2 * L, 0, 1.25, 0, WHITE);
  for (const s of [-1, 1]) {
    for (const z of [-3.15, -1.6]) {
      box(g, 0.03, 1.25, 1.35, s * (W + 0.01), 2.15, z, SHUTTER);
      for (let i = 0; i < 6; i++) box(g, 0.035, 0.03, 1.35, s * (W + 0.012), 1.6 + i * 0.21, z, '#8d939c');
    }
    box(g, 0.05, 0.9, 0.9, s * (W + 0.02), 1.85, PUMP.z - 0.25, CHROME);
    for (const dz of [-0.5, 0]) addGeo(g, cylG(8), s * (W + 0.12), PUMP.y, PUMP.z + dz - 0.1, 0.16, 0.16, 0.16, 0, 0, Math.PI / 2, '#d9b45a');
    box(g, 0.25, 0.08, 2 * L - 2.4, s * (W + 0.1), 0.6, -1.0, CHROME); // running boards
  }
  // the rear: a step, a hose reel and the tail lights
  box(g, 2 * W, 0.15, 0.4, 0, 0.6, -L - 0.1, CHROME);
  addGeo(g, cylG(12), 0, 2.2, -L - 0.05, 1.0, 1.6, 1.0, 0, 0, Math.PI / 2, '#d8c7a0');
  for (const s of [-1, 1]) box(g, 0.2, 0.3, 0.04, s * 1.0, 1.1, -L - 0.01, '#ff3040');
  // the ladder on the roof, on a turntable at the back
  addGeo(g, cylG(12), 0, 3.15, -2.9, 1.3, 0.2, 1.3, 0, 0, 0, DKRED);
  for (const s of [-1, 1]) tube(g, [s * 0.42, 3.35, -3.3], [s * 0.42, 3.35, L - 0.4], 0.05, CHROME, 6);
  for (let z = -3.1; z < L - 0.5; z += 0.45) box(g, 0.84, 0.04, 0.05, 0, 3.35, z, CHROME);
  box(g, 0.3, 0.3, 0.5, 0, 3.15, L - 0.6, DKRED);
  return g.geometry();
}
let GEO = null;
const lightR = new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), lightW = new THREE.MeshBasicMaterial({ color: '#ffffff' });
export function buildTruck() {
  if (!GEO) { GEO = truckGeometry(); GEO.userData.shared = true; }
  const grp = new THREE.Group(), body = new THREE.Mesh(GEO, charMat); grp.add(body);
  // the light bar: a dark base with red and white halves that take turns lighting up
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.35), new THREE.MeshLambertMaterial({ color: '#222' })); base.position.set(0, 3.06, BODY.hl - 0.7); grp.add(base);
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3), lightR), w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3), lightW);
  r.position.set(-0.47, 3.18, BODY.hl - 0.7); w.position.set(0.47, 3.18, BODY.hl - 0.7); grp.add(r, w);
  const wheels = [];
  for (const s of [-1, 1]) for (const z of [BODY.hl - 1.15, -1.7, -2.95]) {
    const wh = wheelAt(hubWheelGeo(s, { r: 0.52, width: 0.38, cap: 0.3, capCol: '#c9ccd2', slotCol: '#4a4c52' }), charMat, s * 1.05, 0.52, z, 0.52);
    grp.add(wh); wheels.push(wh);
  }
  return { grp, wheels, lights: { r, w }, meshes: [body, ...wheels] };
}

