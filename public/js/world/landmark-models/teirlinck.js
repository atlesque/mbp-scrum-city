import { Kit, hiddenBy } from './kit.js';

// Herman Teirlinckgebouw, Tour & Taxis, Brussels (Neutelings Riedijk, 2017). Belgium's largest passive office:
// a six-storey brick block whose wings meander around four glass-roofed winter gardens, with one 60 m tower in
// the second line for the skyline. Limited glazing: tall windows in pale concrete frames (with Henri Jacobs'
// reliefs) set in a tight 7.2 m / 4 rhythm, a deep colonnade along Havenlaan and a covered public street inside.
// Footprint fits one 32 x 32 m city block; Havenlaan is at -z.
const BRICK = '#c7ae86', ROOF = '#8f8e88', CONCRETE = '#e9e1cf', GARDEN = '#bfe1df', GLASS = '#7f93a3';
const FH = 3.5, GROUND = 5, TOP = GROUND + 5 * FH; // 22.5 m

export function buildTeirlinck() {
  const k = new Kit(2017);
  const wings = [[-16, 16, -16, -8], [8, 16, -8, 0], [-16, 16, 0, 8], [-16, -6, 8, 16]];
  const tower = [0, 16, 8, 16], towerTop = TOP + 10 * FH;
  const vols = [...wings.map(R => [...R, TOP]), [...tower, towerTop]];
  for (const R of wings) {
    k.box('wall', R[0], R[1], GROUND, TOP, R[2], R[3], BRICK);
    k.box('trim', R[0] - 0.5, R[1] + 0.5, TOP, TOP + 1.1, R[2] - 0.5, R[3] + 0.5, CONCRETE); // deep cornice
    k.box('dark', R[0], R[1], TOP + 1.1, TOP + 1.4, R[2], R[3], ROOF);
  }
  // the ground floor: set back behind a colonnade on the street front, brick elsewhere
  const W1 = wings[0];
  k.box('glass', W1[0] + 0.2, W1[1] - 0.2, 0, GROUND, W1[2] + 3, W1[3], GLASS);
  for (const R of wings.slice(1)) k.box('wall', R[0], R[1], 0, GROUND, R[2], R[3], BRICK);
  k.box('trim', W1[0], W1[1], GROUND - 0.6, GROUND, W1[2], W1[2] + 3, CONCRETE); // colonnade ceiling
  for (let x = W1[0] + 0.4; x <= W1[1] - 0.3; x += 3.6) k.box('trim', x - 0.45, x + 0.45, 0, GROUND - 0.6, W1[2], W1[2] + 0.9, CONCRETE);
  // the portal into the covered street: two storeys tall in the middle of the front
  k.box('dark', -4, 4, 0, GROUND + FH * 2, W1[2] - 0.02, W1[2] + 1.5, '#2c3240');
  k.box('trim', -5, -4, 0, GROUND + FH * 2 + 0.6, W1[2] - 0.3, W1[2] + 0.8, CONCRETE);
  k.box('trim', 4, 5, 0, GROUND + FH * 2 + 0.6, W1[2] - 0.3, W1[2] + 0.8, CONCRETE);
  k.box('trim', -5, 5, GROUND + FH * 2, GROUND + FH * 2 + 0.6, W1[2] - 0.3, W1[2] + 0.8, CONCRETE);
  // the tower in the second line
  k.box('wall', tower[0], tower[1], 0, towerTop, tower[2], tower[3], BRICK);
  k.box('trim', tower[0] - 0.5, tower[1] + 0.5, towerTop, towerTop + 1.1, tower[2] - 0.5, tower[3] + 0.5, CONCRETE);
  k.box('dark', 4, 12, towerTop + 1.1, towerTop + 3, 10, 14, '#6b6e74');
  // winter gardens: the courts between the wings, roofed in glass
  k.box('glass', -15.9, 8, GROUND, GROUND + 0.3, -8, 0, '#c6d9cf');
  k.box('green', -15, 7, GROUND + 0.3, GROUND + 1.2, -7, -1, '#5f8f55');
  k.box('glass', -16, -15.9, GROUND, TOP, -8, 0, GARDEN); // glass end wall
  k.hexa('glass', [[-16, TOP, -8], [8, TOP, -8], [8, TOP, 0], [-16, TOP, 0], [-16, TOP + 1.8, -6], [8, TOP + 1.8, -6], [8, TOP + 1.8, -2], [-16, TOP + 1.8, -2]], GARDEN);
  k.box('glass', -6, 0, TOP - 0.3, TOP, 8, 16, GARDEN);
  k.box('glass', -6, 0, 0, TOP - 0.3, 15.9, 16, GARDEN);

  // windows: a tall concrete-framed window in every 1.8 m cell (7.2 m module / 4), one per floor
  const frame = (R, faces, y0, floors, hidden) => {
    const cells = k.grid(R, { faces, y0, floors, fh: FH, bay: 1.8, margin: 0.9, win: [0.95, 2.45, 0.5], out: 0.16, hidden, litOdds: 0.3, glass: GLASS });
    for (const c of cells) k.pane('trim', c.F, c.t - 0.7, c.t + 0.7, c.y + 0.2, c.y + 3.15, 0.1, CONCRETE);
    for (const side of faces) { // a slim concrete band at every floor
      const F = k.face(R, side);
      for (let f = 0; f <= floors; f++) if (!hiddenBy(hidden, F, F.len / 2, y0 + f * FH + 0.1)) k.strip('trim', F, F.len / 2, F.len, y0 + f * FH - 0.12, y0 + f * FH + 0.12, 0.12, CONCRETE);
    }
  };
  for (const [i, R] of wings.entries()) frame(R, ['front', 'back', 'left', 'right'], GROUND, 5, vols.filter((_, j) => j !== i));
  frame(tower, ['front', 'back', 'left', 'right'], TOP, 10, []);
  frame(tower, ['back', 'right'], GROUND, 5, []);
  frame([wings[1][0], wings[1][1], wings[1][2], wings[1][3]], ['right'], 0.2, 1, []);
  return k;
}
