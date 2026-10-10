import { Car, along, archWell, both, carMeshes, edgeZ, flank, front, makeWarp, rear, rrect, runs, side, sideOutline, sills, strip } from './carkit.js';

// ================= TESLA MODEL Y (2025, blue) =================
// The detailed Model Y: the 2025 refresh ("Juniper") in Marine Blue, drawn in real metres with the car kit and scaled to the
// game's car footprint. Light bars across the nose and the tailgate, a black glass roof, flush handles, aero wheels.
const PAINT = '#244a9c', SEAM = '#173371', BLACK = '#121317', TRIM = '#1b1c21';
const L = 4.79, HW = 0.96, ZF = 1.47, ZR = -1.42, WR = 0.355, S = 0.92;

function build() {
  const warp = makeWarp({
    hw: HW,
    plan: [[-2.4, 0.9], [-2.0, 0.97], [-1.4, 1], [1.2, 1], [1.9, 0.97], [2.4, 0.86]],
    tumble: [[0.2, 0.985], [0.55, 1], [0.95, 0.995], [1.06, 0.95], [1.62, 0.78]],
    crown: [[0.9, 0], [1.0, 0.035], [1.62, 0.06]],
    nose: [1.8, 2.4, 0.24], tail: [-1.9, -2.4, 0.16],
  });
  const car = new Car(warp), arches = [{ z: ZR, y: 0.37, r: 0.42 }, { z: ZF, y: 0.37, r: 0.42 }];
  // body: a short rounded nose, a bonnet rising to the windscreen, a high tail with a lip spoiler
  const top = runs(
    [[2.33, 0.19], [2.385, 0.32], [2.4, 0.5], [2.385, 0.66], [2.33, 0.77], [2.22, 0.83]],
    [[2.22, 0.83], [1.9, 0.9], [1.55, 0.97], [1.28, 1.01]],
    [[1.28, 1.01], [0.3, 1.04], [-0.8, 1.08], [-1.6, 1.13], [-2.05, 1.17], [-2.24, 1.18], [-2.33, 1.14]],
    [[-2.33, 1.14], [-2.37, 0.98], [-2.39, 0.72], [-2.39, 0.48], [-2.36, 0.3], [-2.31, 0.19]],
  );
  const body = sideOutline(top, sills(-2.31, 2.33, 0.19, arches));
  car.add(side(body, -HW, HW, { r: 0.07, divs: 8 }), PAINT);
  // greenhouse: one sweep of glass from the windscreen over the roof to the lip spoiler
  const glass = sideOutline(runs(
    [[1.33, 0.97], [0.95, 1.17], [0.5, 1.39], [0.0, 1.56], [-0.45, 1.62], [-0.95, 1.61], [-1.4, 1.52], [-1.8, 1.37], [-2.22, 1.175]],
    [[-2.22, 1.175], [-2.22, 1.02]]), [[-2.22, 1.02], [1.33, 0.97]]);
  const GW = 0.9;
  car.add(side(glass, -GW, GW, { r: 0.05, divs: 6 }), '#ffffff', { to: 'glass' });
  // black glass roof and the window frames
  const roof = along(glass, -1.55, -0.05);
  car.add(side(strip(roof.map(([z, y]) => [z, y - 0.025]), 0.07), -GW - 0.006, GW + 0.006, { r: 0.03, divs: 6 }), BLACK);
  const aEdge = along(glass, -0.05, 1.33);
  car.add(both(flank(strip(aEdge.map(([z, y]) => [z - 0.03, y - 0.015]), 0.08), GW)), BLACK);
  car.add(both(flank(strip([[-0.25, 1.02], [-0.36, 1.6]], 0.1), GW)), BLACK);
  // body-coloured rear quarter behind the back windows, up to the hatch glass
  const qRoof = along(glass, -2.24, -1.45).map(([z, y]) => [z, y + 0.012]);
  car.add(both(side(runs([[-2.24, 1.04], [-1.95, 1.04]], [[-1.95, 1.04], [-1.8, 1.21], [-1.62, 1.39], [-1.45, 1.54]]).concat(qRoof), GW - 0.07, GW + 0.008, { r: 0.012, divs: 1 })), PAINT);
  car.add(both(flank(strip([[1.3, 1.03], [0.3, 1.06], [-0.8, 1.1], [-1.6, 1.15], [-1.97, 1.19]], 0.04), GW)), BLACK);
  // door seams, flush handles and the mirrors
  for (const pts of [[[1.22, 0.36], [1.25, 0.7], [1.2, 0.96]], [[-0.3, 0.26], [-0.3, 0.97]], [[-1.0, 0.42], [-1.06, 0.72], [-1.16, 0.98]]]) car.add(both(flank(strip(pts, 0.012), HW, 0.006)), SEAM);
  for (const z of [0.35, -0.75]) car.add(both(flank(rrect(z, 0.92, 0.2, 0.035, 0.015), HW, 0.008)), TRIM);
  car.add(both(side(rrect(1.08, 1.1, 0.22, 0.13, 0.05), 0.86, 1.1, { r: 0.03, divs: 2 })), PAINT);
  car.add(both(side(rrect(1.14, 1.03, 0.09, 0.05, 0.02), 0.84, 0.92, { r: 0.01, divs: 1 })), TRIM);
  // nose: the light bar along the bonnet edge, slim headlamps low in the corners, a black intake
  const fz = y => edgeZ(body, y), rz = y => edgeZ(body, y, false);
  car.add(front(strip([[-0.9, 0.795], [0, 0.785], [0.9, 0.795]], 0.03), fz, 0.02), '#e8f3ff', { to: 'lamp' });
  for (const sx of [-1, 1]) {
    car.add(front(rrect(sx * 0.63, 0.62, 0.36, 0.11, 0.04), fz, 0.018), TRIM);
    car.add(front(rrect(sx * 0.64, 0.62, 0.24, 0.03, 0.012), fz, 0.024), '#cfe0ff', { to: 'lamp' });
  }
  car.add(front(rrect(0, 0.33, 1.2, 0.18, 0.06), fz, 0.02), TRIM);
  car.add(front(rrect(0, 0.45, 0.52, 0.11, 0.01), fz, 0.024), '#eef0f2');
  // tail: the red bar across the tailgate with hooked ends, a black lower bumper, the plate
  car.add(rear(strip([[-0.82, 1.04], [0.82, 1.04]], 0.035), rz, 0.02), '#ff2134', { to: 'lamp' });
  for (const sx of [-1, 1]) car.add(rear(rrect(sx * 0.78, 1.01, 0.2, 0.1, 0.03), rz, 0.022), '#e01528', { to: 'lamp' });
  car.add(rear(rrect(0, 0.34, 1.72, 0.24, 0.06), rz, 0.02), TRIM);
  car.add(rear(rrect(0, 0.63, 0.52, 0.11, 0.01), rz, 0.024), '#eef0f2');
  // wheel wells, and 19" aero wheels with thin silver spokes
  for (const a of arches) car.add(side(archWell(a, 0.19), -HW + 0.3, HW - 0.3, { r: 0.01, seg: 1, divs: 1 }), '#0c0c0f');
  for (const sx of [-1, 1]) for (const z of [ZF, ZR]) car.wheel(sx * 0.82, WR, z, { r: WR, width: 0.25, rim: 0.24, rimCol: '#9da2aa', dish: '#3b3e45', spokes: (spoke, rim) => {
    for (let i = 0; i < 10; i++) spoke(i / 10 * Math.PI * 2, 0.06, rim, 0.035);
  } });
  // cabin seen through the glass: dashboard, the centre screen, wheel and white seats
  car.box(1.7, 0.16, 0.4, 0, 0.98, 0.8, '#1c1a22').box(0.38, 0.24, 0.03, 0, 1.15, 0.64, '#0b0d12', -0.3);
  car.box(0.06, 0.34, 0.34, 0.42, 1.04, 0.5, '#141218', 0.5);
  for (const sx of [-1, 1]) car.box(0.52, 0.7, 0.16, sx * 0.42, 0.98, -0.55, '#d9d3c9').box(0.52, 0.14, 0.5, sx * 0.42, 0.66, -0.35, '#d9d3c9');
  car.box(1.4, 0.6, 0.16, 0, 0.96, -1.45, '#d9d3c9');
  return car.build(S);
}

let geo = null;
export default {
  id: 'modelyblue', kind: 'car', name: 'Tesla Model Y', short: 'Model Y', tag: 'Tesla',
  hp: 150,
  mesh: () => carMeshes(geo || (geo = build()), [0.42 * S, -0.44, -0.4 * S], { fit: 0.88, knees: -1.2 }),
  build,
  handling: { accel: 11, boostAccel: 14, top: 32, boostTop: 42, coast: 0.9 },
  engine: { rev: 1.15, gears: [0, 52], voice: 'whine' },
  traffic: { weight: 0.3, speed: [10, 14] },
};
