import { Kit } from './kit.js';

// Belpairegebouw in ZIN, Brussels North Quarter (51N4E, l'AUC, Jaspers-Eyers, 2024): the 1970s World Trade
// Center towers I and II kept to their structure and re-clad. Each tower now reads as 14 double-height floors
// behind a light double facade of slim white mullions, with dark photovoltaic panels in the parapets.
// A new terraced, planted building between them steps down to the street, over an open two-storey plinth
// with a glasshouse on the square. Footprint fits one 32 x 32 m city block; Simon Bolivarlaan is at -z.
const WHITE = '#eef0ee', MULLION = '#dfe3e2', PV = '#2b3446', GLASS = '#9db6c9', PLANT = '#5d9150', WOOD = '#c8a982';
const PLINTH = 7, DH = 6.6, FLOORS = 14, TOWER_TOP = PLINTH + FLOORS * DH; // 99.4 m

export function buildBelpaire() {
  const k = new Kit(1973);
  // the open plinth: two storeys of glass behind white columns
  const P = [-16, 16, -12, 12];
  k.box('glass', P[0] + 0.6, P[1] - 0.6, 0, PLINTH - 0.6, P[2] + 0.6, P[3] - 0.6, GLASS);
  k.box('trim', P[0], P[1], PLINTH - 0.6, PLINTH, P[2], P[3], WHITE);
  for (const side of ['front', 'back', 'left', 'right']) {
    const F = k.face(P, side);
    for (let t = 1; t < F.len; t += 3.2) k.strip('trim', F, t, 0.5, 0, PLINTH - 0.6, 0.5, WHITE, -0.6);
  }
  // the two towers
  for (const R of [[-16, -5, -6, 8], [5, 16, -6, 8]]) {
    k.box('glass', R[0], R[1], PLINTH, TOWER_TOP, R[2], R[3], GLASS);
    for (const side of ['front', 'back', 'left', 'right']) {
      const F = k.face(R, side);
      for (let f = 0; f < FLOORS; f++) {
        const y = PLINTH + f * DH;
        k.strip('trim', F, F.len / 2, F.len + 0.5, y - 0.3, y + 0.3, 0.45, WHITE); // slab edge every double floor
        k.pane('dark', F, 0.25, F.len - 0.25, y + 0.3, y + 1.3, 0.05, PV); // photovoltaic parapet
        k.strip('trim', F, F.len / 2, F.len, y + 3.4, y + 3.55, 0.2, MULLION); // transom at the mezzanine
        // glass panes in each 1.5 m bay, some lit
        for (let t = 0.75; t < F.len - 0.5; t += 1.5) if (k.rand() < 0.3) k.pane('lit', F, t - 0.65, t + 0.65, y + 1.4, y + DH - 0.35, 0.04, GLASS);
      }
      for (let t = 0; t <= F.len + 0.01; t += 1.5) k.strip('trim', F, t, 0.18, PLINTH, TOWER_TOP, 0.35, MULLION); // full-height mullions
    }
    k.box('trim', R[0] - 0.3, R[1] + 0.3, TOWER_TOP, TOWER_TOP + 1.2, R[2] - 0.3, R[3] + 0.3, WHITE);
    k.box('green', R[0] + 1, R[1] - 1, TOWER_TOP + 1.2, TOWER_TOP + 1.6, R[2] + 1, R[3] - 1, PLANT); // roof garden
    k.box('dark', R[0] + 3, R[1] - 3, TOWER_TOP + 1.2, TOWER_TOP + 4, R[2] + 5, R[3] - 2, '#8b929b');
  }
  // the new building between the towers: terraces stepping down towards the street, hung with planters and timber fins
  const steps = [[-10, -4, PLINTH + 2 * DH], [-4, 2, PLINTH + 4 * DH], [2, 10, PLINTH + 6 * DH]];
  for (const [z0, z1, top] of steps) {
    const R = [-5, 5, z0, z1];
    k.box('glass', R[0], R[1], PLINTH, top, R[2], R[3], '#a7bccb');
    k.box('trim', R[0] - 0.2, R[1] + 0.2, top, top + 0.5, R[2] - 0.2, R[3] + 0.2, WHITE);
    k.box('green', R[0] + 0.3, R[1] - 0.3, top + 0.5, top + 1.3, R[2] + 0.3, R[2] + 1.5, PLANT); // terrace planter
    for (let f = 0; f * DH < top - PLINTH - 0.1; f++) for (const side of z1 === 10 ? ['front', 'back'] : ['front']) {
      const y = PLINTH + f * DH, F = k.face(R, side);
      k.strip('trim', F, F.len / 2, F.len, y - 0.25, y + 0.25, 0.6, WHITE);
      k.strip('green', F, F.len / 2, F.len - 0.4, y + 0.25, y + 0.85, 0.7, PLANT); // trailing planters
      for (let t = 0.5; t < F.len; t += 1) k.strip('trim', F, t, 0.12, y + 0.25, y + DH - 0.25, 0.5, WOOD); // timber fins
      if (k.rand() < 0.5) k.pane('lit', F, 1, F.len - 1, y + 1, y + DH - 0.5, 0.03, GLASS);
    }
  }
  // the glasshouse docked onto the square
  const G = [-6, 6, -16, -12];
  k.box('glass', G[0], G[1], 0, 4.4, G[2], G[3], '#cfeee4');
  k.hexa('glass', [[G[0], 4.4, G[2]], [G[1], 4.4, G[2]], [G[1], 4.4, G[3]], [G[0], 4.4, G[3]], [G[0], 6.2, -14.5], [G[1], 6.2, -14.5], [G[1], 6.2, -13.5], [G[0], 6.2, -13.5]], '#cfeee4');
  for (let x = G[0]; x <= G[1] + 0.01; x += 2) k.box('trim', x - 0.08, x + 0.08, 0, 4.5, G[2] - 0.05, G[2] + 0.1, WHITE);
  k.box('green', -5, 5, 0, 1.2, -15.4, -12.6, PLANT);
  return k;
}
