import { Car, along, archWell, both, carMeshes, edgeZ, flank, front, makeWarp, rear, rrect, runs, side, sideOutline, sills, strip } from './carkit.js';

// ================= BMW 530e =================
// The plug-in hybrid 5 Series saloon (G60) in a champagne grey (Bernina Grey Amber effect), M Sport: a long bonnet, the kidney grille with its lit
// contour ("Iconic Glow"), slim headlamps, the Hofmeister kink in a chrome window line, slim tail lamps and a black
// diffuser. Drawn in real metres with the car kit and scaled to the game's car footprint.
const PAINT = '#7e796d', SEAM = '#545045', BLACK = '#0c0d10', CHROME = '#c9cdd3';
const HW = 0.95, ZF = 1.67, ZR = -1.325, WR = 0.352, S = 0.92;

function build() {
  const warp = makeWarp({
    hw: HW,
    plan: [[-2.53, 0.92], [-2.2, 0.98], [-1.6, 1], [1.4, 1], [2.1, 0.975], [2.53, 0.88]],
    tumble: [[0.17, 0.985], [0.55, 1], [0.92, 0.99], [1.0, 0.95], [1.5, 0.78]],
    crown: [[0.8, 0], [0.92, 0.035], [1.5, 0.06]],
    nose: [2.0, 2.53, 0.22], tail: [-2.15, -2.53, 0.14],
  });
  const car = new Car(warp), arches = [{ z: ZR, y: 0.36, r: 0.41 }, { z: ZF, y: 0.36, r: 0.41 }];
  // body: an upright nose, a long flat bonnet, a short boot with a lip
  const top = runs(
    [[2.47, 0.17], [2.52, 0.3], [2.535, 0.46], [2.52, 0.62], [2.46, 0.715], [2.36, 0.76]],
    [[2.36, 0.76], [1.9, 0.82], [1.3, 0.88], [0.85, 0.92]],
    [[0.85, 0.92], [-0.6, 0.95], [-1.6, 0.98], [-1.95, 1.0], [-2.3, 1.01], [-2.47, 0.995]],
    [[-2.47, 0.995], [-2.51, 0.92], [-2.53, 0.7], [-2.525, 0.45], [-2.49, 0.27], [-2.44, 0.17]],
  );
  const body = sideOutline(top, sills(-2.44, 2.47, 0.17, arches));
  car.add(side(body, -HW, HW, { r: 0.07, divs: 8 }), PAINT);
  // a long cabin with a fastback rear screen running down to the boot
  const glass = sideOutline(runs(
    [[0.92, 0.89], [0.5, 1.12], [0.05, 1.38], [-0.3, 1.49], [-0.65, 1.515], [-1.05, 1.49], [-1.4, 1.4], [-1.75, 1.22], [-2.02, 1.02]],
    [[-2.02, 1.02], [-2.02, 0.95]]), [[-2.02, 0.95], [0.92, 0.89]]);
  const GW = 0.89;
  car.add(side(glass, -GW, GW, { r: 0.05, divs: 6 }), '#ffffff', { to: 'glass' });
  const roof = along(glass, -1.4, -0.28);
  car.add(side(strip(roof.map(([z, y]) => [z, y - 0.02]), 0.07), -GW - 0.006, GW + 0.006, { r: 0.03, divs: 6 }), PAINT);
  // pillars: black B pillar, the C pillar with the Hofmeister kink
  const aEdge = along(glass, -0.28, 0.92);
  car.add(both(flank(strip(aEdge.map(([z, y]) => [z - 0.035, y - 0.015]), 0.085), GW)), PAINT);
  car.add(both(flank(strip([[-0.38, 0.95], [-0.44, 1.48]], 0.1), GW)), BLACK);
  const qRoof = along(glass, -2.03, -1.3).map(([z, y]) => [z, y + 0.012]);
  car.add(both(side(runs([[-2.03, 0.95], [-1.68, 0.95]], [[-1.68, 0.95], [-1.6, 1.04], [-1.5, 1.14], [-1.47, 1.22], [-1.38, 1.4]]).concat(qRoof), GW - 0.08, GW + 0.008, { r: 0.012, seg: 1, divs: 1 })), PAINT);
  // chrome window surround, door seams, handles, mirrors
  const dlo = runs(along(glass, -1.38, 0.88).map(([z, y]) => [z - 0.02, y - 0.045]), [[-1.4, 1.37], [-1.47, 1.22], [-1.55, 1.1], [-1.65, 0.99]]);
  car.add(both(flank(strip(dlo, 0.022), GW, 0.008)), CHROME);
  car.add(both(flank(strip([[0.9, 0.935], [-0.6, 0.965], [-1.66, 0.995]], 0.025), GW)), CHROME);
  for (const pts of [[[0.86, 0.34], [0.9, 0.66], [0.87, 0.9]], [[-0.4, 0.26], [-0.4, 0.9]], [[-1.0, 0.42], [-1.08, 0.7], [-1.22, 0.9]]]) car.add(both(flank(strip(pts, 0.012), HW, 0.006)), SEAM);
  for (const z of [0.1, -1.0]) car.add(both(flank(rrect(z, 0.85, 0.2, 0.035, 0.015), HW, 0.01)), CHROME);
  car.add(both(side(rrect(0.66, 1.0, 0.22, 0.13, 0.05), 0.85, 1.08, { r: 0.03, divs: 2 })), PAINT);
  car.add(both(side(rrect(0.72, 0.94, 0.09, 0.05, 0.02), 0.83, 0.91, { r: 0.01, seg: 1, divs: 1 })), BLACK);
  car.add(both(flank(strip([[ZR + 0.42, 0.24], [ZF - 0.42, 0.24]], 0.07), HW, 0.012)), BLACK);
  // nose: the kidneys with a lit contour and vertical slats, slim headlamps, M Sport intakes
  const fz = y => edgeZ(body, y), rz = y => edgeZ(body, y, false);
  for (const sx of [-1, 1]) {
    car.add(front(rrect(sx * 0.18, 0.56, 0.33, 0.31, 0.09), fz, 0.02), '#f2f6ff', { to: 'lamp' });
    car.add(front(rrect(sx * 0.18, 0.56, 0.3, 0.28, 0.08), fz, 0.03), BLACK);
    for (let i = 0; i < 6; i++) car.add(front(strip([[sx * (0.06 + i * 0.048), 0.44], [sx * (0.06 + i * 0.048), 0.68]], 0.012), fz, 0.036), '#5d6168');
    car.add(front([[sx * 0.36, 0.64], [sx * 0.86, 0.67], [sx * 0.84, 0.72], [sx * 0.38, 0.705]], fz, 0.022), '#1c2029');
    car.add(front(strip([[sx * 0.42, 0.69], [sx * 0.8, 0.705]], 0.02), fz, 0.03), '#eef4ff', { to: 'lamp' });
    car.add(front(strip([[sx * 0.79, 0.65], [sx * 0.8, 0.71]], 0.02), fz, 0.03), '#eef4ff', { to: 'lamp' });
    car.add(front([[sx * 0.56, 0.24], [sx * 0.86, 0.26], [sx * 0.86, 0.52], [sx * 0.74, 0.52]], fz, 0.02), BLACK);
  }
  car.add(front(rrect(0, 0.28, 0.86, 0.12, 0.04), fz, 0.02), BLACK);
  car.add(front(rrect(0, 0.38, 0.52, 0.11, 0.01), fz, 0.026), '#eef0f2');
  // tail: slim lamps wrapping into the boot lid, a black diffuser with reflectors
  for (const sx of [-1, 1]) {
    car.add(rear([[sx * 0.4, 0.86], [sx * 0.93, 0.85], [sx * 0.92, 0.93], [sx * 0.42, 0.915]], rz, 0.022), '#3a0d12');
    car.add(rear(strip([[sx * 0.44, 0.895], [sx * 0.9, 0.89]], 0.02), rz, 0.03), '#ff2234', { to: 'lamp' });
    car.add(rear(strip([[sx * 0.88, 0.86], [sx * 0.9, 0.92]], 0.02), rz, 0.03), '#ff2234', { to: 'lamp' });
    car.add(rear(rrect(sx * 0.76, 0.36, 0.05, 0.14, 0.02), rz, 0.026), '#a01020');
  }
  car.add(rear(rrect(0, 0.3, 1.5, 0.2, 0.06), rz, 0.02), BLACK);
  car.add(rear(rrect(0, 0.74, 0.52, 0.11, 0.01), rz, 0.024), '#eef0f2');
  // wheel wells, and 19" double-spoke wheels
  for (const a of arches) car.add(side(archWell(a, 0.17), -HW + 0.3, HW - 0.3, { r: 0.01, seg: 1, divs: 1 }), '#0c0c0f');
  for (const sx of [-1, 1]) for (const z of [ZF, ZR]) car.wheel(sx * 0.81, WR, z, { r: WR, width: 0.245, rim: 0.24, rimCol: '#8b9097', dish: '#1d1f23', spokes: (spoke, rim) => {
    for (let i = 0; i < 5; i++) for (const d of [-0.13, 0.13]) spoke(i / 5 * Math.PI * 2 + d, 0.05, rim, 0.045);
  } });
  // cabin: dashboard with the curved screen, wheel, black leather
  car.box(1.6, 0.16, 0.42, 0, 0.9, 0.5, '#1c1a22').box(0.75, 0.14, 0.03, 0.2, 1.03, 0.34, '#0b0d12', -0.25);
  car.box(0.06, 0.34, 0.34, 0.42, 0.97, 0.24, '#141218', 0.5);
  for (const sx of [-1, 1]) car.box(0.5, 0.66, 0.16, sx * 0.42, 0.9, -0.55, '#26242a').box(0.5, 0.14, 0.5, sx * 0.42, 0.6, -0.35, '#26242a');
  car.box(1.4, 0.56, 0.16, 0, 0.88, -1.42, '#26242a');
  return car.build(S);
}

let geo = null;
export default {
  id: 'bmw5', kind: 'car', name: 'BMW 530e', short: '530e', tag: 'BMW',
  hp: 155,
  mesh: () => carMeshes(geo || (geo = build()), [0.42 * S, -0.46, -0.42 * S - 0.1], { fit: 0.85, knees: -1.4 }),
  build,
  // a plug-in hybrid: quick, with a proper gearbox under the electric shove
  handling: { accel: 10, boostAccel: 13, top: 33, boostTop: 44 },
  engine: { rev: 0.7, gears: [0, 10, 18, 26, 34, 43, 52] },
  traffic: { weight: 0.3, speed: [10, 14] },
};
