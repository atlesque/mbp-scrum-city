import { Kit, hiddenBy } from './kit.js';

// Virginie Lovelinggebouw, VAC Gent (POLO architects, 2014), Koningin Maria Hendrikaplein beside Gent-Sint-Pieters.
// Checked against photos (see /mnt/project-files/realistic-landmarks/references.md): a 90 m tower of pale grey
// brick in two staggered slabs that stand on columns over the bus station. The taller slab's end on the station
// square is one deep recess of eight full-height glass slits; the lower slab's end is blank brick with the Flemish
// lion. The long sides carry tight rows of wide windows, with only a few bronze-framed bay windows (one window
// wide, two floors tall) pushed out of the brick. A white-panelled link wing on columns carries the raised city
// courtyard. Footprint fits one 32 x 32 m city block; the station square is at -z.
const BRICK = '#cfcbc6', BRICK_DARK = '#a9a59f', BRONZE = '#3b342f', SLIT = '#2f3946', WHITE = '#ecebe6', GLASS = '#5d7286', LION = '#1d1d1f';
const FH = 3.4, BASE = 7.2;

export function buildVac() {
  const k = new Kit(9040);
  // the two slabs: B (22 floors) steps forward to the square, A (19 floors) sits back beside it, on its left as seen from the square
  const A = [4, 16, -9, 14], B = [-9, 4, -15, 11];
  const topA = BASE + 19 * FH, topB = BASE + 22 * FH;
  const vols = [[...A, topA], [...B, topB]];
  for (const [R, top] of [[A, topA], [B, topB]]) {
    k.box('wall', R[0], R[1], BASE, top + 1.4, R[2] + (R === B ? 0.9 : 0), R[3], BRICK); // B's front is recessed for the slits
    k.box('trim', R[0] + 0.3, R[1] - 0.3, BASE - 0.8, BASE, R[2] + 0.3, R[3] - 0.3, BRICK_DARK); // brick soffit over the columns
    k.box('glass', R[0] + 2.5, R[1] - 2.5, 0, BASE - 0.8, R[2] + 2.5, R[3] - 2.5, GLASS); // the lobby, set back under the slab
    for (const x of [R[0] + 1.2, R[1] - 1.2]) for (let z = R[2] + 1.2; z <= R[3] - 1.1; z += (R[3] - R[2] - 2.4) / 3)
      k.box('trim', x - 0.45, x + 0.45, 0, BASE - 0.8, z - 0.45, z + 0.45, WHITE);
  }
  k.box('dark', 7, 11, topA + 1.4, topA + 3, 0, 8, '#8d8a86'); // plant on the lower roof
  // B's end on the square: eight glass slits between deep brick piers, over a fully glazed floor
  const FB = k.face(B, 'front'), slitTop = topB - 2.2, slitBot = BASE + FH + 0.4;
  k.pane('dark', FB, 1.2, FB.len - 1.2, slitBot, slitTop, -0.87, SLIT);
  for (let i = 0; i < 8; i++) {
    const t = 1.2 + (FB.len - 2.4) * (i + 0.5) / 8;
    for (let f = 1; f < 22; f++) if (k.rand() < 0.22) k.pane('lit', FB, t - 0.4, t + 0.4, BASE + f * FH + 0.4, BASE + f * FH + 3, -0.84, '#7f97ad');
    if (i < 7) k.strip('wall', FB, 1.2 + (FB.len - 2.4) * (i + 1) / 8, 0.42, slitBot, slitTop, 0.9, BRICK, -0.9);
  }
  for (const t of [0.6, FB.len - 0.6]) k.strip('wall', FB, t, 1.2, BASE, topB + 1.4, 0.9, BRICK, -0.9);
  k.strip('wall', FB, FB.len / 2, FB.len, BASE, slitBot, 0.9, BRICK, -0.9);
  k.strip('wall', FB, FB.len / 2, FB.len, slitTop, topB + 1.4, 0.9, BRICK, -0.9);
  k.pane('glass', FB, 0.4, FB.len - 0.4, BASE + 0.2, BASE + FH, 0.04, GLASS); // the glazed band at the foot of the slits
  // A's end: blank brick with the lion, and a narrow strip of windows where it meets B
  const FA = k.face(A, 'front');
  lion(k, FA, FA.len / 2 + 0.5, topA - 15, 6);
  for (let f = 0; f < 19; f++) k.pane(k.rand() < 0.3 ? 'lit' : 'glass', FA, 0.4, 1.6, BASE + f * FH + 0.8, BASE + f * FH + 2.6, 0.03, GLASS);
  // the long sides and backs: tight rows of wide windows with a few bronze bays
  rows(k, A, ['right', 'back'], topA, 19, vols);
  rows(k, B, ['left', 'back', 'right'], topB, 22, vols);

  // the white link wing on columns on the right (as seen from the square), with ribbon windows, and the bus station under it
  const L = [-16, -9, -14, 15], ly0 = 5.2, ly1 = 13.4;
  k.box('trim', L[0], L[1], ly0, ly1, L[2], L[3], WHITE);
  k.box('dark', L[0] + 0.5, L[1] - 1, 0, ly0, L[2] + 1, L[3] - 1, '#3a3d44');
  for (const side of ['front', 'left']) {
    const F = k.face(L, side);
    k.pane('glass', F, 0.8, F.len - 0.8, ly0 + 1.1, ly0 + 3, 0.03, '#6f8aa0');
    for (let t = 1; t < F.len - 1; t += 3) k.pane(k.rand() < 0.4 ? 'lit' : 'glass', F, t, t + 2.8, ly0 + 4.4, ly0 + 7, 0.03, '#6f8aa0');
  }
  for (let z = L[2] + 1; z < L[3]; z += 6) k.box('trim', L[0] + 0.5, L[0] + 1.3, 0, ly0, z - 0.4, z + 0.4, WHITE);
  k.box('trim', L[0], L[1] - 0.3, ly1, ly1 + 1.1, L[2], L[2] + 0.2, '#b9c4c6'); // glass balustrade of the city courtyard
  return k;
}

