import { pick } from '../../core/util.js';
import { charMat } from '../../characters/character.js';
import { PGEO } from '../../render/effects.js';
import { GB, box } from '../../render/geometry.js';
import { lightBlue, lightRed } from '../materials.js';

// ================= 80s SEDAN =================
// Car space: +z forward, ground at y 0. The body is 2.0 wide and 4.3 long.
const CAR_COLORS = ['#f4f0e8', '#ff7eb6', '#3fd6c8', '#ffe8b0', '#e8354a', '#7a5cff', '#ffb347', '#2f6fcf', '#1f1f28', '#b8f0e6'];
export function carMesh(color, cop) {
  const g = new GB(), body = cop ? '#16161c' : color;
  box(g, 2.0, 0.62, 4.3, 0, 0.62, 0, body);
  if (cop) box(g, 2.02, 0.5, 1.9, 0, 0.66, 0.1, '#f4f4f4');
  box(g, 1.72, 0.56, 2.1, 0, 1.2, -0.2, '#2a3f5a');
  box(g, 1.78, 0.08, 2.2, 0, 1.5, -0.2, body);
  box(g, 2.04, 0.06, 4.34, 0, 0.98, 0, cop ? '#16161c' : '#ffffff');
  for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) box(g, 0.3, 0.62, 0.62, sx * 0.94, 0.31, sz, '#141218');
  box(g, 0.4, 0.16, 0.05, 0.62, 0.72, 2.16, '#fff7c8'); box(g, 0.4, 0.16, 0.05, -0.62, 0.72, 2.16, '#fff7c8');
  box(g, 0.4, 0.14, 0.05, 0.62, 0.72, -2.16, '#ff2a40'); box(g, 0.4, 0.14, 0.05, -0.62, 0.72, -2.16, '#ff2a40');
  box(g, 2.06, 0.12, 0.2, 0, 0.42, 2.18, '#c9c9d4'); box(g, 2.06, 0.12, 0.2, 0, 0.42, -2.18, '#c9c9d4');
  const grp = new THREE.Group(), m = new THREE.Mesh(g.geometry(), charMat); grp.add(m);
  let lr = null, lb = null;
  if (cop) { lr = new THREE.Mesh(PGEO, lightRed); lr.scale.set(0.6, 0.18, 0.3); lr.position.set(0.35, 1.62, -0.2); lb = new THREE.Mesh(PGEO, lightBlue); lb.scale.set(0.6, 0.18, 0.3); lb.position.set(-0.35, 1.62, -0.2); grp.add(lr, lb); }
  const seat = new THREE.Group(); seat.position.set(0.45, 0, -0.3); grp.add(seat);
  return { grp, m, lr, lb, seat, solid: [m], lit: [lr, lb].filter(Boolean) };
}

export default {
  id: 'sedan', kind: 'car', name: 'Sedan', short: 'Sedan', tag: 'car',
  hp: 130,
  mesh: () => carMesh(pick(CAR_COLORS), false),
  engine: { rev: 0.55, gears: [0, 9, 17, 25, 34, 44] },
  traffic: { weight: 1, speed: [9, 13] },
};
