// ================= WEAPON ICONS =================
// The white-on-black weapon pictures in the HUD's weapon box and on the weapon wheel, drawn on a 2D canvas around
// (0, 0) at about 240 × 112. Most are a few rectangles [x, y, w, h]; the ones that need curves list parts:
//   { d, fill }        a shape (SVG path), outlined in black then filled (white unless fill says otherwise)
//   { d, fill, inner } a shape drawn over the others without its own outline (a liquid level, a flame's core)
//   { ring: [x, y, r] } a white ring (a grenade's pull ring)
//   { line: d, w, c, clip } a stroke drawn last (dark unless c says otherwise), clipped to the path clip
// fit scales a tall icon down so it sits in the HUD box.
const INK = '#170c28';
const GRENADE_BODY = 'M-34 14 A34 42 0 1 0 34 14 A34 42 0 1 0 -34 14 Z';
const LEVER = 'M14 -38 L24 -38 Q42 -30 42 -6 L42 34 L32 34 L32 -4 Q32 -24 14 -26 Z';
const BOTTLE = 'M-8 -36 L8 -36 L8 -10 Q26 -2 26 16 L26 54 Q26 62 18 62 L-18 62 Q-26 62 -26 54 L-26 16 Q-26 -2 -8 -10 Z';
const RAG = 'M-12 -34 L12 -34 L12 -44 L-12 -44 Z M10 -40 Q22 -34 20 -18 L14 -20 Q16 -30 8 -36 Z';
const TORCH_CAN = 'M-102 -20 Q-108 -20 -108 -14 L-108 14 Q-108 20 -102 20 L2 20 Q14 20 14 8 L14 -8 Q14 -20 2 -20 Z';
export const ICONS = {
  pistol: [[-50, -18, 90, 20], [-46, 0, 26, 40], [30, -22, 10, 6]],
  smg: [[-70, -18, 120, 24], [-20, 4, 16, 44], [-64, 4, 22, 30], [48, -10, 20, 8]],
  shotgun: [[-100, -14, 180, 14], [-30, 0, 70, 12], [-104, -10, 50, 32], [-104, 6, 30, 24]],
  rifle: [[-90, -16, 170, 20], [-20, 4, 18, 40], [-96, -12, 40, 30], [80, -10, 22, 6], [20, -26, 40, 10]],
  minigun: [[-80, -26, 100, 46], [20, -20, 80, 8], [20, -6, 80, 8], [20, 8, 80, 8], [-60, 20, 20, 24]],
  rpg: [[-100, -14, 200, 24], [60, -20, 30, 36], [-20, 10, 14, 30], [-60, 10, 14, 24]],
  sniper: [[-108, -8, 60, 26], [-50, -6, 84, 12], [34, -4, 66, 6], [100, -6, 10, 10], [-40, -26, 66, 12], [-56, 6, 14, 26], [-12, 4, 12, 14]],
  fist: [[-28, -30, 52, 40], [-28, -38, 13, 12], [-15, -40, 13, 12], [-2, -40, 13, 12], [11, -38, 13, 12], [-40, -12, 16, 26], [-20, 10, 40, 30]],
  knuckles: [[-56, -16, 112, 30], [-50, -24, 22, 12], [-22, -24, 22, 12], [6, -24, 22, 12], [34, -24, 22, 12]],
  knife: [[-90, -8, 60, 18], [-30, -16, 8, 34], [-22, -8, 100, 14], [78, -6, 14, 8]],
  nightstick: [[-110, -9, 220, 18], [-60, 9, 12, 30]],
  golf: [[-110, -6, 50, 14], [-60, -4, 150, 9], [86, -6, 22, 30]],
  bat: [[-110, -6, 40, 13], [-70, -8, 60, 17], [-10, -12, 70, 24], [60, -15, 52, 30]],
  machete: [[-100, -8, 46, 18], [-54, -14, 8, 30], [-46, -10, 130, 22], [84, -6, 18, 16]],
  katana: [[-112, -7, 64, 15], [-48, -16, 8, 32], [-40, -5, 150, 11], [110, -3, 6, 7]],
  chainsaw: [[-100, -24, 70, 44], [-96, -36, 46, 12], [-30, -12, 140, 20], [-104, 20, 30, 10]],
  laser: [[-96, -16, 150, 24], [-20, 8, 16, 34], [-104, -10, 30, 28], [54, -12, 40, 16], [94, -8, 14, 8], [-50, -26, 50, 10]],
  // the repair tool, a gas blowtorch: the canister with its label band, the valve and knob, the bent neck and its nozzle
  repair: { fit: 0.86, dy: 16, parts: [{ d: TORCH_CAN }, [14, -9, 20, 18], [20, -18, 8, 9],
    { d: 'M34 -4 L72 -4 Q84 -4 90 -13 L98 -25 L105 -20 L97 -8 Q89 4 72 4 L34 4 Z' }, { d: 'M96 -23 L108 -40 L117 -34 L105 -17 Z' },
    { line: 'M-74 -20 V20 M-30 -20 V20 M-66 -6 H-40 M-66 4 H-50', w: 3, clip: TORCH_CAN }, { line: 'M99 -26 L112 -20', w: 3 }] },
  fireaxe: [[-110, -6, 160, 12], { d: 'M40 -26 L64 -26 L64 -14 Q84 -30 100 -36 Q110 -2 100 32 Q84 26 64 12 L64 20 L40 20 Z' }, { d: 'M40 -18 L22 -12 L40 -6 Z' }],
  grenade: { fit: 0.92, parts: [{ ring: [-28, -44, 13] }, { d: GRENADE_BODY }, [-14, -40, 28, 16], { d: LEVER },
    { line: 'M-16 -32 L-20 -40', w: 5, c: '#fff' }, { line: LEVER, w: 2.5 },
    { line: 'M-40 -4 H40 M-40 16 H40 M-40 36 H40 M-11 -40 V60 M11 -40 V60', w: 4, clip: GRENADE_BODY }] },
  molotov: { fit: 0.68, dy: 16, parts: [{ d: BOTTLE }, { d: 'M-26 22 Q0 18 26 22 L26 54 Q26 62 18 62 L-18 62 Q-26 62 -26 54 Z', fill: '#ffd9b0', inner: true },
    { d: RAG }, { d: 'M0 -46 C-16 -58 -10 -76 0 -94 C3 -80 16 -72 12 -58 C10 -50 6 -46 0 -46 Z', fill: '#ffb347' },
    { d: 'M1 -50 C-6 -58 -3 -68 1 -76 C3 -68 8 -62 6 -56 C5 -52 3 -50 1 -50 Z', fill: '#fff3c4', inner: true },
    { line: 'M-26 22 Q0 18 26 22', w: 3 }, { line: RAG, w: 2.5 }] },
};
const paths = {};
const path = d => paths[d] || (paths[d] = new Path2D(d));