// rows of wide windows, one per 2.7 m cell per floor, and here and there a bronze bay two floors tall
function rows(k, R, faces, top, floors, vols) {
  for (const side of faces) {
    const F = k.face(R, side), hide = vols.filter(V => V[0] !== R[0]), n = Math.floor((F.len - 1.4) / 2.7), cw = (F.len - 1.4) / n, bays = new Set();
    for (let b = 0; b < Math.max(2, Math.round(n * floors / 70)); b++) bays.add(`${Math.floor(k.rand() * n)}:${2 + Math.floor(k.rand() * (floors - 4))}`);
    for (let f = 0; f < floors; f++) for (let c = 0; c < n; c++) {
      const t = 0.7 + cw * (c + 0.5), y = BASE + f * FH;
      if (hiddenBy(hide, F, t, y + FH / 2)) continue;
      if (bays.has(`${c}:${f}`)) { // the bay window: a bronze box sticking out, glazed on its face
        k.strip('dark', F, t, cw - 0.3, y + 0.5, y + 2 * FH - 0.3, 0.6, BRONZE);
        k.pane(k.rand() < 0.4 ? 'lit' : 'glass', F, t - cw / 2 + 0.45, t + cw / 2 - 0.45, y + 0.75, y + 2 * FH - 0.55, 0.62, '#7d95aa');
        continue;
      }
      if (bays.has(`${c}:${f - 1}`)) continue;
      k.pane(k.rand() < 0.28 ? 'lit' : 'glass', F, t - cw / 2 + 0.25, t + cw / 2 - 0.25, y + 1.0, y + 2.6, 0.03, GLASS);
    }
  }
}

// the Flemish lion of the Vlaamse overheid logo, drawn with short dark strokes: three long sweeps of mane curling
// down to the left and the head looking right (`t` runs to the left as seen from outside the front face)
function lion(k, F, t, y, s) {
  const S = (x, yy, len, ang, th = 0.13) => k.stroke('dark', F, t - x * s, y + yy * s, len * s, th * s, -ang, 0.02, LION);
  for (const [x0, top] of [[-0.42, 0.55], [-0.2, 0.62], [0.02, 0.55]]) { // each sweep: steep at the top, curling out at the foot
    S(x0 + 0.05, top - 0.22, 0.48, 1.35); S(x0 - 0.01, top - 0.62, 0.42, 1.65); S(x0 - 0.1, top - 0.92, 0.3, 2.3);
  }
  S(0.3, 0.42, 0.34, -0.5, 0.11); S(0.42, 0.22, 0.24, -1.35, 0.11); S(0.34, 0.02, 0.26, 0.55, 0.11); // the head's brow, snout and jaw
  S(0.26, -0.22, 0.32, 1.2, 0.11); S(0.32, 0.3, 0.06, 0, 0.07); // the neck and the eye
}
