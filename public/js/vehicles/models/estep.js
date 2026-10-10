import { GB, GEO, UNIT, addGeo, arc, box, boxAB, cylG, tube } from '../../render/geometry.js';

// ================= E-STEPS =================
// Stand-up electric kick scooters ("steps"): a low deck with the battery under it, a folding stem on small solid
// tyres, a hub motor in the front wheel, a headlight on the stem and a red tail light on the rear mudguard.
// Same space as the bikes: +z forward, +x is the step's left, ground at y 0. The stem turns about the rake axis
// through H; seat is where the rider stands (see kinds/step.js).
export const STEP = { rF: 0.115, rR: 0.115, zF: 0.47, zR: -0.45, H: new THREE.Vector3(0, 0.58, 0.385), rake: 0.16, seat: -0.07, seatY: 0.155, wb: 0.92 };

// two looks on one frame: a private commuter's matte black step and a bright shared rental one
const LOOKS = {
  estep: { paint: '#1b1c21', paint2: '#2a2c33', accent: '#d8262e', deck: '#141417', stem: '#25272d' },
  share: { paint: '#16b39a', paint2: '#e9f2ef', accent: '#0d6b5d', deck: '#1a1b1f', stem: '#e9f2ef' },
};
const K = { rubber: '#121214', hub: '#3a3c43', alu: '#9fa3aa', grip: '#0e0e10', frame: '#1c1d22' };

export function stepWheelGeo(front) {
  const key = front ? 'stepF' : 'stepR'; if (GEO[key]) return GEO[key];
  const g = new GB(), R = STEP.rF, tw = 0.055, rim = 0.07, tr = (R - rim) / 2;
  addGeo(g, new THREE.TorusGeometry(rim + tr, tr, 8, 28).toNonIndexed(), 0, 0, 0, 1, 1, (tw / 2) / tr, 0, Math.PI / 2, 0, K.rubber);
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; addGeo(g, UNIT, 0, Math.sin(a) * (R - 0.003), Math.cos(a) * (R - 0.003), tw * 0.7, 0.008, 0.012, Math.PI / 2 - a, 0, 0, '#0a0a0b'); }
  // the front wheel is the hub motor: a fat drum; the rear has a disc brake and five spokes
  if (front) addGeo(g, cylG(20), 0, 0, 0, rim * 2, tw * 1.05, rim * 2, 0, 0, Math.PI / 2, K.hub);
  else {
    addGeo(g, cylG(20), 0, 0, 0, 0.04, tw * 1.1, 0.04, 0, 0, Math.PI / 2, K.hub);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; addGeo(g, UNIT, 0, Math.sin(a) * rim * 0.55, Math.cos(a) * rim * 0.55, tw * 0.5, rim * 0.95, 0.014, a, 0, 0, K.alu); }
    addGeo(g, cylG(20), -0.04, 0, 0, 0.11, 0.004, 0.11, 0, 0, Math.PI / 2, K.alu);
  }
  return (GEO[key] = g.geometry());
}

