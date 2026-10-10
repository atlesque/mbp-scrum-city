import { GB, GEO, UNIT, addGeo, arc, box, boxAB, cylG, tube } from '../../render/geometry.js';
import { STEP } from './estep.js';

// ================= THE PIMPED E-STEP =================
// One rider in town has done his e-step up: candy purple paint with gold trim, a wide chrome-skirted deck, magenta
// neon under it and up the stem, gold rims, twin headlights, a speaker on the neck, a rear wing on gold struts and
// pink tassels on the grips. Under all that it's still a step (kinds/step.js, the same frame as models/estep.js),
// but the motor has been swapped for something that does 90 km/h. He rides it in traffic (the 'stepking' NPC type,
// game/population.js); take it off him and it's yours.
const C = { paint: '#5a16a8', paint2: '#7a2fd0', gold: '#e8b83a', chrome: '#dde1e8', deck: '#141417', neon: '#ff2bd6', frame: '#1c1d22', rubber: '#101012', grip: '#f2c94c', tassel: '#ff6fd0' };

// the wheels: the same size as a plain step's, on gold five-spoke rims with a chrome lip and a fatter tyre
export function pimpWheelGeo(front) {
  const key = front ? 'pimpF' : 'pimpR'; if (GEO[key]) return GEO[key];
  const g = new GB(), R = STEP.rF, tw = 0.07, rim = 0.075, tr = (R - rim) / 2;
  addGeo(g, new THREE.TorusGeometry(rim + tr, tr, 8, 28).toNonIndexed(), 0, 0, 0, 1, 1, (tw / 2) / tr, 0, Math.PI / 2, 0, C.rubber);
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; addGeo(g, UNIT, 0, Math.sin(a) * (R - 0.003), Math.cos(a) * (R - 0.003), tw * 0.7, 0.008, 0.012, Math.PI / 2 - a, 0, 0, '#0a0a0b'); }
  addGeo(g, new THREE.TorusGeometry(rim - 0.004, 0.006, 6, 24).toNonIndexed(), 0, 0, 0, 1, 1, 1.6, 0, Math.PI / 2, 0, C.chrome);
  addGeo(g, cylG(20), 0, 0, 0, 0.05, tw * 1.1, 0.05, 0, 0, Math.PI / 2, C.gold);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; addGeo(g, UNIT, 0, Math.sin(a) * rim * 0.55, Math.cos(a) * rim * 0.55, tw * 0.55, rim * 0.95, 0.018, a, 0, 0, C.gold); }
  return (GEO[key] = g.geometry());
}

