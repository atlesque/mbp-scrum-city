import { GB, GEO, UNIT, addGeo, arc, box, boxAB, cylG, geoOnce, hexa, loft, path, sphG, tube } from '../../render/geometry.js';
import { makeCanvas } from '../../render/textures.js';

// ================= BMW R 1300 GS 'TRIPLE BLACK' =================
// Hand-built from a few thousand faces so the boxer twin, beak, X headlight, crash bars and Paralever read at street distance.
// Bike space: +z forward, +x is the bike's left, ground at y 0.
export const GS = { rF: 0.355, rR: 0.325, zF: 0.78, zR: -0.74, H: new THREE.Vector3(0, 0.98, 0.53), rake: 0.38, seat: -0.3, seatY: 0.07, wb: 1.52 };
const GSC = { paint: '#16171c', paint2: '#202229', frame: '#0f0f12', eng: '#26272d', engHi: '#3e4048', alu: '#a3a6ad', seat: '#19191c', seat2: '#2d2d33', rubber: '#141416', disc: '#a8abb2', pipe: '#4a4541', trim: '#2a2b30' };
function roundel(gb, x, y, z, nx, r) {
  addGeo(gb, cylG(28), x, y, z, r * 2.16, 0.004, r * 2.16, 0, 0, Math.PI / 2, GSC.alu);
  addGeo(gb, cylG(28), x + nx * 0.002, y, z, r * 2, 0.004, r * 2, 0, 0, Math.PI / 2, '#0b0b0d');
  for (let i = 0; i < 4; i++) addGeo(gb, geoOnce('q' + i, () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false, i * Math.PI / 2, Math.PI / 2)), x + nx * 0.004, y, z, r * 1.44, 0.004, r * 1.44, 0, 0, Math.PI / 2, i % 2 ? '#f2f2f2' : '#1c69d4');
}
export function gsWheelGeo(front) {
  const key = front ? 'wF' : 'wR'; if (GEO[key]) return GEO[key];
  const g = new GB(), R = front ? GS.rF : GS.rR, rim = front ? 0.272 : 0.222, tw = front ? 0.12 : 0.17, tr = (R - rim) / 2;
  addGeo(g, new THREE.TorusGeometry(rim + tr, tr, 10, 48).toNonIndexed(), 0, 0, 0, 1, 1, (tw / 2) / tr, 0, Math.PI / 2, 0, GSC.rubber);
  const N = front ? 36 : 32; // tread blocks
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, rr = R - 0.004; addGeo(g, UNIT, (i % 2 ? 1 : -1) * tw * 0.2, Math.sin(a) * rr, Math.cos(a) * rr, tw * 0.42, 0.022, 0.045, Math.PI / 2 - a, 0, 0, '#0e0e10'); }
  const rimT = new THREE.TorusGeometry(rim, 0.016, 6, 48).toNonIndexed();
  addGeo(g, rimT, 0, 0, 0, 1, 1, 2.4, 0, Math.PI / 2, 0, '#101013');
  for (const s of [-1, 1]) addGeo(g, rimT, s * tw * 0.36, 0, 0, 1.01, 1.01, 0.5, 0, Math.PI / 2, 0, '#34363d');
  addGeo(g, cylG(16), 0, 0, 0, 0.12, front ? 0.16 : 0.15, 0.12, 0, 0, Math.PI / 2, '#1d1e23');
  for (let i = 0; i < 24; i++) { // cross-spoke: spokes run from the hub to the opposite rim shoulder
    const a = i / 24 * Math.PI * 2, s = i % 2 ? 1 : -1, a2 = a + s * 0.42;
    tube(g, [s * 0.065, Math.sin(a) * 0.065, Math.cos(a) * 0.065], [s * 0.022, Math.sin(a2) * (rim - 0.012), Math.cos(a2) * (rim - 0.012)], 0.0055, '#2a2c32', 5);
  }
  const disc = (x, r) => {
    const o = Math.sign(x);
    addGeo(g, cylG(36), x, 0, 0, r * 2, 0.007, r * 2, 0, 0, Math.PI / 2, GSC.disc);
    addGeo(g, cylG(20), x + o * 0.002, 0, 0, 0.17, 0.008, 0.17, 0, 0, Math.PI / 2, GSC.trim);
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; addGeo(g, cylG(6), x + o * 0.002, Math.sin(a) * r * 0.82, Math.cos(a) * r * 0.82, 0.014, 0.009, 0.014, 0, 0, Math.PI / 2, '#55575d'); }
  };
  if (front) { disc(0.082, 0.16); disc(-0.082, 0.16); } else disc(-0.09, 0.138);
  return (GEO[key] = g.geometry());
}
export function gsGeos() {
  if (GEO.gs) return GEO.gs;
  const b = new GB(), matte = new GB(), glow = new GB(), glass = new GB(), st = new GB(), stGlow = new GB(), stand = new GB(), K = GSC;
  // --- boxer twin, crankcase and gearbox ---
  loft(b, [{ z: -0.16, y: 0.48, w: 0.26, h: 0.3 }, { z: 0.06, y: 0.44, w: 0.3, h: 0.36 }, { z: 0.44, y: 0.45, w: 0.3, h: 0.3 }], K.eng);
  box(b, 0.24, 0.07, 0.34, 0, 0.255, 0.26, K.engHi);
  for (const s of [-1, 1]) {
    addGeo(b, cylG(20), s * 0.27, 0.46, 0.3, 0.17, 0.24, 0.17, 0, 0, Math.PI / 2, K.eng);
    for (let k = 0; k < 4; k++) addGeo(b, cylG(20), s * (0.2 + k * 0.045), 0.46, 0.3, 0.205, 0.012, 0.205, 0, 0, Math.PI / 2, K.engHi);
    box(b, 0.1, 0.2, 0.25, s * 0.44, 0.47, 0.3, K.eng);
    addGeo(b, cylG(24), s * 0.505, 0.47, 0.3, 0.23, 0.07, 0.23, 0, 0, Math.PI / 2, K.paint); // valve cover
    for (let k = -1; k <= 1; k++) box(b, 0.012, 0.014, 0.17, s * 0.543, 0.47 + k * 0.045, 0.3, K.engHi);
    addGeo(b, cylG(16), s * 0.548, 0.47, 0.3, 0.06, 0.012, 0.06, 0, 0, Math.PI / 2, K.alu);
    tube(b, [s * 0.42, 0.58, 0.28], [s * 0.17, 0.74, 0.18], 0.034, K.eng, 12); // intake runner
    path(b, [[s * 0.46, 0.4, 0.4], [s * 0.45, 0.29, 0.5], [s * 0.26, 0.19, 0.52], [s * 0.06, 0.17, 0.4], [0, 0.17, 0.16]], 0.026, K.pipe, 10); // headers
    // crash bars around each cylinder
    path(b, [[s * 0.17, 0.75, 0.42], [s * 0.42, 0.66, 0.47], [s * 0.57, 0.52, 0.41], [s * 0.56, 0.36, 0.32], [s * 0.42, 0.26, 0.18], [s * 0.2, 0.3, 0.1]], 0.016, K.frame, 8);
  }
  // collector, then the angular silencer on the right
  path(b, [[0, 0.17, 0.16], [-0.06, 0.18, -0.04], [-0.17, 0.25, -0.24], [-0.23, 0.38, -0.42], [-0.25, 0.47, -0.52]], 0.032, K.pipe, 10);
  loft(b, [{ z: -0.5, x: -0.25, y: 0.48, w: 0.15, h: 0.15 }, { z: -0.74, x: -0.255, y: 0.58, w: 0.15, h: 0.16 }, { z: -0.95, x: -0.255, y: 0.65, w: 0.13, h: 0.14 }], '#1a1a1d');
  loft(b, [{ z: -0.95, x: -0.255, y: 0.65, w: 0.13, h: 0.14 }, { z: -0.99, x: -0.255, y: 0.655, w: 0.11, h: 0.12 }], K.alu);
  addGeo(b, cylG(14), -0.255, 0.655, -0.995, 0.06, 0.02, 0.06, Math.PI / 2, 0, 0, '#050505');
  loft(b, [{ z: -0.56, x: -0.334, y: 0.53, w: 0.012, h: 0.1 }, { z: -0.86, x: -0.334, y: 0.63, w: 0.012, h: 0.1 }], '#3a3a3e');
  // --- frame, Telelever A-arm and shocks ---
  for (const s of [-1, 1]) {
    path(b, [[s * 0.05, 0.95, 0.5], [s * 0.15, 0.7, 0.44], [s * 0.15, 0.5, 0.4]], 0.026, K.frame, 8);
    path(b, [[s * 0.06, 0.92, 0.5], [s * 0.13, 0.82, 0.12], [s * 0.13, 0.56, -0.06]], 0.028, K.frame, 8);
    tube(b, [s * 0.13, 0.8, 0.04], [s * 0.11, 0.92, -0.84], 0.02, K.frame, 8);
    tube(b, [s * 0.13, 0.56, -0.06], [s * 0.1, 0.86, -0.7], 0.018, K.frame, 8);
  }
  tube(b, [0, 0.88, 0.56], [0, 1.05, 0.49], 0.04, K.frame, 12);
  boxAB(b, [0, 0.58, 0.42], [0, 0.72, 0.62], 0.18, 0.05, K.frame);
  tube(b, [0, 0.72, 0.6], [0, 0.95, 0.45], 0.028, K.trim, 10);
  tube(b, [0.03, 0.42, -0.3], [0, 0.84, -0.12], 0.03, K.trim, 10);
  tube(b, [0.025, 0.5, -0.27], [0.008, 0.74, -0.17], 0.042, '#1f2024', 12);
  // --- Paralever single-sided swingarm (left) and shaft final drive ---
  hexa(b, [[0.05, 0.36, -0.06], [0.15, 0.36, -0.06], [0.15, 0.49, -0.06], [0.05, 0.49, -0.06], [0.1, 0.28, -0.68], [0.17, 0.28, -0.68], [0.17, 0.37, -0.68], [0.1, 0.37, -0.68]], K.eng);
  addGeo(b, sphG(), 0.15, GS.rR, GS.zR, 0.11, 0.2, 0.22, 0, 0, 0, K.eng);
  addGeo(b, cylG(20), 0.17, GS.rR, GS.zR, 0.15, 0.06, 0.15, 0, 0, Math.PI / 2, K.engHi);
  tube(b, [0.09, 0.26, -0.1], [0.12, 0.23, -0.62], 0.016, K.frame, 8);
  arc(b, 0.03, GS.rR, GS.zR, GS.rR + 0.05, 0.15, 0.95, 6, 0.16, K.paint); // rear hugger
  // --- tank, radiator shrouds, seat, side panels ---
  loft(b, [{ z: 0, y: 0.865, w: 0.25, h: 0.11 }, { z: 0.2, y: 0.9, w: 0.38, h: 0.2 }, { z: 0.44, y: 0.95, w: 0.36, h: 0.2 }, { z: 0.6, y: 0.98, w: 0.24, h: 0.15 }], K.paint);
  addGeo(b, cylG(18), 0, 1.0, 0.34, 0.1, 0.012, 0.1, -0.15, 0, 0, K.engHi);
  for (const s of [-1, 1]) {
    hexa(b, [[s * 0.17, 0.6, 0.2], [s * 0.25, 0.62, 0.2], [s * 0.25, 0.9, 0.2], [s * 0.17, 0.93, 0.2], [s * 0.17, 0.58, 0.62], [s * 0.31, 0.61, 0.6], [s * 0.3, 0.99, 0.62], [s * 0.17, 1.0, 0.64]], K.paint);
    box(b, 0.12, 0.3, 0.012, s * 0.24, 0.8, 0.627, '#060607');
    for (let k = 0; k < 5; k++) box(b, 0.12, 0.008, 0.01, s * 0.24, 0.68 + k * 0.06, 0.634, K.engHi);
    roundel(b, s * 0.3, 0.83, 0.45, s, 0.045);
    hexa(b, [[s * 0.07, 0.8, -0.92], [s * 0.12, 0.82, -0.92], [s * 0.12, 0.92, -0.92], [s * 0.07, 0.93, -0.92], [s * 0.09, 0.64, -0.04], [s * 0.165, 0.66, -0.04], [s * 0.165, 0.86, -0.04], [s * 0.09, 0.87, -0.04]], K.paint2);
  }
  loft(matte, [{ z: -0.46, y: 0.83, w: 0.3, h: 0.04 }, { z: -0.15, y: 0.83, w: 0.34, h: 0.04 }, { z: 0.04, y: 0.85, w: 0.22, h: 0.04 }], K.seat2);
  loft(matte, [{ z: -0.45, y: 0.885, w: 0.32, wt: 0.28, h: 0.075 }, { z: -0.15, y: 0.88, w: 0.35, wt: 0.3, h: 0.085 }, { z: 0.05, y: 0.9, w: 0.22, wt: 0.18, h: 0.08 }], K.seat);
  loft(matte, [{ z: -0.88, y: 0.955, w: 0.24, wt: 0.2, h: 0.07 }, { z: -0.46, y: 0.94, w: 0.3, wt: 0.26, h: 0.085 }], K.seat);
  // --- luggage rack, tail light, plate ---
  loft(b, [{ z: -1.1, y: 0.95, w: 0.2, h: 0.05 }, { z: -0.86, y: 0.96, w: 0.27, h: 0.06 }], K.frame);
  for (const s of [-1, 1]) {
    tube(b, [s * 0.14, 1.0, -0.84], [s * 0.12, 1.0, -1.1], 0.012, K.trim, 6);
    tube(b, [s * 0.15, 0.97, -0.6], [s * 0.15, 1.0, -0.84], 0.013, K.trim, 6);
    tube(b, [s * 0.08, 0.9, -1.08], [s * 0.15, 0.89, -1.1], 0.008, K.frame, 6);
    box(glow, 0.03, 0.022, 0.03, s * 0.16, 0.89, -1.1, '#ffa31a');
  }
  tube(b, [-0.12, 1.0, -1.1], [0.12, 1.0, -1.1], 0.012, K.trim, 6);
  box(glow, 0.15, 0.025, 0.01, 0, 0.925, -1.106, '#ff1a2e'); box(glow, 0.05, 0.05, 0.01, 0, 0.9, -1.106, '#ff3346');
  boxAB(b, [0, 0.9, -1.04], [0, 0.66, -1.16], 0.07, 0.02, K.frame);
  addGeo(b, UNIT, 0, 0.62, -1.17, 0.2, 0.12, 0.01, -0.2, 0, 0, '#e9e7df');
  for (let k = 0; k < 5; k++) addGeo(b, UNIT, -0.07 + k * 0.035, 0.62, -1.177, 0.018, 0.06, 0.004, -0.2, 0, 0, '#22232a');
  // --- pegs and pedals ---
  for (const s of [-1, 1]) {
    boxAB(b, [s * 0.12, 0.44, -0.02], [s * 0.2, 0.37, -0.06], 0.03, 0.04, K.frame); box(b, 0.1, 0.025, 0.06, s * 0.24, 0.365, -0.06, '#3b3d44');
    boxAB(b, [s * 0.11, 0.62, -0.38], [s * 0.19, 0.5, -0.44], 0.025, 0.03, K.frame); box(b, 0.07, 0.02, 0.05, s * 0.21, 0.495, -0.44, '#3b3d44');
    boxAB(b, [s * 0.2, 0.36, -0.02], [s * 0.19, 0.38, 0.16], 0.02, 0.012, '#5f6168');
  }
  // --- fixed fairing: X-light, beak, cheeks, screen, TFT ---
  loft(b, [{ z: 0.58, y: 1.06, w: 0.24, h: 0.2 }, { z: 0.74, y: 1.05, w: 0.3, h: 0.24 }], K.paint);
  box(b, 0.28, 0.21, 0.012, 0, 1.05, 0.745, '#08090c');
  for (const t of [0.6, -0.6]) addGeo(glow, UNIT, 0, 1.05, 0.753, 0.3, 0.016, 0.006, 0, 0, t, '#dff3ff');
  for (const s of [-1, 1]) addGeo(glow, cylG(18), s * 0.085, 1.05, 0.752, 0.07, 0.006, 0.07, Math.PI / 2, 0, 0, '#f2f8ff');
  for (const s of [-1, 1]) addGeo(glow, cylG(14), 0, 1.05 + s * 0.068, 0.752, 0.035, 0.006, 0.035, Math.PI / 2, 0, 0, '#f2f8ff');
  hexa(b, [[-0.13, 0.9, 0.6], [0.13, 0.9, 0.6], [0.13, 0.95, 0.6], [-0.13, 0.95, 0.6], [-0.06, 0.84, 1.02], [0.06, 0.84, 1.02], [0.06, 0.865, 1.02], [-0.06, 0.865, 1.02]], K.paint);
  for (const s of [-1, 1]) {
    hexa(b, [[s * 0.12, 0.92, 0.48], [s * 0.24, 0.9, 0.48], [s * 0.24, 1.08, 0.48], [s * 0.12, 1.1, 0.48], [s * 0.13, 0.95, 0.74], [s * 0.16, 0.94, 0.74], [s * 0.16, 1.16, 0.72], [s * 0.13, 1.16, 0.72]], K.paint);
    tube(b, [s * 0.15, 1.12, 0.66], [s * 0.15, 1.32, 0.6], 0.01, K.frame, 6);
  }
  hexa(glass, [[-0.17, 1.15, 0.72], [0.17, 1.15, 0.72], [0.15, 1.5, 0.6], [-0.15, 1.5, 0.6], [-0.17, 1.15, 0.708], [0.17, 1.15, 0.708], [0.15, 1.5, 0.588], [-0.15, 1.5, 0.588]], '#ffffff');
  addGeo(b, UNIT, 0, 1.21, 0.58, 0.22, 0.14, 0.025, -0.55, 0, 0, K.frame);
  addGeo(glow, UNIT, 0, 1.208, 0.566, 0.19, 0.11, 0.004, -0.55, 0, 0, '#2c5c9c');
  // --- steered parts: Telelever fork, mudguard, bars, guards, mirrors ---
  const along = (s, t) => [s * 0.11, GS.rF + 0.928 * t, GS.zF - 0.371 * t];
  for (const s of [-1, 1]) {
    tube(st, along(s, -0.03), along(s, 0.34), 0.036, K.paint, 14);
    tube(st, along(s, 0.34), along(s, 0.68), 0.027, '#2f3137', 14);
    addGeo(st, UNIT, s * 0.096, GS.rF + 0.06, GS.zF - 0.14, 0.03, 0.06, 0.13, -1.17, 0, 0, '#2c2d33'); // caliper
    tube(st, [s * 0.06, 0.99, 0.51], [s * 0.08, 1.17, 0.44], 0.018, K.frame, 8);
    tube(st, [s * 0.32, 1.208, 0.388], [s * 0.45, 1.218, 0.362], 0.021, K.rubber, 10);
    hexa(st, [[s * 0.3, 1.15, 0.43], [s * 0.47, 1.17, 0.39], [s * 0.47, 1.28, 0.4], [s * 0.3, 1.27, 0.44], [s * 0.3, 1.15, 0.448], [s * 0.48, 1.17, 0.408], [s * 0.48, 1.28, 0.418], [s * 0.3, 1.27, 0.458]], K.paint);
    box(stGlow, 0.012, 0.03, 0.05, s * 0.485, 1.225, 0.41, '#ffa31a');
    boxAB(st, [s * 0.28, 1.205, 0.42], [s * 0.41, 1.19, 0.47], 0.016, 0.01, '#5f6168');
    tube(st, [s * 0.27, 1.21, 0.42], [s * 0.34, 1.41, 0.43], 0.008, K.frame, 6);
    addGeo(st, sphG(), s * 0.35, 1.43, 0.43, 0.14, 0.085, 0.035, 0, 0, s * 0.15, K.paint);
    addGeo(st, UNIT, s * 0.35, 1.43, 0.4115, 0.115, 0.065, 0.003, 0, 0, s * 0.15, '#93a9c1');
  }
  { const m = along(0, 0.5); boxAB(st, [-0.14, m[1], m[2]], [0.14, m[1], m[2]], 0.07, 0.06, K.frame); }
  box(st, 0.3, 0.04, 0.1, 0, 1.0, 0.52, K.frame);
  box(st, 0.05, 0.035, 0.04, -0.2, 1.24, 0.42, K.frame);
  tube(st, [-0.13, GS.rF, GS.zF], [0.13, GS.rF, GS.zF], 0.014, '#6b6d74', 8);
  path(st, [[-0.43, 1.215, 0.37], [-0.26, 1.19, 0.42], [0.26, 1.19, 0.42], [0.43, 1.215, 0.37]], 0.013, '#1b1b1f', 8);
  arc(st, 0, GS.rF, GS.zF, GS.rF + 0.05, -0.55, 0.95, 9, 0.15, K.paint);
  // side stand (left), shown when parked
  tube(stand, [0.13, 0.36, -0.06], [0.32, 0.02, -0.14], 0.016, K.frame, 6); box(stand, 0.06, 0.012, 0.08, 0.32, 0.01, -0.14, K.frame);
  const H = GS.H;
  return (GEO.gs = { body: b.geometry(), matte: matte.geometry(), glow: glow.geometry(), glass: glass.geometry(), st: st.geometry().translate(-H.x, -H.y, -H.z), stGlow: stGlow.geometry().translate(-H.x, -H.y, -H.z), stand: stand.geometry(), decal: new THREE.PlaneGeometry(0.26, 0.049) });
}
let gsDecal = null;
export function gsDecalMat() {
  if (gsDecal) return gsDecal;
  const c = makeCanvas(256, 48), x = c.getContext('2d'); x.font = 'italic 700 34px "Chakra Petch", sans-serif'; x.fillStyle = '#9a9ca6'; x.textBaseline = 'middle'; x.fillText('R 1300 GS', 8, 26);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return (gsDecal = new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false }));
}

export default {
  id: 'gs', kind: 'bike', name: 'BMW R 1300 GS', short: 'R 1300 GS', tag: 'GS',
  hp: 160,
  spec: GS, geos: gsGeos, wheel: gsWheelGeo, decal: gsDecalMat, decalAt: [0.152, 0.81, -0.44],
  engine: { rev: 1 },
  traffic: { weight: 1, speed: [14, 18] },
};
