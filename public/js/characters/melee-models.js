import { GB, box } from '../render/geometry.js';

// ================= MELEE WEAPON MODELS =================
// Low-poly melee weapons, drawn in the hand's frame: the grip sits at the origin and the weapon runs down -Y
// from the fist, then the whole thing is tipped forward by `tilt` radians so it points ahead of the hand
// rather than straight down the arm (a bat held at someone's side points forward and down).
// Each returns the tip, which the hand frame uses where a gun would use its muzzle.
const MODELS = {
  // a gold bar across the four knuckles
  knuckles: { tilt: 0, build(g) {
    box(g, 0.17, 0.05, 0.06, 0, -0.06, 0.075, '#d9b44a');
    for (let k = 0; k < 4; k++) box(g, 0.035, 0.055, 0.03, -0.06 + k * 0.04, -0.06, 0.1, '#f2d27a');
    box(g, 0.13, 0.06, 0.035, 0, -0.03, 0.045, '#b8932e');
    return -0.08;
  } },
  knife: { tilt: 1.35, build(g) {
    box(g, 0.035, 0.12, 0.045, 0, 0, 0, '#22212a');
    box(g, 0.06, 0.02, 0.07, 0, -0.07, 0, '#8a8f99');
    box(g, 0.015, 0.2, 0.045, 0, -0.18, 0.005, '#d8dde4');
    box(g, 0.012, 0.05, 0.025, 0, -0.29, 0.012, '#d8dde4');
    return -0.31;
  } },
  // a side-handle baton: the short handle in the fist, the long shaft along the forearm
  nightstick: { tilt: 0.95, build(g) {
    box(g, 0.05, 0.62, 0.05, 0, -0.26, 0, '#18181d');
    box(g, 0.06, 0.04, 0.06, 0, 0.06, 0, '#2b2b33');
    box(g, 0.035, 0.035, 0.12, 0, -0.02, -0.06, '#18181d');
    return -0.58;
  } },
  golf: { tilt: 1.0, build(g) {
    box(g, 0.045, 0.24, 0.045, 0, -0.04, 0, '#1b1b20');
    box(g, 0.022, 0.72, 0.022, 0, -0.5, 0, '#cfd3da');
    box(g, 0.05, 0.07, 0.15, 0, -0.88, 0.05, '#8a8f99');
    return -0.9;
  } },
  bat: { tilt: 1.0, build(g) {
    box(g, 0.045, 0.06, 0.045, 0, 0.1, 0, '#c89a5e');
    box(g, 0.04, 0.22, 0.04, 0, -0.02, 0, '#2a2226');
    box(g, 0.05, 0.25, 0.05, 0, -0.25, 0, '#c89a5e');
    box(g, 0.07, 0.25, 0.07, 0, -0.5, 0, '#c89a5e');
    box(g, 0.085, 0.2, 0.085, 0, -0.72, 0, '#b8894f');
    return -0.82;
  } },
  machete: { tilt: 1.05, build(g) {
    box(g, 0.04, 0.14, 0.05, 0, 0, 0, '#3a2a22');
    box(g, 0.06, 0.025, 0.06, 0, -0.08, 0, '#55555e');
    box(g, 0.012, 0.42, 0.075, 0, -0.3, 0.01, '#cfd6de');
    box(g, 0.012, 0.1, 0.06, 0, -0.55, 0.018, '#cfd6de');
    box(g, 0.014, 0.42, 0.012, 0, -0.3, -0.03, '#7c828c');
    return -0.6;
  } },
  katana: { tilt: 0.95, build(g) {
    box(g, 0.04, 0.28, 0.045, 0, -0.04, 0, '#2b1a2e');
    for (let k = 0; k < 4; k++) box(g, 0.045, 0.02, 0.05, 0, 0.06 - k * 0.07, 0, '#d9c9a0');
    box(g, 0.1, 0.02, 0.1, 0, -0.19, 0, '#b08a3a');
    box(g, 0.012, 0.74, 0.04, 0, -0.57, 0.005, '#e8edf2');
    box(g, 0.012, 0.1, 0.03, 0, -0.98, 0.012, '#e8edf2');
    return -1.03;
  } },
  // an orange two-stroke saw: the body in the hands, the bar and chain out front
  chainsaw: { tilt: 0.75, build(g) {
    box(g, 0.16, 0.36, 0.22, 0, -0.06, 0.02, '#ff7a1a');
    box(g, 0.17, 0.12, 0.2, 0, 0.12, 0.02, '#2a2a30');
    box(g, 0.04, 0.05, 0.2, 0, 0.21, 0.02, '#2a2a30');
    box(g, 0.15, 0.04, 0.04, 0, -0.1, 0.16, '#2a2a30');
    box(g, 0.035, 0.62, 0.1, 0, -0.52, 0.03, '#9aa0a8');
    box(g, 0.045, 0.62, 0.025, 0, -0.52, 0.09, '#3a3a40');
    box(g, 0.045, 0.62, 0.025, 0, -0.52, -0.03, '#3a3a40');
    return -0.84;
  } },
};
export const MELEE_MODEL_IDS = Object.keys(MODELS);

// { geo, muzzle, tilt } for a melee weapon, or null when it has no model (fists)
export function meleeModel(id) {
  const m = MODELS[id]; if (!m) return null;
  const g = new GB(), tip = m.build(g), geo = g.geometry();
  geo.rotateX(-m.tilt);
  const muzzle = new THREE.Vector3(0, tip, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), -m.tilt);
  return { geo, muzzle, tilt: m.tilt };
}