export function pimpGeos() {
  if (GEO.pimpstep) return GEO.pimpstep;
  const b = new GB(), matte = new GB(), glow = new GB(), st = new GB(), stGlow = new GB(), stand = new GB();
  // --- deck: wider than a plain step's, purple battery box, chrome side skirts with a gold pinstripe, gold-flecked grip ---
  boxAB(b, [0, 0.1, -0.36], [0, 0.1, 0.33], 0.22, 0.08, C.paint);
  box(b, 0.18, 0.03, 0.62, 0, 0.055, -0.01, C.paint2);
  box(matte, 0.2, 0.006, 0.6, 0, 0.143, -0.02, C.deck);
  for (const z of [-0.24, -0.08, 0.08, 0.22]) box(matte, 0.2, 0.007, 0.012, 0, 0.144, z, C.gold);
  for (const s of [-1, 1]) {
    box(b, 0.008, 0.05, 0.64, s * 0.114, 0.1, -0.02, C.chrome);
    box(b, 0.01, 0.008, 0.62, s * 0.116, 0.112, -0.02, C.gold);
    // the neon: a tube under each edge of the deck and one across the front and back, lighting the road under it
    box(glow, 0.012, 0.012, 0.6, s * 0.1, 0.042, -0.02, C.neon);
  }
  box(glow, 0.18, 0.012, 0.012, 0, 0.042, 0.28, C.neon); box(glow, 0.18, 0.012, 0.012, 0, 0.042, -0.32, C.neon);
  // the neck up to the steering head, with a little speaker on the front of it
  boxAB(b, [0, 0.12, 0.28], [0, 0.29, 0.415], 0.1, 0.07, C.paint);
  tube(b, [0, 0.27, 0.418], [0, 0.34, 0.407], 0.032, C.chrome, 12);
  box(b, 0.12, 0.1, 0.06, 0, 0.2, 0.33, C.frame);
  addGeo(b, cylG(16), 0, 0.2, 0.362, 0.075, 0.008, 0.075, Math.PI / 2, 0, 0, '#2a2a30');
  addGeo(b, cylG(16), 0, 0.2, 0.366, 0.03, 0.006, 0.03, Math.PI / 2, 0, 0, C.chrome);
  // --- rear: mudguard, tail lights, twin chrome pipes for show, and the wing on two gold struts ---
  boxAB(b, [0, 0.12, -0.36], [0, 0.13, -0.44], 0.14, 0.05, C.paint);
  arc(b, 0, STEP.rR, STEP.zR, STEP.rR + 0.028, -1.6, 1.0, 8, 0.1, C.paint);
  for (const s of [-1, 1]) box(glow, 0.035, 0.018, 0.012, s * 0.03, 0.17, -0.565, '#ff1a2e');
  box(glow, 0.08, 0.012, 0.012, 0, 0.115, -0.33, '#ff3346');
  for (const s of [-1, 1]) {
    tube(b, [s * 0.045, 0.125, -0.38], [s * 0.045, STEP.rR, STEP.zR], 0.009, C.frame, 6);
    tube(b, [s * 0.09, 0.07, -0.3], [s * 0.09, 0.09, -0.5], 0.014, C.chrome, 10);
    tube(b, [s * 0.05, 0.14, -0.42], [s * 0.07, 0.36, -0.5], 0.008, C.gold, 6);
  }
  boxAB(b, [0, 0.37, -0.44], [0, 0.36, -0.56], 0.3, 0.016, C.paint);
  for (const s of [-1, 1]) box(b, 0.01, 0.07, 0.13, s * 0.155, 0.36, -0.5, C.gold);
  box(glow, 0.26, 0.006, 0.006, 0, 0.352, -0.565, C.neon);
  // kickstand (left), shown when parked: gold, of course
  tube(stand, [0.09, 0.07, -0.05], [0.18, 0.01, -0.13], 0.009, C.gold, 6);
  // --- steered: chrome fork and stem with neon up its front, gold bars, twin headlights, the display, tassels ---
  const along = t => [0, STEP.rF + t * 0.92, STEP.zF - t * 0.15];
  for (const s of [-1, 1]) tube(st, [s * 0.045, STEP.rF, STEP.zF], [s * 0.038, ...along(0.22).slice(1)], 0.012, C.chrome, 8);
  tube(st, along(0.2), along(0.32), 0.022, C.chrome, 10);
  tube(st, along(0.3), along(0.95), 0.018, C.chrome, 12);
  { const [, y0, z0] = along(0.34), [, y1, z1] = along(0.9); boxAB(stGlow, [0, y0, z0 + 0.02], [0, y1, z1 + 0.02], 0.01, 0.006, C.neon); }
  box(st, 0.055, 0.03, 0.045, ...along(0.42), C.gold);
  boxAB(st, along(0.93), along(1), 0.08, 0.055, C.paint);
  tube(st, [-0.27, ...along(1).slice(1)], [0.27, ...along(1).slice(1)], 0.013, C.gold, 8);
  for (const s of [-1, 1]) {
    tube(st, [s * 0.19, ...along(1).slice(1)], [s * 0.29, ...along(1).slice(1)], 0.02, C.grip, 10);
    tube(st, [s * 0.15, along(1)[1] + 0.005, along(1)[2] + 0.015], [s * 0.21, along(1)[1] - 0.01, along(1)[2] + 0.07], 0.005, C.chrome, 6);
    for (const d of [-0.012, 0, 0.012]) box(st, 0.006, 0.09, 0.006, s * 0.295 + d, along(1)[1] - 0.06, along(1)[2] + d, C.tassel);
  }
  { const [, y, z] = along(1); box(stGlow, 0.05, 0.004, 0.032, 0, y + 0.034, z - 0.005, '#c45bff'); }
  { const [, y, z] = along(0.78); box(st, 0.13, 0.05, 0.035, 0, y, z + 0.03, C.chrome); for (const s of [-1, 1]) box(stGlow, 0.045, 0.034, 0.006, s * 0.034, y, z + 0.05, '#f2f8ff'); }
  arc(st, 0, STEP.rF, STEP.zF, STEP.rF + 0.024, -0.5, 1.1, 6, 0.09, C.paint);
  const H = STEP.H;
  return (GEO.pimpstep = { body: b.geometry(), matte: matte.geometry(), glow: glow.geometry(), st: st.geometry().translate(-H.x, -H.y, -H.z), stGlow: stGlow.geometry().translate(-H.x, -H.y, -H.z), stand: stand.geometry() });
}

export const pimpstep = {
  id: 'pimpstep', kind: 'step', name: 'Pimped e-step', short: 'Pimped step', tag: 'pimped step',
  hp: 90,
  spec: STEP, geos: pimpGeos, wheel: pimpWheelGeo,
  // 90 km/h flat out; sport mode gets there quicker. Steering calms down at speed so it can be ridden up there.
  handling: { top: 25.6, boostTop: 25.6, accel: 6, boostAccel: 8.5, brake: 14, turnHigh: 0.6, maxSteer: 0.55 },
  engine: { rev: 1.5 },
  electric: true,
  // only ever spawned with its rider (game/population.js), who cruises at 40 to 55 km/h and looks further ahead to do it
  traffic: { weight: 0, speed: [11, 15] },
  trafficAi: { look: 14, decel: 16, accel: 5, patience: 1.2, hornAfter: Infinity },
};
