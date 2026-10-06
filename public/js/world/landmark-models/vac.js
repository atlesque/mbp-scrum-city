import { Kit, hiddenBy } from './kit.js';

// Virginie Lovelinggebouw, VAC Gent (POLO architects, 2014), Koningin Maria Hendrikaplein beside Gent-Sint-Pieters.
// A 22-storey, 90 m tower of dark brown brick in two staggered slabs along the railway, and a lower brick arm
// along Koningin Fabiolalaan with the public rooms. Office windows sit in a steady grid; big two-storey bay windows,
// one at each landing that joins two office floors, stick out of the brick at random. An elevated city courtyard
// over the bike and transfer hub is reached by a broad ramp from the station square.
// Footprint fits one 32 x 32 m city block; the street (station square) is at -z.
const BRICK = '#5a4540', BRICK_DARK = '#4a3935', MORTAR_BAND = '#6b5650', FRAME = '#2e2a2b', DECK = '#b9b2a8', GLASS = '#8ea3b5';

export function buildVac() {
  const k = new Kit(9040);
  // the low public arm along Koningin Fabiolalaan (left), four storeys with a glazed ground floor
  const arm = [-16, -6, -16, 16], armTop = 14.6;
  k.box('wall', arm[0], arm[1], 0, armTop, arm[2], arm[3], BRICK);
  k.box('trim', arm[0] - 0.2, arm[1] + 0.2, armTop, armTop + 0.5, arm[2] - 0.2, arm[3] + 0.2, BRICK_DARK);
  for (const side of ['front', 'left', 'right', 'back']) {
    const F = k.face(arm, side);
    k.pane('glass', F, 0.8, F.len - 0.8, 0.3, 4.0, 0.03, GLASS); // the glazed plinth
    k.strip('trim', F, F.len / 2, F.len - 0.4, 4.2, 4.6, 0.15, MORTAR_BAND);
  }
  // the elevated city courtyard and the ramp up from the square
  const deck = [-6, 16, -10, -2.5], deckTop = 5.2;
  k.box('dark', deck[0] + 0.6, deck[1] - 0.6, 0, deckTop - 0.6, deck[2] + 1.6, deck[3], '#2b2a30'); // the bike hub under it
  k.box('trim', deck[0], deck[1], deckTop - 0.6, deckTop, deck[2], deck[3], DECK);
  for (let x = -4; x <= 15; x += 4.5) k.box('trim', x - 0.3, x + 0.3, 0, deckTop - 0.6, deck[2] + 0.3, deck[2] + 0.9, DECK);
  k.box('trim', deck[0], deck[1], deckTop, deckTop + 1.1, deck[2], deck[2] + 0.25, BRICK_DARK); // parapet
  const ramp = [3, 12, -16, -10];
  k.hexa('trim', [[ramp[0], 0, ramp[2]], [ramp[1], 0, ramp[2]], [ramp[1], 0.05, ramp[3]], [ramp[0], 0.05, ramp[3]],
    [ramp[0], 0.25, ramp[2]], [ramp[1], 0.25, ramp[2]], [ramp[1], deckTop, ramp[3]], [ramp[0], deckTop, ramp[3]]], DECK);
  for (const x of [ramp[0] - 0.3, ramp[1]]) k.hexa('wall', [[x, 0, ramp[2]], [x + 0.3, 0, ramp[2]], [x + 0.3, 0, ramp[3]], [x, 0, ramp[3]],
    [x, 1.1, ramp[2]], [x + 0.3, 1.1, ramp[2]], [x + 0.3, deckTop + 1.1, ramp[3]], [x, deckTop + 1.1, ramp[3]]], BRICK_DARK);

  // the tower: two staggered brick slabs, the front one 22 storeys, the back one 18
  const A = [-6, 5, -2.5, 11], B = [5, 16, 1, 16], FH = 3.2, base = 5.2;
  const topA = base + 21 * FH, topB = base + 17 * FH;
  const vols = [[...A, topA], [...B, topB], [...arm, armTop]];
  for (const [R, top, floors] of [[A, topA, 21], [B, topB, 17]]) {
    k.box('wall', R[0], R[1], 0, top, R[2], R[3], BRICK);
    k.box('trim', R[0] - 0.15, R[1] + 0.15, top, top + 1.2, R[2] - 0.15, R[3] + 0.15, BRICK_DARK); // brick parapet
    k.box('dark', (R[0] + R[1]) / 2 - 2.5, (R[0] + R[1]) / 2 + 2.5, top + 1.2, top + 3.6, R[2] + 2, R[3] - 2, '#55575e'); // plant room
    k.box('glass', R[0] + 0.1, R[1] - 0.1, 0.3, base - 0.4, R[2] - 0.05, R[3] + 0.05, GLASS); // glazed lobby floor
    const others = vols.filter(V => V[0] !== R[0] || V[2] !== R[2]);
    towerFacade(k, R, base, floors, FH, others);
  }
  // upper floors of the low arm get the same grid and an occasional bay
  towerFacade(k, arm, 4.8, 3, 3.27, [[...A, topA], [...B, topB]], 0.25);
  return k;
}

// the steady office grid, with big two-storey bay windows (2 x 2 cells) pushed out of the brick here and there
function towerFacade(k, R, y0, floors, fh, hidden, bayOdds = 0.55) {
  const BAY = 2.7, used = new Set();
  for (const side of ['front', 'back', 'left', 'right']) {
    const F = k.face(R, side), cells = Math.floor((F.len - 1.2) / BAY), start = (F.len - cells * BAY) / 2;
    // landings every two floors: pick the cells that become a bay window
    for (let f = 0; f + 1 < floors; f += 2) {
      if (k.rand() > bayOdds) continue;
      const c = Math.floor(k.rand() * (cells - 1)), t0 = start + c * BAY, t1 = t0 + 2 * BAY, y = y0 + f * fh;
      if (hiddenBy(hidden, F, (t0 + t1) / 2, y + fh)) continue;
      for (const [cc, ff] of [[c, f], [c + 1, f], [c, f + 1], [c + 1, f + 1]]) used.add(`${side}:${cc}:${ff}`);
      k.strip('trim', F, (t0 + t1) / 2, t1 - t0 - 0.3, y + 0.35, y + 2 * fh - 0.25, 0.7, FRAME); // the bay's dark metal box
      k.pane(k.rand() < 0.4 ? 'lit' : 'glass', F, t0 + 0.4, t1 - 0.4, y + 0.55, y + 2 * fh - 0.45, 0.72, '#a9bccd');
    }
    for (let f = 0; f < floors; f++) for (let c = 0; c < cells; c++) {
      if (used.has(`${side}:${c}:${f}`)) continue;
      const t = start + (c + 0.5) * BAY, y = y0 + f * fh;
      if (hiddenBy(hidden, F, t, y + fh / 2)) continue;
      const lit = k.rand() < 0.3;
      k.pane(lit ? 'lit' : 'glass', F, t - 0.75, t + 0.75, y + 0.7, y + 2.75, 0.03, GLASS);
    }
  }
}