export function stepGeos(look) {
  const key = 'step-' + look; if (GEO[key]) return GEO[key];
  const C = LOOKS[look], b = new GB(), matte = new GB(), glow = new GB(), st = new GB(), stGlow = new GB(), stand = new GB();
  // --- deck: the battery box, grip tape on top, a trim strip along each side ---
  boxAB(b, [0, 0.105, -0.36], [0, 0.105, 0.33], 0.16, 0.07, C.paint);
  box(b, 0.13, 0.03, 0.62, 0, 0.06, -0.01, C.paint2);
  box(matte, 0.145, 0.006, 0.6, 0, 0.143, -0.02, C.deck);
  for (const s of [-1, 1]) box(b, 0.004, 0.018, 0.6, s * 0.081, 0.115, -0.02, C.accent);
  // the neck: deck up to the steering head
  boxAB(b, [0, 0.12, 0.28], [0, 0.29, 0.415], 0.08, 0.06, C.paint);
  tube(b, [0, 0.27, 0.418], [0, 0.34, 0.407], 0.03, C.paint, 12);
  // --- rear: mudguard over the wheel with the tail light and the foot brake, the deck tapering into it ---
  boxAB(b, [0, 0.12, -0.36], [0, 0.13, -0.44], 0.1, 0.05, C.paint);
  arc(b, 0, STEP.rR, STEP.zR, STEP.rR + 0.025, -1.6, 1.0, 8, 0.08, C.paint);
  box(glow, 0.06, 0.018, 0.012, 0, 0.17, -0.565, '#ff1a2e');
  box(glow, 0.05, 0.012, 0.012, 0, 0.115, -0.33, '#ff3346'); // the brake light under the deck's tail
  for (const s of [-1, 1]) tube(b, [s * 0.035, 0.125, -0.38], [s * 0.035, STEP.rR, STEP.zR], 0.008, K.frame, 6);
  // kickstand (left), shown when parked
  tube(stand, [0.07, 0.07, -0.05], [0.16, 0.01, -0.13], 0.008, K.frame, 6);
  // --- steered: fork, stem, bars, grips, headlight, display ---
  // along the rake axis from the front axle (t = 0) to the bars (t = 1)
  const along = t => [0, STEP.rF + t * 0.92, STEP.zF - t * 0.15];
  for (const s of [-1, 1]) tube(st, [s * 0.04, STEP.rF, STEP.zF], [s * 0.035, ...along(0.22).slice(1)], 0.011, K.frame, 8);
  tube(st, along(0.2), along(0.32), 0.02, K.frame, 10);
  tube(st, along(0.3), along(0.95), 0.016, C.stem, 12);
  box(st, 0.05, 0.03, 0.04, ...along(0.42), C.accent); // the folding latch
  boxAB(st, along(0.93), along(1), 0.07, 0.05, C.paint); // bar clamp with the display
  tube(st, [-0.25, ...along(1).slice(1)], [0.25, ...along(1).slice(1)], 0.012, K.frame, 8);
  for (const s of [-1, 1]) {
    tube(st, [s * 0.18, ...along(1).slice(1)], [s * 0.27, ...along(1).slice(1)], 0.018, K.grip, 10);
    tube(st, [s * 0.15, along(1)[1] + 0.005, along(1)[2] + 0.015], [s * 0.21, along(1)[1] - 0.01, along(1)[2] + 0.07], 0.005, K.alu, 6); // brake / throttle lever
  }
  { const [, y, z] = along(1); box(stGlow, 0.045, 0.004, 0.03, 0, y + 0.032, z - 0.005, '#58d6ff'); }
  { const [, y, z] = along(0.78); box(st, 0.06, 0.045, 0.03, 0, y, z + 0.03, C.paint); box(stGlow, 0.05, 0.03, 0.006, 0, y, z + 0.047, '#f2f8ff'); }
  arc(st, 0, STEP.rF, STEP.zF, STEP.rF + 0.022, -0.5, 1.1, 6, 0.07, C.paint); // front mudguard
  if (look === 'share') { // a rental's QR plate on the stem
    const [, y, z] = along(0.6); box(st, 0.075, 0.1, 0.012, 0, y, z - 0.022, '#f4f4f2'); box(st, 0.045, 0.045, 0.004, 0, y + 0.01, z - 0.03, '#1b1c21');
  }
  const H = STEP.H;
  return (GEO[key] = { body: b.geometry(), matte: matte.geometry(), glow: glow.geometry(), st: st.geometry().translate(-H.x, -H.y, -H.z), stGlow: stGlow.geometry().translate(-H.x, -H.y, -H.z), stand: stand.geometry() });
}

export const estep = {
  id: 'estep', kind: 'step', name: 'E-step', short: 'E-step', tag: 'step',
  hp: 60,
  spec: STEP, geos: () => stepGeos('estep'), wheel: stepWheelGeo,
  engine: { rev: 1 },
  electric: true, // a hub motor: the soft hum, never an engine note (vehicles/engine.js)
  hopOff: true, // getting off at speed is a plain jump off, no bail-out roll or damage (game/player.js exitVehicle)
  traffic: { weight: 1, speed: [5.6, 6.9] }, // 20 to 25 km/h
};
export const sharestep = {
  ...estep, id: 'sharestep', name: 'Shared e-step', short: 'Shared step', geos: () => stepGeos('share'),
  traffic: { weight: 1, speed: [5.4, 6.9] },
};
