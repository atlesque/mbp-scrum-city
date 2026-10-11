import { charMat } from '../../characters/character.js';
import { pick } from '../../core/util.js';
import { GB, box, boxAB, loft } from '../../render/geometry.js';
import { carGlassMat } from '../materials.js';
import { hubWheelGeo, wheelAt } from '../wheels.js';

// Four period silhouettes on the existing car footprint. The first panel is paint, as the respray garage expects.
const PAINTS = ['#e8354a', '#3fd6c8', '#7a5cff', '#f4f0e8', '#ffb347', '#305898'];
const SHAPES = {
  comet: { front: 0.65, back: -1.15, roof: 1.42, hood: 0.72, tail: 0.76, spoiler: true },
  stallion: { front: 0.35, back: -1.0, roof: 1.48, hood: 0.92, tail: 0.88, scoop: true },
  estate: { front: 0.9, back: -1.85, roof: 1.5, hood: 0.92, tail: 0.98, rack: true },
  taxi: { front: 0.8, back: -1.2, roof: 1.5, hood: 0.92, tail: 0.88, taxi: true },
};
const section = (z, hi, w = 2) => ({ z, y: (0.3 + hi) / 2, h: hi - 0.3, w, wt: w * 0.96 });
export function retroMesh(id) {
  const s = SHAPES[id], color = s.taxi ? '#ffd23e' : pick(PAINTS), g = new GB(), glass = new GB();
  loft(g, [section(2.15, s.hood - 0.15, 1.8), section(1.8, s.hood), section(0.8, 1), section(-1.6, 1), section(-2.15, s.tail, 1.9)], color);
  // Sloped windscreen, square side glass and rear window, framed by body-coloured pillars.
  const f = s.front, b = s.back, topF = f - 0.45, topB = b + 0.25;
  loft(glass, [
    { z: f, y: 1.03, h: 0.04, w: 1.8, wt: 1.78 },
    { z: topF, y: (1 + s.roof) / 2, h: s.roof - 1, w: 1.8, wt: 1.6 },
    { z: topB, y: (1 + s.roof) / 2, h: s.roof - 1, w: 1.8, wt: 1.6 },
    { z: b, y: 1.03, h: 0.04, w: 1.8, wt: 1.78 },
  ], '#ffffff');
  box(g, 1.65, 0.08, topF - topB + 0.08, 0, s.roof + 0.01, (topF + topB) / 2, color);
  for (const side of [-1, 1]) {
    boxAB(g, [side * 0.9, 1.0, f], [side * 0.8, s.roof, topF], 0.07, 0.09, color);
    boxAB(g, [side * 0.9, 1.0, b], [side * 0.8, s.roof, topB], 0.08, 0.1, color);
    box(g, 0.06, s.roof - 1, 0.09, side * 0.86, (1 + s.roof) / 2, (f + b) / 2, '#24202c');
    box(g, 0.045, 0.055, 4.1, side * 1.005, 0.83, 0, s.scoop ? '#24202c' : '#d6cedb');
    box(g, 0.18, 0.1, 0.16, side * 1.02, 1.03, f - 0.15, color);
    box(g, 0.18, 0.05, 0.03, side * 1.01, 0.95, -0.35, '#ddd4d4');
    box(g, s.spoiler ? 0.6 : 0.42, 0.14, 0.05, side * 0.6, s.hood - 0.18, 2.16, '#fff3c2');
    box(g, 0.55, 0.12, 0.05, side * 0.6, s.tail - 0.18, -2.16, '#ff2445');
    box(g, 0.5, 0.6, 0.18, side * 0.43, 0.92, -0.6, '#2c2532');
  }
  box(g, 1.65, 0.14, 0.22, 0, 0.98, f - 0.13, '#1c1a22');
  box(g, 0.3, 0.25, 0.05, 0.42, 1.04, f - 0.32, '#141218');
  box(g, 2.05, 0.12, 0.17, 0, 0.4, 2.15, '#c9c9d4'); box(g, 2.05, 0.12, 0.17, 0, 0.4, -2.15, '#c9c9d4');
  if (s.scoop) { box(g, 0.65, 0.16, 0.8, 0, s.hood + 0.05, 1.3, '#29232c'); box(g, 0.48, 0.08, 0.025, 0, s.hood + 0.06, 1.71, '#0c0c10'); }
  if (s.spoiler) { for (const x of [-0.65, 0.65]) box(g, 0.1, 0.22, 0.12, x, s.tail + 0.12, -1.85, '#24202c'); box(g, 1.9, 0.09, 0.35, 0, s.tail + 0.25, -1.85, color); }
  if (s.rack) for (const x of [-0.65, 0.65]) box(g, 0.065, 0.09, 2.1, x, s.roof + 0.1, -0.6, '#29232c');
  if (s.taxi) {
    box(g, 0.8, 0.24, 0.35, 0, s.roof + 0.16, -0.2, '#fff2bc');
    for (const side of [-1, 1]) for (let i = 0; i < 14; i++) box(g, 0.02, 0.1, 0.14, side * 1.015, 0.77 + i % 2 * 0.1, -1 + i * 0.15, '#19151b');
    // Black roof-sign markings keep the cab recognizable at street distance.
    for (const [x, width] of [[-0.27, 0.1], [-0.09, 0.08], [0.09, 0.08], [0.27, 0.025]]) box(g, width, 0.1, 0.012, x, s.roof + 0.17, -0.017, '#33252b');
  }
  const grp = new THREE.Group(), m = new THREE.Mesh(g.geometry(), charMat), win = new THREE.Mesh(glass.geometry(), carGlassMat);
  const wheels = [];
  for (const side of [-1, 1]) for (const z of [-1.35, 1.35]) wheels.push(wheelAt(hubWheelGeo(side, { r: 0.31, width: 0.3, cap: 0.2, capCol: s.scoop ? '#33313a' : '#c9c9d4', slotCol: '#55555e' }), charMat, side * 0.94, 0.31, z, 0.31));
  const seat = new THREE.Group(); seat.position.set(0.42, -0.28, -0.25); seat.scale.setScalar(0.82); seat.userData.knees = -1.2;
  grp.add(m, win, seat, ...wheels);
  return { grp, m, win, seat, wheels, solid: [m, ...wheels], lit: [win] };
}
export const RETRO_CARS = [
  { id: 'comet', name: 'Comet Turbo', short: 'Comet', hp: 115, handling: { accel: 12, top: 37, boostTop: 47, grip: 12, turnLow: 2.3 }, engine: { rev: 0.85, gears: [0, 11, 20, 30, 40, 50] }, traffic: { weight: 0.55, speed: [12, 16] } },
  { id: 'stallion', name: 'Stallion V8', short: 'Stallion', hp: 160, handling: { accel: 10, top: 34, boostTop: 44, grip: 7, gripFast: 4, turnLow: 1.7 }, engine: { rev: 0.4, gears: [0, 12, 23, 35, 46] }, traffic: { weight: 0.65, speed: [10, 14] } },
  { id: 'estate', name: 'Palm Estate', short: 'Estate', hp: 160, handling: { accel: 6, top: 26, boostTop: 35, turnLow: 1.7, brake: 26 }, engine: { rev: 0.5, gears: [0, 8, 15, 23, 34] }, traffic: { weight: 0.7, speed: [8, 12] } },
  { id: 'taxi', name: 'Neon Cab', short: 'Taxi', hp: 145, handling: { accel: 8.5, top: 30, boostTop: 40 }, engine: { rev: 0.6, gears: [0, 9, 18, 27, 40] }, traffic: { weight: 0.8, speed: [9, 13] } },
].map(m => ({ kind: 'car', tag: 'car', ...m, mesh: () => retroMesh(m.id) }));