// draw weapon id's icon on ctx x, centred on (cx, cy) at scale s (1 fills the HUD's 240 × 112 box)
export function drawIcon(x, id, cx, cy, s = 1) {
  const def = ICONS[id]; if (!def) return;
  const parts = Array.isArray(def) ? def : def.parts, k = s * (def.fit || 1);
  x.save(); x.translate(cx, cy + (def.dy || 0) * k); x.scale(k, k);
  x.lineJoin = 'round'; x.strokeStyle = '#000'; x.lineWidth = 6;
  for (const p of parts) {
    if (Array.isArray(p)) x.strokeRect(...p);
    else if (p.ring) { x.lineWidth = 11; x.beginPath(); x.arc(...p.ring, 0, Math.PI * 2); x.stroke(); x.lineWidth = 6; }
    else if (p.d && !p.inner) { x.lineWidth = 7; x.stroke(path(p.d)); x.lineWidth = 6; }
  }
  for (const p of parts) {
    if (Array.isArray(p)) { x.fillStyle = '#fff'; x.fillRect(...p); }
    else if (p.ring) { x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(...p.ring, 0, Math.PI * 2); x.stroke(); }
    else if (p.d) { x.fillStyle = p.fill || '#fff'; x.fill(path(p.d)); }
  }
  for (const p of parts) {
    if (!p.line) continue;
    x.save(); if (p.clip) x.clip(path(p.clip));
    x.strokeStyle = p.c || INK; x.lineWidth = p.w || 3; x.stroke(path(p.line)); x.restore();
  }
  x.restore();
}
