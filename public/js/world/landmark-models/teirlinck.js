import { Kit, hiddenBy } from './kit.js';

// Herman Teirlinckgebouw, Tour & Taxis, Brussels (Neutelings Riedijk, 2017). Checked against photos (see
// /mnt/project-files/realistic-landmarks/references.md): a six-storey block of golden, basket-weave brick whose
// wings wrap glass-roofed winter gardens, with a squat 60 m tower in the second line. The windows are wide and
// low, each in a deep pale concrete frame with a louvred sunshade in its top, one per bay per floor. The ground
// floor steps back under the brick at the entrance, where a big dark X-shaped column carries the corner; the
// winter gardens show as tall blue glass walls between the wings. Footprint fits one 32 x 32 m city block;
// Havenlaan is at -z, and the tower stands at the back on the right as seen from it.
const BRICK = '#dcc08a', ROOF = '#8f8e88', CONCRETE = '#e6e1d6', LOUVRE = '#c9c6bf', GARDEN = '#4f7fa6', GLASS = '#5f7486', STEEL = '#2d2d31';
const FH = 3.6, GROUND = 4.5, TOP = GROUND + 5 * FH; // 22.5 m
// the rooftop door's place on the front (x, at z = -16; world/landmarks.js): the last ground-floor bay on the right,
// which gets no shop window
export const ROOF_DOOR_X = 13.56;

export function buildTeirlinck() {
  const k = new Kit(2017);
  const front = [-16, 16, -16, -6], side = [6, 16, -6, 16], back = [0, 6, 8, 16], tower = [-16, 0, 0, 16];
  const towerTop = GROUND + 15 * FH; // 58.5 m
  const wings = [front, side, back];
  const vols = [...wings.map(R => [...R, TOP]), [...tower, towerTop]];
  const E = [-8, 9], F0 = k.face(front, 'front');
  for (const R of wings) {
    k.box('wall', R[0], R[1], R === front ? GROUND - 0.25 : 0, TOP + 0.9, R[2], R[3], BRICK);
    k.box('dark', R[0] + 0.3, R[1] - 0.3, TOP + 0.9, TOP + 1.0, R[2] + 0.3, R[3] - 0.3, ROOF);
  }
  k.box('wall', tower[0], tower[1], 0, towerTop + 0.9, tower[2], tower[3], BRICK);
  k.box('dark', -11, -5, towerTop + 0.9, towerTop + 2.6, 6, 12, '#77736c');

  // the entrance: the ground floor steps back 3 m under the brick, and a dark steel X carries the corner
  for (const [x0, x1, z0] of [[front[0], E[0], front[2]], [E[1], front[1], front[2]], [E[0], E[1], front[2] + 3]]) k.box('wall', x0, x1, 0, GROUND - 0.25, z0, front[3], BRICK);
  k.pane('glass', F0, E[0] + 16 + 0.3, E[1] + 16 - 0.3, 0, GROUND - 0.3, -2.95, GLASS);
  const xt = E[1] + 16 - 2.6, ang = Math.atan2(GROUND, 4.4), len = Math.hypot(GROUND, 4.4) - 0.9;
  for (const a of [ang, -ang]) k.stroke('dark', F0, xt, (GROUND - 0.25) / 2, len, 0.55, a, -0.8, STEEL, 0.5);
  // the winter gardens: glass-roofed courts, closed to the street by tall blue glass walls
  k.box('glass', -15.9, 6, TOP - 0.2, TOP, -6, 0, '#a9c4cf');
  k.hexa('glass', [[-16, TOP, -6], [6, TOP, -6], [6, TOP, 0], [-16, TOP, 0], [-16, TOP + 1.6, -4.5], [6, TOP + 1.6, -4.5], [6, TOP + 1.6, -1.5], [-16, TOP + 1.6, -1.5]], '#a9c4cf');
  k.box('green', -15, 5, 0, 1.5, -5, -1, '#5f8f55');
  gardenWall(k, k.face([-16, 6, -6, 0], 'left'));
  k.box('glass', 0, 6, TOP - 0.2, TOP, 0, 8, '#a9c4cf'); // the second court's roof, behind

  // windows: one wide, low window per 3.6 m bay, in a concrete frame with a louvre across its top
  const frame = (R, faces, y0, floors, hidden, opts = {}) => {
    for (const s of faces) {
      const F = k.face(R, s), n = Math.max(1, Math.floor((F.len - 1) / 3.6)), bw = (F.len - 1) / n;
      for (let f = 0; f < floors; f++) for (let c = 0; c < n; c++) {
        const t = 0.5 + bw * (c + 0.5), y = y0 + f * FH;
        if (hiddenBy(hidden, F, t, y + FH / 2) || (opts.skip && opts.skip(s, t, f))) continue;
        const tall = opts.tall && f >= floors - 2, w = 1.35;
        if (tall) { // the top floors of the tower: a frame two storeys tall, filled with vertical louvres
          if (f !== floors - 2) continue;
          k.pane('trim', F, t - 1.5, t + 1.5, y + 0.5, y + 2 * FH - 0.3, 0.12, CONCRETE);
          k.pane('dark', F, t - 1.25, t + 1.25, y + 0.7, y + 2 * FH - 0.5, 0.16, '#55595f');
          for (let i = -2; i <= 2; i++) k.strip('trim', F, t + i * 0.5, 0.1, y + 0.7, y + 2 * FH - 0.5, 0.25, LOUVRE);
          continue;
        }
        k.pane('trim', F, t - w - 0.22, t + w + 0.22, y + 0.85, y + 3.2, 0.12, CONCRETE);
        k.pane(k.rand() < 0.3 ? 'lit' : 'glass', F, t - w, t + w, y + 1.0, y + 2.45, 0.16, GLASS);
        k.pane('trim', F, t - w, t + w, y + 2.5, y + 3.05, 0.17, LOUVRE);
      }
    }
  };
  const others = R => vols.filter(V => V[0] !== R[0] || V[2] !== R[2]);
  const gardens = [[-16.5, 6, -6, 0, TOP + 2], [0, 6.5, 0, 8, TOP]];
  for (const R of wings) frame(R, ['front', 'back', 'left', 'right'], GROUND, 5, [...others(R), ...gardens]);
  frame(tower, ['front', 'back', 'left', 'right'], TOP, 10, [], { tall: true });
  frame(tower, ['back', 'left'], GROUND, 5, []);
  // shop windows on the ground floor away from the entrance
  frame(front, ['front', 'left', 'right'], 0.3, 1, [], { skip: (s, t) => s === 'front' && ((t > E[0] + 16 - 1 && t < E[1] + 16 + 1) || Math.abs(t - 16 - ROOF_DOOR_X) < 1.2) });
  frame(side, ['right', 'back'], 0.3, 1, []);
  for (const R of wings) k.solid(R, TOP + 1);
  k.solid(tower, towerTop + 0.9); k.solid([-16, 6, -6, 0], TOP + 1.6); k.solid([0, 6, 0, 8], TOP); // the winter gardens
  return k;
}

// a tall winter-garden wall: blue glass in a grid of slim mullions, up to the roofline
function gardenWall(k, F) {
  k.pane('glass', F, 0.1, F.len - 0.1, 0, TOP - 0.1, 0.05, GARDEN);
  for (let t = 0.1; t <= F.len; t += 1.8) k.strip('trim', F, t, 0.12, 0, TOP, 0.2, '#c9ced2');
  for (let y = GROUND; y < TOP; y += FH) k.strip('trim', F, F.len / 2, F.len, y - 0.06, y + 0.06, 0.2, '#c9ced2');
}
