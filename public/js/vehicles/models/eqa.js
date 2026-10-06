import { Car, along, archWell, both, carMeshes, circle, edgeZ, flank, front, makeWarp, rear, rrect, runs, side, sideOutline, sills, strip } from './carkit.js';

// ================= MERCEDES-BENZ EQA 250 =================
// The electric GLA (H243) in Mountain Grey, AMG Line: a tall bonnet and an upright black-panel grille with the star on
// a chrome bar, a light strip joining the headlamps, roof rails, a chrome window line and a light bar across the tailgate.
// Drawn in real metres with the car kit and scaled to the game's car footprint.
const PAINT = '#6f7276', SEAM = '#4a4c50', BLACK = '#111215', CLAD = '#2a2b2f', CHROME = '#c6cacf';
const HW = 0.917, ZF = 1.36, ZR = -1.37, WR = 0.355, S = 0.92;

function build() {
  const warp = makeWarp({
    hw: HW,
    plan: [[-2.24, 0.93], [-1.9, 0.98], [-1.4, 1], [1.2, 1], [1.8, 0.98], [2.24, 0.9]],
    tumble: [[0.2, 0.98], [0.6, 1], [1.0, 0.99], [1.1, 0.95], [1.6, 0.8]],
    crown: [[0.9, 0], [1.0, 0.03], [1.6, 0.05]],
    nose: [1.85, 2.24, 0.2], tail: [-1.95, -2.24, 0.12],
  });
  const car = new Car(warp), arches = [{ z: ZR, y: 0.375, r: 0.43 }, { z: ZF, y: 0.375, r: 0.43 }];
  // body: an upright nose, a long bonnet, a beltline rising to the tailgate
  const top = runs(
    [[2.17, 0.25], [2.225, 0.36], [2.235, 0.55], [2.225, 0.76], [2.18, 0.89], [2.07, 0.95]],
    [[2.07, 0.95], [1.6, 1.02], [1.15, 1.07], [0.95, 1.09]],
    [[0.95, 1.09], [-0.6, 1.12], [-1.7, 1.16], [-2.05, 1.18], [-2.17, 1.13]],
    [[-2.17, 1.13], [-2.215, 0.97], [-2.235, 0.7], [-2.23, 0.44], [-2.2, 0.32], [-2.15, 0.25]],
  );
  const body = sideOutline(top, sills(-2.15, 2.17, 0.25, arches));
  car.add(side(body, -HW, HW, { r: 0.07, divs: 8 }), PAINT);
  // greenhouse: a steep windscreen, a long flat roof, an upright tailgate window under the spoiler
  const glass = sideOutline(runs(
    [[1.0, 1.05], [0.55, 1.27], [0.1, 1.47], [-0.25, 1.555], [-0.7, 1.585], [-1.1, 1.57], [-1.4, 1.545], [-1.62, 1.51]],
    [[-1.62, 1.51], [-1.9, 1.34], [-2.1, 1.17]], [[-2.1, 1.17], [-2.1, 1.05]]), [[-2.1, 1.05], [1.0, 1.05]]);
  const GW = 0.86;
  car.add(side(glass, -GW, GW, { r: 0.05, divs: 6 }), '#ffffff', { to: 'glass' });
  // body-coloured roof with the spoiler over the tailgate, and the roof rails
  const roof = along(glass, -1.64, -0.25);
  car.add(side(strip(roof.map(([z, y]) => [z, y - 0.02]), 0.07), -GW - 0.006, GW + 0.006, { r: 0.03, divs: 6 }), PAINT);
  car.add(side(strip([[-1.42, 1.565], [-1.64, 1.535], [-1.74, 1.48]], 0.05), -GW + 0.03, GW - 0.03, { r: 0.02, divs: 4 }), PAINT);
  const rail = along(glass, -1.42, -0.45).map(([z, y]) => [z, y + 0.035]);
  car.add(both(side(strip(rail, 0.035), GW - 0.13, GW - 0.07, { r: 0.012, seg: 1, divs: 1 })), CHROME);
  for (const z of [-0.5, -1.37]) { const y = rail.reduce((b, p) => Math.abs(p[0] - z) < Math.abs(b[0] - z) ? p : b)[1]; car.add(both(side(rrect(z, y - 0.035, 0.12, 0.06, 0.02), GW - 0.13, GW - 0.07, { r: 0.01, seg: 1, divs: 1 })), BLACK); }
  // pillars: body-coloured A pillars, black B pillars, a broad D pillar
  const aEdge = along(glass, -0.25, 1.0);
  car.add(both(flank(strip(aEdge.map(([z, y]) => [z - 0.035, y - 0.015]), 0.085), GW)), PAINT);
  car.add(both(flank(strip([[-0.3, 1.06], [-0.36, 1.58]], 0.1), GW)), BLACK);
  const qRoof = along(glass, -2.12, -1.25).map(([z, y]) => [z, y + 0.012]);
  car.add(both(side(runs([[-2.12, 1.06], [-1.68, 1.06]], [[-1.68, 1.06], [-1.54, 1.25], [-1.39, 1.43], [-1.25, 1.57]]).concat(qRoof), GW - 0.08, GW + 0.008, { r: 0.012, seg: 1, divs: 1 })), PAINT);
  // chrome window line, door seams, handles, mirrors
  const dloTop = along(glass, -1.25, -0.3).map(([z, y]) => [z, y - 0.045]);
  car.add(both(flank(strip(dloTop, 0.022), GW, 0.008)), CHROME);
  car.add(both(flank(strip([[1.0, 1.1], [-0.6, 1.13], [-1.66, 1.165]], 0.03), GW)), CHROME);
  for (const pts of [[[0.95, 0.36], [0.98, 0.7], [0.95, 1.03]], [[-0.32, 0.36], [-0.32, 1.05]], [[-0.98, 0.42], [-1.05, 0.72], [-1.12, 1.06]]]) car.add(both(flank(strip(pts, 0.012), HW, 0.006)), SEAM);
  for (const z of [0.12, -0.92]) car.add(both(flank(rrect(z, 0.98, 0.18, 0.035, 0.015), HW, 0.01)), CHROME);
  car.add(both(side(rrect(0.74, 1.19, 0.22, 0.14, 0.05), 0.82, 1.06, { r: 0.03, divs: 2 })), PAINT);
  car.add(both(side(rrect(0.8, 1.12, 0.09, 0.05, 0.02), 0.8, 0.88, { r: 0.01, seg: 1, divs: 1 })), BLACK);
  // a dark strip along the sills
  car.add(both(flank(strip([[ZR + 0.44, 0.31], [ZF - 0.44, 0.31]], 0.12), HW, 0.014)), CLAD);
  // nose: the black panel with the star on a chrome bar, headlamps joined by a light strip, AMG Line intakes
  const fz = y => edgeZ(body, y), rz = y => edgeZ(body, y, false);
  car.add(front(rrect(0, 0.665, 1.08, 0.25, 0.07), fz, 0.02), BLACK);
  car.add(front(strip([[-0.5, 0.67], [-0.1, 0.67]], 0.028), fz, 0.03), CHROME).add(front(strip([[0.1, 0.67], [0.5, 0.67]], 0.028), fz, 0.03), CHROME);
  const ring = circle(0, 0.67, 0.1, 20);
  car.add(front(strip(ring.concat([ring[0]]), 0.018), fz, 0.032), CHROME);
  for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * Math.PI * 2 / 3; car.add(front(strip([[0, 0.67], [Math.cos(a) * 0.095, 0.67 + Math.sin(a) * 0.095]], 0.02), fz, 0.034), CHROME); }
  car.add(front(strip([[-0.5, 0.8], [0.5, 0.8]], 0.014), fz, 0.022), '#dfeaff', { to: 'lamp' });
  for (const sx of [-1, 1]) {
    car.add(front([[sx * 0.48, 0.66], [sx * 0.8, 0.7], [sx * 0.78, 0.79], [sx * 0.48, 0.8]], fz, 0.022), '#1d222b');
    car.add(front(strip([[sx * 0.5, 0.785], [sx * 0.77, 0.77]], 0.022), fz, 0.03), '#eef4ff', { to: 'lamp' });
    car.add(front(rrect(sx * 0.66, 0.42, 0.3, 0.17, 0.05), fz, 0.02), BLACK);
  }
  car.add(front(rrect(0, 0.37, 0.72, 0.12, 0.04), fz, 0.02), BLACK);
  car.add(front(strip([[-0.5, 0.28], [0.5, 0.28]], 0.025), fz, 0.022), CHROME);
  car.add(front(rrect(0, 0.5, 0.52, 0.11, 0.01), fz, 0.026), '#eef0f2');
  // tail: the light bar joining the tail lamps, the star, a dark bumper with a chrome strip
  car.add(rear(strip([[-0.84, 1.03], [0.84, 1.03]], 0.022), rz, 0.022), '#ff2136', { to: 'lamp' });
  for (const sx of [-1, 1]) car.add(rear([[sx * 0.52, 0.99], [sx * 0.9, 0.98], [sx * 0.88, 1.07], [sx * 0.52, 1.065]], rz, 0.024), '#d81428', { to: 'lamp' });
  car.add(rear(strip(circle(0, 0.87, 0.06, 16).concat([[0.06, 0.87]]), 0.014), rz, 0.024), CHROME);
  car.add(rear(rrect(0, 0.38, 1.66, 0.22, 0.06), rz, 0.02), CLAD);
  car.add(rear(strip([[-0.6, 0.43], [0.6, 0.43]], 0.022), rz, 0.024), CHROME);
  car.add(rear(rrect(0, 0.57, 0.52, 0.11, 0.01), rz, 0.024), '#eef0f2');
  // wheel wells, and 18" two-tone multi-spoke wheels
  for (const a of arches) car.add(side(archWell(a, 0.25), -HW + 0.3, HW - 0.3, { r: 0.01, seg: 1, divs: 1 }), '#0c0c0f');
  for (const sx of [-1, 1]) for (const z of [ZF, ZR]) car.wheel(sx * 0.79, WR, z, { r: WR, width: 0.235, rim: 0.23, rimCol: '#a9adb3', dish: '#26282d', spokes: (spoke, rim) => {
    for (let i = 0; i < 5; i++) for (const d of [-0.16, 0.16]) spoke(i / 5 * Math.PI * 2 + d, 0.05, rim, 0.04);
  } });
  // cabin: dashboard with the wide screen, wheel, black seats
  car.box(1.6, 0.18, 0.4, 0, 1.0, 0.62, '#1c1a22').box(0.7, 0.16, 0.03, 0.15, 1.14, 0.46, '#0b0d12', -0.25);
  car.box(0.06, 0.34, 0.34, 0.4, 1.06, 0.34, '#141218', 0.5);
  for (const sx of [-1, 1]) car.box(0.5, 0.7, 0.16, sx * 0.4, 0.99, -0.5, '#2c2a30').box(0.5, 0.14, 0.5, sx * 0.4, 0.67, -0.3, '#2c2a30');
  car.box(1.34, 0.6, 0.16, 0, 0.97, -1.4, '#2c2a30');
  return car.build(S);
}

let geo = null;
export default {
  id: 'eqa', kind: 'car', name: 'Mercedes EQA 250', short: 'EQA', tag: 'Mercedes',
  hp: 145,
  mesh: () => carMeshes(geo || (geo = build()), [0.4 * S, -0.42, -0.38 * S]),
  build,
  // electric, a little softer than the Tesla
  handling: { accel: 9.5, boostAccel: 12, top: 30, boostTop: 38, coast: 0.9 },
  engine: { rev: 1.05, gears: [0, 48] },
  electric: true, // no engine note: a hum below 30 km/h, then only road noise (vehicles/engine.js)
  traffic: { weight: 0.3, speed: [9, 13] },
};
