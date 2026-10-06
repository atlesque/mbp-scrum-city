import { Kit } from './kit.js';

// Belpairegebouw in ZIN, Brussels North Quarter (51N4E, l'AUC, Jaspers-Eyers, 2024). Checked against photos (see
// /mnt/project-files/realistic-landmarks/references.md): the 1970s World Trade Center towers I and II keep their
// near-black glass skins, and a new, slightly taller volume of 14 double-height floors fills the gap between them.
// That middle block is the bright one: a silver grid of slim white fins with a bold white band at every double
// floor, crowned by a red-lined rooftop pergola on white posts. In front, a green glass pavilion in a lattice of
// green mullions stands on the square over an open, glazed plinth. Footprint fits one 32 x 32 m city block;
// Simon Bolivarlaan is at -z, and WTC I is on the left as seen from it.
const DARK = '#1f262e', DARK_GLASS = '#33414d', SPANDREL = '#141a20', WHITE = '#eef0ee', SILVER = '#b8c0c4', MID_GLASS = '#56656e', RED = '#c8322f', GREEN = '#4fae73';
const PLINTH = 6, DH = 6.8, TOP = PLINTH + 14 * DH, WTC = TOP - 4.5; // 101 m, the old towers 96.5 m

export function buildBelpaire() {
  const k = new Kit(1973);
  const W1 = [7, 16, -6, 10], W2 = [-16, -7, -2, 14], M = [-7, 7, -9, 12];
  // the open plinth under all three: recessed glass between posts
  for (const R of [W1, W2, M]) {
    k.box('glass', R[0] + 1.2, R[1] - 1.2, 0, PLINTH, R[2] + 1.2, R[3] - 1.2, '#7d93a3');
    for (const side of ['front', 'back', 'left', 'right']) {
      const F = k.face(R, side);
      for (let t = 0.4; t < F.len; t += (F.len - 0.8) / Math.round(F.len / 4)) k.strip('trim', F, t, 0.6, 0, PLINTH, 0.6, side === 'front' && R !== M ? DARK : WHITE, -0.6);
    }
  }
  // the old WTC towers: near-black curtain walls, a dark spandrel at every floor and fine mullions
  for (const R of [W1, W2]) {
    k.box('dark', R[0], R[1], PLINTH, WTC, R[2], R[3], DARK);
    k.box('dark', R[0] - 0.2, R[1] + 0.2, WTC, WTC + 1.2, R[2] - 0.2, R[3] + 0.2, SPANDREL);
    k.box('trim', R[0] + 0.1, R[1] - 0.1, WTC + 1.2, WTC + 1.5, R[2] + 0.1, R[3] - 0.1, RED); // red lining of the roof edge
    for (const side of ['front', 'back', 'left', 'right']) {
      const F = k.face(R, side);
      for (let y = PLINTH; y < WTC - 0.1; y += DH / 2) {
        k.pane('glass', F, 0.1, F.len - 0.1, y + 1.1, y + DH / 2 - 0.1, 0.03, DARK_GLASS);
        for (let t = 0.2; t < F.len - 2.3; t += 2.4) if (k.rand() < 0.12) k.pane('lit', F, t, t + 2.2, y + 1.15, y + DH / 2 - 0.15, 0.05, DARK_GLASS);
      }
      for (let t = 0; t <= F.len + 0.01; t += 1.2) k.strip('dark', F, t, 0.08, PLINTH, WTC, 0.12, '#0f1418');
    }
  }
  // the new middle block: glass behind a silver fin grid, a bold white band every double floor
  k.box('glass', M[0], M[1], PLINTH, TOP, M[2], M[3], MID_GLASS);
  for (const side of ['front', 'back', 'left', 'right']) {
    const F = k.face(M, side);
    for (let f = 0; f <= 14; f++) {
      const y = PLINTH + f * DH;
      k.strip('trim', F, F.len / 2, F.len + 0.6, y - 0.45, y + 0.45, 0.7, WHITE);
      if (f < 14) {
        k.strip('trim', F, F.len / 2, F.len, y + DH / 2 - 0.1, y + DH / 2 + 0.1, 0.35, SILVER); // the mezzanine
        for (let t = 0.2; t < F.len - 1.7; t += 1.8) if (k.rand() < 0.25) k.pane('lit', F, t, t + 1.6, y + 0.6, y + DH - 0.6, 0.05, '#8a9ba6');
      }
    }
    for (let t = 0; t <= F.len + 0.01; t += 0.9) k.strip('trim', F, t, 0.12, PLINTH, TOP, 0.5, SILVER); // the fins
  }
  // the rooftop pergola: white posts carrying a red-lined frame over the roof garden
  const P = [M[0] - 0.4, M[1] + 0.4, M[2] - 0.4, M[3] + 0.4], py = TOP + 6;
  k.box('green', M[0] + 0.6, M[1] - 0.6, TOP, TOP + 0.6, M[2] + 0.6, M[3] - 0.6, '#5d9150');
  k.box('trim', M[0] + 2, M[1] - 2, TOP, TOP + 4, M[2] + 3, M[3] - 6, RED); // the red rooftop pavilion
  for (const x of [P[0], P[1]]) for (let z = P[2]; z <= P[3] + 0.01; z += (P[3] - P[2]) / 5) k.box('trim', x - 0.15, x + 0.15, TOP, py, z - 0.15, z + 0.15, WHITE);
  for (const [x0, x1, z0, z1] of [[P[0], P[1], P[2] - 0.2, P[2] + 0.2], [P[0], P[1], P[3] - 0.2, P[3] + 0.2], [P[0] - 0.2, P[0] + 0.2, P[2], P[3]], [P[1] - 0.2, P[1] + 0.2, P[2], P[3]]])
    k.box('trim', x0, x1, py, py + 0.6, z0, z1, RED);
  k.box('trim', P[0], P[1], py - 0.05, py + 0.05, P[2], P[3], RED); // the frame's red underside
  for (let z = P[2] + 1.5; z < P[3]; z += 1.5) k.box('trim', P[0], P[1], py + 0.1, py + 0.3, z - 0.3, z + 0.3, '#d9554c'); // the red-faced pergola slats

  // the green glass pavilion on the square, in front of WTC II
  const G = [-13, 1, -16, -9], gh = 9;
  k.box('glass', G[0] + 0.3, G[1] - 0.3, 1.2, gh - 0.4, G[2] + 0.3, G[3] - 0.3, '#7fcf9c');
  k.box('trim', G[0], G[1], gh - 0.4, gh, G[2], G[3], GREEN);
  for (const side of ['front', 'left', 'right', 'back']) {
    const F = k.face(G, side);
    for (let t = 0; t <= F.len + 0.01; t += 1.4) k.strip('trim', F, t, 0.12, 1.2, gh - 0.4, 0.15, GREEN);
    for (let y = 1.2; y < gh; y += 1.5) k.strip('trim', F, F.len / 2, F.len, y - 0.06, y + 0.06, 0.15, GREEN);
    for (const t of [0.6, F.len / 2, F.len - 0.6]) k.stroke('trim', F, t, 0.75, 1.3, 0.25, 1.1, 0.1, GREEN, 0.25); // slanted legs
  }
  return k;
}
