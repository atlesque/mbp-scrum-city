import { GB, GEO, UNIT, addGeo, arc, box, boxAB, cylG, hexa, loft, path, sphG, tube } from '../../render/geometry.js';
import { makeCanvas } from '../../render/textures.js';

// ================= YAMAHA TÉNÉRÉ 700 RALLY =================
// Same bike space as the GS. Built to read as the rally T7: CP2 parallel twin, quad-LED tower fairing and tall screen,
// 21/18 gold-rimmed spoked wheels on knobblies, long-travel USD fork, aluminium skid plate and a high Akrapovič.
export const T7 = { rF: 0.375, rR: 0.35, zF: 0.84, zR: -0.76, H: new THREE.Vector3(0, 1.04, 0.5), rake: 0.47, seat: -0.28, seatY: 0.115, wb: 1.6 };
const T7C = { paint: '#121318', blue: '#1f4fc9', blue2: '#15389a', white: '#eef0f2', frame: '#17181c', eng: '#26272c', engHi: '#55585f', cover: '#3a3c42', alu: '#a7abb2', gold: '#c9a23f', seat: '#151519', seat2: '#25262c', rubber: '#141416', disc: '#aeb1b8', ti: '#8f8b87', pipe: '#6e655e', trim: '#2a2b30' };
export function t7WheelGeo(front) {
  const key = front ? 't7F' : 't7R'; if (GEO[key]) return GEO[key];
  const g = new GB(), R = front ? T7.rF : T7.rR, rim = front ? 0.29 : 0.25, tw = front ? 0.095 : 0.135, tr = (R - rim) / 2;
  addGeo(g, new THREE.TorusGeometry(rim + tr, tr, 10, 52).toNonIndexed(), 0, 0, 0, 1, 1, (tw / 2) / tr, 0, Math.PI / 2, 0, T7C.rubber);
  // knobbly dual-sport tread: two staggered shoulder rows and a centre row
  const N = front ? 30 : 28, rr = R - 0.002, knob = (x, a, w, d) => addGeo(g, UNIT, x, Math.sin(a) * rr, Math.cos(a) * rr, w, 0.03, d, Math.PI / 2 - a, 0, 0, '#0d0d0f');
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    for (const o of [-1, 1]) knob(o * tw * 0.32, a + o * 0.04, tw * 0.3, 0.052);
    knob(0, a + Math.PI / N, tw * 0.24, 0.04);
  }
  const rimT = new THREE.TorusGeometry(rim, 0.015, 6, 52).toNonIndexed();
  addGeo(g, rimT, 0, 0, 0, 1, 1, front ? 2.2 : 3, 0, Math.PI / 2, 0, T7C.gold);
  for (const s of [-1, 1]) addGeo(g, rimT, s * tw * 0.32, 0, 0, 1.012, 1.012, 0.45, 0, Math.PI / 2, 0, '#e0bd62');
  addGeo(g, cylG(16), 0, 0, 0, 0.09, front ? 0.13 : 0.15, 0.09, 0, 0, Math.PI / 2, '#1d1e23');
  for (const s of [-1, 1]) addGeo(g, cylG(20), s * 0.045, 0, 0, 0.13, 0.012, 0.13, 0, 0, Math.PI / 2, '#2b2d33'); // hub flanges
  for (let i = 0; i < 36; i++) { // tangent-laced spokes, alternate flanges and lacing direction
    const a = i / 36 * Math.PI * 2, s = i % 2 ? 1 : -1, d = (i >> 1) % 2 ? 1 : -1, a2 = a + d * 0.3;
    tube(g, [s * 0.045, Math.sin(a) * 0.058, Math.cos(a) * 0.058], [s * 0.012, Math.sin(a2) * (rim - 0.012), Math.cos(a2) * (rim - 0.012)], 0.005, '#b8bbc2', 5);
  }
  const wave = (x, r) => { // petal disc
    const o = Math.sign(x);
    addGeo(g, cylG(36), x, 0, 0, r * 1.84, 0.006, r * 1.84, 0, 0, Math.PI / 2, T7C.disc);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; addGeo(g, cylG(10), x, Math.sin(a) * r * 0.86, Math.cos(a) * r * 0.86, r * 0.3, 0.006, r * 0.3, 0, 0, Math.PI / 2, T7C.disc); }
    addGeo(g, cylG(20), x + o * 0.002, 0, 0, r * 1.15, 0.008, r * 1.15, 0, 0, Math.PI / 2, T7C.trim);
    for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * Math.PI * 2; addGeo(g, cylG(6), x + o * 0.002, Math.sin(a) * r * 0.76, Math.cos(a) * r * 0.76, 0.012, 0.008, 0.012, 0, 0, Math.PI / 2, '#55575d'); }
  };
  if (front) { wave(0.075, 0.141); wave(-0.075, 0.141); }
  else {
    wave(-0.085, 0.122);
    addGeo(g, cylG(42), 0.095, 0, 0, 0.22, 0.008, 0.22, 0, 0, Math.PI / 2, '#3c3e44'); // sprocket
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; addGeo(g, cylG(10), 0.1, Math.sin(a) * 0.065, Math.cos(a) * 0.065, 0.04, 0.01, 0.04, 0, 0, Math.PI / 2, '#1d1e23'); }
  }
  return (GEO[key] = g.geometry());
}
export function t7Geos() {
  if (GEO.t7) return GEO.t7;
  const b = new GB(), matte = new GB(), glow = new GB(), glass = new GB(), st = new GB(), stGlow = new GB(), stand = new GB(), K = T7C, S = T7;
  // --- CP2 parallel twin: crankcase, forward-canted finned cylinders, head ---
  loft(b, [{ z: -0.18, y: 0.43, w: 0.26, h: 0.26 }, { z: 0.05, y: 0.42, w: 0.32, h: 0.32 }, { z: 0.32, y: 0.42, w: 0.3, h: 0.28 }], K.eng);
  hexa(b, [[-0.15, 0.55, 0.1], [0.15, 0.55, 0.1], [0.15, 0.55, 0.37], [-0.15, 0.55, 0.37], [-0.15, 0.8, 0.18], [0.15, 0.8, 0.18], [0.15, 0.8, 0.45], [-0.15, 0.8, 0.45]], K.eng);
  for (let k = 0; k < 5; k++) { const y = 0.59 + k * 0.045, dz = (y - 0.55) / 0.25 * 0.08; box(b, 0.33, 0.01, 0.29, 0, y, 0.235 + dz, K.engHi); }
  hexa(b, [[-0.16, 0.8, 0.17], [0.16, 0.8, 0.17], [0.16, 0.8, 0.47], [-0.16, 0.8, 0.47], [-0.15, 0.88, 0.2], [0.15, 0.88, 0.2], [0.15, 0.88, 0.48], [-0.15, 0.88, 0.48]], K.eng);
  hexa(b, [[-0.14, 0.88, 0.21], [0.14, 0.88, 0.21], [0.14, 0.88, 0.47], [-0.14, 0.88, 0.47], [-0.12, 0.93, 0.24], [0.12, 0.93, 0.24], [0.12, 0.93, 0.45], [-0.12, 0.93, 0.45]], K.cover);
  for (const x of [-0.06, 0.06]) box(b, 0.04, 0.012, 0.14, x, 0.935, 0.345, K.alu);
  addGeo(b, cylG(24), -0.17, 0.42, 0.06, 0.25, 0.05, 0.25, 0, 0, Math.PI / 2, K.cover); // clutch cover (right)
  addGeo(b, cylG(16), -0.197, 0.42, 0.06, 0.1, 0.01, 0.1, 0, 0, Math.PI / 2, K.alu);
  addGeo(b, cylG(24), 0.17, 0.41, 0.14, 0.21, 0.05, 0.21, 0, 0, Math.PI / 2, K.cover); // alternator cover (left)
  box(b, 0.04, 0.12, 0.14, 0.165, 0.44, -0.07, K.cover); // sprocket cover
  // radiator behind the front wheel, hoses
  addGeo(b, UNIT, 0, 0.76, 0.56, 0.32, 0.28, 0.05, -0.25, 0, 0, '#0c0c0f');
  for (let k = 0; k < 6; k++) addGeo(b, UNIT, 0, 0.66 + k * 0.04, 0.582 - k * 0.01, 0.3, 0.006, 0.012, -0.25, 0, 0, '#2c2e34');
  tube(b, [0.12, 0.66, 0.53], [0.15, 0.5, 0.36], 0.016, '#18181b', 8);
  // --- exhaust: twin headers down the front, collector under the engine, high Akrapovič on the right ---
  for (const s of [-1, 1]) path(b, [[s * 0.06, 0.78, 0.47], [s * 0.07, 0.6, 0.56], [s * 0.065, 0.37, 0.53], [s * 0.04, 0.24, 0.38], [-0.02, 0.21, 0.12]], 0.024, K.pipe, 10);
  path(b, [[-0.02, 0.21, 0.12], [-0.12, 0.23, -0.12], [-0.17, 0.36, -0.3], [-0.19, 0.5, -0.43]], 0.032, K.pipe, 10);
  tube(b, [-0.19, 0.5, -0.43], [-0.2, 0.68, -0.84], 0.066, K.ti, 22);
  tube(b, [-0.2, 0.68, -0.84], [-0.203, 0.695, -0.89], 0.058, '#1b1b1d', 22); // carbon end cap
  addGeo(b, cylG(14), -0.204, 0.697, -0.893, 0.05, 0.012, 0.05, Math.PI / 2 - 0.4, 0, 0, '#050505');
  tube(b, [-0.198, 0.63, -0.72], [-0.15, 0.82, -0.66], 0.012, K.frame, 6); // hanger
  addGeo(b, UNIT, -0.268, 0.6, -0.64, 0.004, 0.035, 0.12, -0.42, 0, 0, '#d8d8dc'); // brand plate
  // --- rally skid plate ---
  loft(b, [{ z: -0.2, y: 0.235, w: 0.26, h: 0.03 }, { z: 0.24, y: 0.205, w: 0.33, h: 0.03 }, { z: 0.44, y: 0.29, w: 0.31, h: 0.03 }, { z: 0.5, y: 0.46, w: 0.26, h: 0.03 }], K.alu);
  for (const s of [-1, 1]) {
    hexa(b, [[s * 0.15, 0.22, -0.12], [s * 0.172, 0.22, -0.12], [s * 0.172, 0.33, -0.12], [s * 0.15, 0.33, -0.12], [s * 0.155, 0.22, 0.4], [s * 0.177, 0.22, 0.4], [s * 0.177, 0.38, 0.4], [s * 0.155, 0.38, 0.4]], K.alu);
    for (let k = 0; k < 4; k++) addGeo(b, cylG(8), s * 0.178, 0.3, -0.06 + k * 0.13, 0.016, 0.006, 0.016, 0, 0, Math.PI / 2, '#5f6168');
  }
  // --- steel double-cradle frame, aluminium swingarm, chain, shock ---
  tube(b, [0, 0.95, 0.545], [0, 1.13, 0.455], 0.04, K.frame, 12);
  for (const s of [-1, 1]) {
    path(b, [[s * 0.04, 1.0, 0.53], [s * 0.13, 0.82, 0.5], [s * 0.145, 0.45, 0.46], [s * 0.14, 0.26, 0.36], [s * 0.15, 0.25, 0.0], [s * 0.145, 0.42, -0.15]], 0.02, K.frame, 8);
    path(b, [[s * 0.04, 1.06, 0.48], [s * 0.13, 0.97, 0.26], [s * 0.135, 0.86, -0.04], [s * 0.135, 0.5, -0.15]], 0.026, K.frame, 8);
    tube(b, [s * 0.135, 0.86, -0.04], [s * 0.1, 0.96, -0.86], 0.016, K.frame, 8);
    tube(b, [s * 0.135, 0.56, -0.16], [s * 0.1, 0.92, -0.62], 0.015, K.frame, 8);
    hexa(b, [[s * 0.1, 0.45, -0.13], [s * 0.16, 0.45, -0.13], [s * 0.16, 0.56, -0.13], [s * 0.1, 0.56, -0.13], [s * 0.1, 0.31, -0.76], [s * 0.145, 0.31, -0.76], [s * 0.145, 0.39, -0.76], [s * 0.1, 0.39, -0.76]], K.alu);
    box(b, 0.012, 0.05, 0.05, s * 0.152, S.rR, S.zR + 0.03, '#5f6168'); // chain adjuster
  }
  addGeo(b, cylG(14), 0, 0.5, -0.14, 0.05, 0.36, 0.05, 0, 0, Math.PI / 2, '#5f6168'); // pivot
  box(b, 0.22, 0.06, 0.06, 0, 0.47, -0.32, K.alu);
  tube(b, [-0.17, S.rR, S.zR], [0.17, S.rR, S.zR], 0.012, '#9a9da4', 8);
  for (const [y0, y1] of [[0.465, 0.46], [0.375, 0.24]]) boxAB(b, [0.115, y0, -0.06], [0.115, y1, -0.76], 0.018, 0.012, '#4a4a50');
  addGeo(b, cylG(16), 0.115, 0.42, -0.06, 0.09, 0.02, 0.09, 0, 0, Math.PI / 2, '#3c3e44');
  boxAB(b, [0.115, 0.5, -0.14], [0.115, 0.43, -0.5], 0.03, 0.01, '#1b1b1f'); // chain slider
  tube(b, [0, 0.37, -0.27], [0, 0.82, -0.08], 0.02, '#2a2b30', 10);
  tube(b, [0, 0.47, -0.23], [0, 0.72, -0.12], 0.04, K.gold, 12); // spring
  tube(b, [0.06, 0.66, -0.16], [0.07, 0.78, -0.12], 0.028, '#2a2b30', 10); // reservoir
  // --- tall slim tank, rally shrouds in blue with white stripe ---
  loft(b, [{ z: -0.04, y: 1.0, w: 0.24, h: 0.1 }, { z: 0.12, y: 1.04, w: 0.34, h: 0.18 }, { z: 0.32, y: 1.06, w: 0.34, h: 0.2 }, { z: 0.46, y: 1.05, w: 0.26, h: 0.16 }], K.paint);
  addGeo(b, cylG(18), 0, 1.165, 0.3, 0.1, 0.012, 0.1, 0, 0, 0, K.engHi);
  for (const s of [-1, 1]) {
    hexa(b, [[s * 0.15, 0.8, 0.07], [s * 0.21, 0.8, 0.07], [s * 0.2, 1.0, 0.04], [s * 0.15, 1.02, 0.04], [s * 0.14, 0.64, 0.5], [s * 0.25, 0.66, 0.48], [s * 0.25, 1.06, 0.6], [s * 0.15, 1.08, 0.62]], K.blue);
    addGeo(b, UNIT, s * 0.246, 1.0, 0.4, 0.006, 0.03, 0.4, -0.2, 0, 0, K.white);
    box(b, 0.006, 0.02, 0.16, s * 0.244, 0.79, 0.3, K.blue2);
    // side panels under the seat
    hexa(b, [[s * 0.13, 0.7, -0.04], [s * 0.18, 0.7, -0.04], [s * 0.18, 0.93, -0.04], [s * 0.14, 0.94, -0.04], [s * 0.1, 0.85, -0.62], [s * 0.14, 0.85, -0.62], [s * 0.14, 0.94, -0.62], [s * 0.1, 0.95, -0.62]], K.paint);
    addGeo(b, UNIT, s * 0.168, 0.84, -0.26, 0.006, 0.025, 0.4, -0.25, 0, 0, K.blue);
  }
  // --- flat one-piece rally seat ---
  loft(matte, [{ z: -0.82, y: 0.925, w: 0.18, h: 0.04 }, { z: -0.4, y: 0.905, w: 0.26, h: 0.04 }, { z: -0.08, y: 0.9, w: 0.3, h: 0.04 }, { z: 0.06, y: 0.93, w: 0.2, h: 0.04 }], K.seat2);
  loft(matte, [{ z: -0.83, y: 0.97, w: 0.2, wt: 0.16, h: 0.06 }, { z: -0.45, y: 0.955, w: 0.27, wt: 0.23, h: 0.08 }, { z: -0.12, y: 0.95, w: 0.31, wt: 0.26, h: 0.09 }, { z: 0.06, y: 0.98, w: 0.22, wt: 0.17, h: 0.08 }], K.seat);
  for (const s of [-1, 1]) loft(matte, [{ z: -0.8, x: s * 0.094, y: 0.97, w: 0.008, h: 0.012 }, { z: -0.12, x: s * 0.146, y: 0.97, w: 0.008, h: 0.012 }], K.blue);
  // --- tail, lights, plate, rear hugger ---
  loft(b, [{ z: -0.78, y: 0.94, w: 0.2, h: 0.07 }, { z: -1.05, y: 0.97, w: 0.1, h: 0.045 }], K.paint);
  box(glow, 0.07, 0.025, 0.01, 0, 0.965, -1.056, '#ff1a2e');
  for (const s of [-1, 1]) {
    tube(b, [s * 0.11, 0.96, -0.6], [s * 0.1, 0.99, -0.86], 0.012, K.frame, 6);
    tube(b, [s * 0.05, 0.84, -1.04], [s * 0.13, 0.83, -1.05], 0.008, K.frame, 6);
    box(glow, 0.03, 0.02, 0.03, s * 0.14, 0.83, -1.05, '#ffa31a');
  }
  boxAB(b, [0, 0.93, -0.98], [0, 0.68, -1.1], 0.07, 0.02, K.frame);
  addGeo(b, UNIT, 0, 0.64, -1.11, 0.2, 0.12, 0.01, -0.2, 0, 0, '#e9e7df');
  for (let k = 0; k < 5; k++) addGeo(b, UNIT, -0.07 + k * 0.035, 0.64, -1.117, 0.018, 0.06, 0.004, -0.2, 0, 0, '#22232a');
  arc(b, 0, S.rR, S.zR, S.rR + 0.06, -0.85, -0.15, 6, 0.15, K.paint);
  // --- off-road pegs, pedals ---
  for (const s of [-1, 1]) {
    boxAB(b, [s * 0.13, 0.46, -0.1], [s * 0.19, 0.4, -0.12], 0.03, 0.04, K.frame);
    box(b, 0.11, 0.025, 0.06, s * 0.24, 0.395, -0.12, '#7a7d84');
    for (let k = 0; k < 3; k++) box(b, 0.11, 0.01, 0.006, s * 0.24, 0.41, -0.14 + k * 0.02, '#4a4c52');
    boxAB(b, [s * 0.2, 0.39, -0.08], [s * 0.2, 0.42, 0.12], 0.02, 0.012, '#5f6168');
  }
  // --- rally tower: quad-LED fairing, tall screen, nav tower ---
  hexa(b, [[-0.13, 1.02, 0.58], [0.13, 1.02, 0.58], [0.15, 1.3, 0.56], [-0.15, 1.3, 0.56], [-0.11, 1.03, 0.78], [0.11, 1.03, 0.78], [0.12, 1.28, 0.74], [-0.12, 1.28, 0.74]], K.paint);
  addGeo(b, UNIT, 0, 1.155, 0.763, 0.2, 0.23, 0.01, -0.17, 0, 0, '#08090c');
  for (const s of [-1, 1]) {
    addGeo(b, cylG(20), s * 0.05, 1.095, 0.773, 0.085, 0.008, 0.085, Math.PI / 2, 0, 0, K.alu);
    addGeo(glow, cylG(20), s * 0.05, 1.095, 0.778, 0.068, 0.006, 0.068, Math.PI / 2, 0, 0, '#f2f8ff');
    addGeo(b, cylG(16), s * 0.045, 1.2, 0.756, 0.062, 0.008, 0.062, Math.PI / 2, 0, 0, K.alu);
    addGeo(glow, cylG(16), s * 0.045, 1.2, 0.761, 0.048, 0.006, 0.048, Math.PI / 2, 0, 0, '#f2f8ff');
    hexa(b, [[s * 0.1, 0.98, 0.48], [s * 0.2, 0.97, 0.5], [s * 0.21, 1.22, 0.5], [s * 0.11, 1.26, 0.48], [s * 0.11, 1.0, 0.72], [s * 0.14, 1.0, 0.72], [s * 0.14, 1.27, 0.7], [s * 0.12, 1.29, 0.7]], K.blue);
    addGeo(b, UNIT, s * 0.18, 1.08, 0.6, 0.006, 0.02, 0.22, 0.25, s * 0.12, 0, K.white);
    box(glow, 0.03, 0.02, 0.05, s * 0.2, 1.12, 0.62, '#ffa31a');
    tube(b, [s * 0.08, 1.0, 0.6], [s * 0.08, 1.4, 0.58], 0.01, K.frame, 6);
  }
  addGeo(glow, UNIT, 0, 1.147, 0.766, 0.16, 0.012, 0.004, -0.17, 0, 0, '#dff3ff'); // DRL bar between the pairs
  hexa(glass, [[-0.14, 1.27, 0.73], [0.14, 1.27, 0.73], [0.13, 1.63, 0.6], [-0.13, 1.63, 0.6], [-0.14, 1.27, 0.718], [0.14, 1.27, 0.718], [0.13, 1.63, 0.588], [-0.13, 1.63, 0.588]], '#ffffff');
  tube(b, [-0.12, 1.38, 0.57], [0.12, 1.38, 0.57], 0.008, K.frame, 6);
  addGeo(b, UNIT, 0, 1.3, 0.56, 0.2, 0.13, 0.025, -0.6, 0, 0, K.frame);
  addGeo(glow, UNIT, 0, 1.298, 0.546, 0.17, 0.1, 0.004, -0.6, 0, 0, '#2c5c9c');
  // --- steered parts: USD fork, low fender, tapered bar, hand guards, mirrors ---
  const along = (s, t) => [s * 0.1, S.rF + 0.891 * t, S.zF - 0.453 * t];
  for (const s of [-1, 1]) {
    tube(st, along(s, -0.04), along(s, 0.08), 0.03, '#1d1f24', 12);
    tube(st, along(s, 0.08), along(s, 0.4), 0.024, K.gold, 14);
    tube(st, along(s, 0.4), along(s, 0.88), 0.033, '#1d1f24', 14);
    { const a = along(s, 0.06), c = along(s, 0.36); boxAB(st, [a[0], a[1], a[2] + 0.035], [c[0], c[1], c[2] + 0.035], 0.05, 0.012, K.paint); } // fork guard
    addGeo(st, UNIT, s * 0.088, S.rF + 0.07, S.zF - 0.13, 0.03, 0.06, 0.12, -1.1, 0, 0, '#2c2d33'); // caliper
    tube(st, [s * 0.05, 1.15, 0.45], [s * 0.05, 1.185, 0.43], 0.016, K.frame, 8); // risers
    tube(st, [s * 0.33, 1.2, 0.39], [s * 0.45, 1.215, 0.355], 0.019, K.rubber, 10);
    hexa(st, [[s * 0.3, 1.15, 0.46], [s * 0.48, 1.17, 0.41], [s * 0.49, 1.28, 0.42], [s * 0.3, 1.27, 0.47], [s * 0.3, 1.15, 0.476], [s * 0.49, 1.17, 0.426], [s * 0.5, 1.28, 0.436], [s * 0.3, 1.27, 0.486]], K.paint);
    path(st, [[s * 0.24, 1.19, 0.43], [s * 0.4, 1.165, 0.44], [s * 0.5, 1.2, 0.4]], 0.007, K.alu, 6);
    boxAB(st, [s * 0.28, 1.205, 0.42], [s * 0.41, 1.19, 0.47], 0.016, 0.01, '#5f6168');
    tube(st, [s * 0.26, 1.2, 0.42], [s * 0.31, 1.42, 0.44], 0.008, K.frame, 6);
    addGeo(st, sphG(), s * 0.32, 1.44, 0.44, 0.12, 0.075, 0.03, 0, 0, s * 0.15, K.paint);
    addGeo(st, UNIT, s * 0.32, 1.44, 0.4235, 0.1, 0.055, 0.003, 0, 0, s * 0.15, '#93a9c1');
  }
  for (const t of [0.62, 0.86]) { const m = along(0, t); boxAB(st, [-0.14, m[1], m[2]], [0.14, m[1], m[2]], 0.07, 0.05, K.frame); }
  box(st, 0.05, 0.035, 0.04, -0.2, 1.22, 0.42, K.frame);
  box(stGlow, 0.012, 0.008, 0.012, -0.2, 1.24, 0.425, '#ff3346');
  tube(st, [-0.13, S.rF, S.zF], [0.13, S.rF, S.zF], 0.014, '#9a9da4', 8);
  path(st, [[-0.43, 1.215, 0.37], [-0.24, 1.185, 0.42], [0.24, 1.185, 0.42], [0.43, 1.215, 0.37]], 0.012, '#1b1b1f', 8);
  arc(st, 0, S.rF, S.zF, S.rF + 0.04, -0.55, 0.95, 10, 0.12, K.paint);
  arc(st, 0, S.rF, S.zF, S.rF + 0.042, -0.05, 0.6, 4, 0.03, K.blue);
  // side stand (left), shown when parked
  tube(stand, [0.14, 0.38, -0.08], [0.33, 0.02, -0.16], 0.016, K.frame, 6); box(stand, 0.06, 0.012, 0.08, 0.33, 0.01, -0.16, K.frame);
  const H = S.H;
  return (GEO.t7 = { body: b.geometry(), matte: matte.geometry(), glow: glow.geometry(), glass: glass.geometry(), st: st.geometry().translate(-H.x, -H.y, -H.z), stGlow: stGlow.geometry().translate(-H.x, -H.y, -H.z), stand: stand.geometry(), decal: new THREE.PlaneGeometry(0.3, 0.056) });
}
let t7Decal = null;
export function t7DecalMat() {
  if (t7Decal) return t7Decal;
  const c = makeCanvas(320, 60), x = c.getContext('2d'); x.font = 'italic 700 40px "Chakra Petch", sans-serif'; x.fillStyle = '#f4f6f8'; x.textBaseline = 'middle'; x.fillText('TÉNÉRÉ 700', 8, 32);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return (t7Decal = new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false }));
}

export default {
  id: 't7', kind: 'bike', name: 'Yamaha Ténéré 700 Rally', short: 'Ténéré 700', tag: 'Ténéré',
  hp: 160,
  spec: T7, geos: t7Geos, wheel: t7WheelGeo, decal: t7DecalMat, decalAt: [0.249, 0.88, 0.38],
  engine: { rev: 1.12 },
  traffic: { weight: 1, speed: [14, 18] },
};
