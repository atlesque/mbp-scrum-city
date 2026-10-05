import { seeded } from '../core/util.js';
import { CYL6, GB, addGeo, box, hexa, sphG } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { makeCanvas } from '../render/textures.js';
import { carMesh } from '../vehicles/models/sedan.js';
import { addCollider } from './collision.js';

// ================= MAP EDGES =================
// The city is walled in on three sides: a graffiti-covered concrete wall with a wood behind it, and a
// police roadblock wherever a street runs into it. The east side is the sea, roped off with buoys.
// The walls are solid (collision.js W keeps anything from slipping past their inner face).
export const FACE = 208; // inner face of the walls, |x| or |z|
const SEA = 258; // the north and south walls run this far east, into the water
const H = 3.6, SLAB = 1.2, T = 0.3; // wall height, slab width and thickness
const ART_LEN = 36; // metres of wall the graffiti texture covers before it repeats
const STREETS = [-150, -100, -50, 0, 50, 100, 150];
// Each edge maps (along, out) to the world: `out` is metres beyond the inner face. `u` is the graffiti's
// horizontal texture direction, so it reads left to right from inside the city.
const EDGES = [
  { at: (a, o) => [-FACE - o, a], alongX: false, from: -FACE - 1, to: FACE + 1, u: -1, mouths: STREETS },
  { at: (a, o) => [a, -FACE - o], alongX: true, from: -FACE - 1, to: SEA, u: 1, mouths: STREETS.concat([200]) },
  { at: (a, o) => [a, FACE + o], alongX: true, from: -FACE - 1, to: SEA, u: -1, mouths: STREETS.concat([200]) },
];
const MOUTH = 6.6; // half width of a roadblock
const cops = [];

export function buildEdges(plain) {
  const r = seeded(208), rr = (a, b) => a + r() * (b - a), rp = arr => arr[Math.floor(r() * arr.length)];
  const art = new GB(), woods = new GB();
  for (const E of EDGES) {
    const yaw = E.alongX ? Math.PI / 2 : 0; // facing along the edge
    // a box `len` along the edge, `dep` deep, its near face `o` beyond the inner face
    const slab = (gb, a, o, len, dep, h, y, col) => { const [x, z] = E.at(a, o + dep / 2); box(gb, E.alongX ? len : dep, h, E.alongX ? dep : len, x, y, z, col); };
    const inMouth = a => E.mouths.some(m => Math.abs(a - m) < MOUTH);
    // the wall: slabs with dark seams between them, a round cap along the top of each run
    let run = null, uOff = 0;
    const endRun = end => {
      if (run === null) return;
      const [x, z] = E.at((run + end) / 2, T / 2);
      addGeo(plain, CYL6, x, H, z, 0.42, end - run, 0.42, E.alongX ? 0 : Math.PI / 2, 0, E.alongX ? Math.PI / 2 : 0, '#d9d4cc');
      run = null;
    };
    for (let a = E.from; a < E.to; a += SLAB) {
      const mid = a + SLAB / 2;
      if (inMouth(mid)) { endRun(a); continue; }
      if (run === null) { run = a; uOff = r(); } // each run starts somewhere else in the graffiti
      const shade = rp(['#d6d0c8', '#cfc9c1', '#dcd7cf', '#c9c3bb']);
      slab(plain, mid, 0, SLAB - 0.05, T, H, H / 2, shade);
      slab(plain, mid, T, SLAB - 0.05, 1.1, 0.3, 0.15, shade); // the L-shaped foot on the far side
      // graffiti decal on the city side
      const [x0, z0] = E.at(a + 0.02, -0.02), [x1, z1] = E.at(a + SLAB - 0.07, -0.02);
      const u0 = uOff + E.u * (a + 0.02) / ART_LEN, u1 = uOff + E.u * (a + SLAB - 0.07) / ART_LEN;
      quad(art, x0, z0, x1, z1, 0.05, H - 0.1, u0, u1);
    }
    endRun(E.to);
    // a police roadblock across each street that meets the wall
    for (const m of E.mouths) {
      for (const s of [-1, 1]) jersey(plain, E, m + s * 4.3, 3.6);
      for (const s of [-1, 1]) sawhorse(plain, E, m + s * 1.3, 2.4);
      for (const k of [-4.5, -1.5, 1.5, 4.5]) cone(plain, E, m + k + rr(-0.3, 0.3), -0.7 + rr(-0.2, 0.2));
      const car = carMesh(null, true), [cx, cz] = E.at(m + rr(-1.5, 1.5), 2.6);
      car.grp.position.set(cx, 0, cz); car.grp.rotation.y = yaw + rp([0, Math.PI]) + rr(-0.35, 0.35);
      scene.add(car.grp); cops.push({ car, phase: r() * 2 });
    }
    // grass and a wood beyond the wall, tall enough to show over it
    const len = E.to - E.from, [gx, gz] = E.at((E.from + E.to) / 2, 9);
    box(plain, E.alongX ? len : 16, 0.04, E.alongX ? 16 : len, gx, 0.02, gz, '#3d6b45');
    for (let a = E.from + 2; a < E.to; a += 3.4) for (const row of [6, 10, 14]) {
      const ta = a + rr(-1.4, 1.4), [x, z] = E.at(ta, row + rr(-1, 1)), s = rr(0.8, 1.35);
      tree(woods, x, z, s, r);
    }
    // nothing gets past the wall or the roadblocks
    const [ax, az] = E.at(E.from, 0), [bx, bz] = E.at(E.to, 1);
    addCollider(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), H, true);
  }
  // the sea: a rope of floats on posts along the waterline
  for (let z = -FACE + 2; z < FACE; z += 5) {
    box(plain, 0.18, 1.6, 0.18, 252.6, 0.5, z, '#8a6a4a');
    box(plain, 0.05, 0.05, 5, 252.6, 0.95, z + 2.5, '#f4ece6');
    for (let k = 1; k < 5; k++) addGeo(plain, sphG(), 252.6, 0.95, z + k, 0.38, 0.38, 0.38, 0, 0, 0, k % 2 ? '#ff4b3e' : '#ffffff');
  }
  const artMat = new THREE.MeshLambertMaterial({ map: graffitiTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  scene.add(new THREE.Mesh(art.geometry(), artMat), new THREE.Mesh(woods.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })));
}

// the roadblock cruisers' lights flash out of step with each other
export function updateEdges(time) {
  for (const c of cops) { const on = ((time + c.phase) * 6 | 0) % 2 === 0; c.car.lr.visible = on; c.car.lb.visible = !on; }
}

// a vertical quad facing back into the city, from (x0, z0) to (x1, z1), with texture u from u0 to u1
const _w = new THREE.Color('#ffffff');
function quad(gb, x0, z0, x1, z1, y0, y1, u0, u1) {
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = dz / l, nz = -dx / l;
  const v0 = y0 / H, v1 = y1 / H, A = [x0, y0, z0, u0, v0], B = [x1, y0, z1, u1, v0], C = [x1, y1, z1, u1, v1], D = [x0, y1, z0, u0, v1];
  for (const p of [A, B, C, A, C, D]) gb.v(p[0], p[1], p[2], nx, 0, nz, _w, p[3], p[4]);
}
// a concrete jersey barrier striped red and white, `len` long, centred `a` along the edge
function jersey(gb, E, a, len) {
  const P8 = [];
  for (const s of [-1, 1]) for (const [o, y] of [[0, 0], [0.7, 0], [0.48, 0.9], [0.22, 0.9]]) { const [x, z] = E.at(a + s * len / 2, o); P8.push([x, y, z]); }
  hexa(gb, P8, '#e9e4dc');
  for (let k = 0; k < 3; k++) { const [x, z] = E.at(a - len / 2 + (k + 0.5) * len / 3, -0.005); box(gb, E.alongX ? len / 6 : 0.02, 0.22, E.alongX ? 0.02 : len / 6, x, 0.55, z, '#e8354a'); }
}
// a striped A-frame sawhorse
function sawhorse(gb, E, a, len) {
  for (const s of [-1, 1]) for (const o of [0.1, 0.6]) { const [x, z] = E.at(a + s * (len / 2 - 0.15), o); box(gb, 0.08, 1.1, 0.08, x, 0.55, z, '#f4f0e6'); }
  for (const [y, o] of [[0.95, 0.1], [0.55, 0.1]]) for (let k = 0; k < 6; k++) {
    const [x, z] = E.at(a - len / 2 + (k + 0.5) * len / 6, o - 0.04);
    box(gb, E.alongX ? len / 6 : 0.04, 0.24, E.alongX ? 0.04 : len / 6, x, y, z, k % 2 ? '#ffffff' : '#ff7a1a');
  }
}
const CONE = new THREE.ConeGeometry(0.5, 1, 8).toNonIndexed();
function cone(gb, E, a, o) {
  const [x, z] = E.at(a, o);
  box(gb, 0.5, 0.05, 0.5, x, 0.025, z, '#ff6a1a');
  addGeo(gb, CONE, x, 0.4, z, 0.6, 0.75, 0.6, 0, 0, 0, '#ff6a1a');
  addGeo(gb, CYL6, x, 0.45, z, 0.36, 0.12, 0.36, 0, 0, 0, '#ffffff');
}
const BLOB = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), PINE = new THREE.ConeGeometry(1, 1, 7).toNonIndexed();
const LEAF = ['#2f6b3f', '#3a7d47', '#285c38', '#4a8a4f', '#356f3a'];
function tree(gb, x, z, s, r) {
  const col = () => LEAF[Math.floor(r() * LEAF.length)];
  if (r() < 0.4) {
    // pine: a trunk under stacked cones
    addGeo(gb, CYL6, x, 1.5 * s, z, 0.45 * s, 3 * s, 0.45 * s, 0, 0, 0, '#5a4030');
    for (let k = 0; k < 3; k++) addGeo(gb, PINE, x, (3 + k * 2.2) * s, z, (2.6 - k * 0.7) * s, 3.4 * s, (2.6 - k * 0.7) * s, 0, r() * 3, 0, col());
  } else {
    addGeo(gb, CYL6, x, 2.2 * s, z, 0.5 * s, 4.4 * s, 0.5 * s, 0, 0, 0, '#5a4030');
    const n = 2 + (r() * 2 | 0);
    for (let k = 0; k < n; k++) {
      const R = (2 + r() * 1.2) * s;
      addGeo(gb, BLOB, x + (r() - 0.5) * 2 * s, (5 + k * 1.6 + r()) * s, z + (r() - 0.5) * 2 * s, R, R * 0.85, R, r(), r() * 3, 0, col());
    }
  }
}

// ---- graffiti: one strip of wall, ART_LEN metres long, tiled along every edge ----
const WORDS = ['NEON BAY', "'86", 'RAD', 'NO EXIT', 'FREEDOM', 'VICE', 'TUBULAR', 'WILD STYLE', 'PEACE', 'DREAM', 'BAY CREW', 'GNARLY'];
const SPRAY = ['#ff2fa8', '#21f7ff', '#b04bff', '#39ff88', '#ffcf3a', '#ff5a3d', '#ff8fd0', '#5fa8ff'];
function graffitiTexture() {
  const W = 3072, Ht = 320, c = makeCanvas(W, Ht), x = c.getContext('2d'), r = seeded(1989), rp = a => a[Math.floor(r() * a.length)];
  x.clearRect(0, 0, W, Ht);
  // grime: faint streaks and old paint ghosts
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(60,50,60,${0.04 + r() * 0.06})`; x.fillRect(r() * W, Ht * 0.3 + r() * Ht * 0.7, 4 + r() * 30, Ht); }
  let px = 30;
  while (px < W - 260) {
    const kind = r();
    if (kind < 0.55) px += piece(x, px, rp(WORDS), rp(SPRAY), rp(SPRAY), r);
    else if (kind < 0.75) px += heart(x, px, rp(SPRAY), r);
    else px += tag(x, px, rp(WORDS), rp(SPRAY), r);
    px += 30 + r() * 140;
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function drips(x, x0, x1, y, col, r) {
  x.strokeStyle = col; x.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const dx = x0 + r() * (x1 - x0); x.beginPath(); x.moveTo(dx, y); x.lineTo(dx, y + 10 + r() * 50); x.stroke(); }
}
// a bubble-letter piece: white outline, black keyline, two-tone fill, drips
function piece(x, px, word, a, b, r) {
  let size = 90 + r() * 70; x.font = `${size}px "Bowlby One", Impact, sans-serif`;
  while (x.measureText(word).width > 700) { size -= 8; x.font = `${size}px "Bowlby One", Impact, sans-serif`; }
  const w = x.measureText(word).width, y = 110 + r() * 140;
  x.save(); x.translate(px + w / 2, y); x.rotate((r() - 0.5) * 0.18); x.translate(-w / 2, 0);
  x.textBaseline = 'alphabetic'; x.lineJoin = 'round';
  x.lineWidth = 22; x.strokeStyle = '#ffffff'; x.strokeText(word, 0, 0);
  x.lineWidth = 9; x.strokeStyle = '#1a1020'; x.strokeText(word, 0, 0);
  const g = x.createLinearGradient(0, -size * 0.8, 0, 0); g.addColorStop(0, a); g.addColorStop(1, b);
  x.fillStyle = g; x.fillText(word, 0, 0);
  x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0, -size * 0.55, w, 4);
  drips(x, 10, w - 10, 4, b, r);
  x.restore();
  return w;
}
function heart(x, px, col, r) {
  const s = 40 + r() * 40, cx = px + s, cy = 120 + r() * 120;
  x.beginPath(); x.moveTo(cx, cy + s * 0.9);
  x.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.6, cy - s * 1.1, cx, cy - s * 0.35);
  x.bezierCurveTo(cx + s * 0.6, cy - s * 1.1, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.9);
  x.lineWidth = 8; x.strokeStyle = '#1a1020'; x.stroke(); x.fillStyle = col; x.fill();
  drips(x, cx - s * 0.3, cx + s * 0.3, cy + s * 0.6, col, r);
  return s * 2;
}
// a quick scrawled signature
function tag(x, px, word, col, r) {
  x.font = `${50 + r() * 30}px "Yellowtail", cursive`; x.fillStyle = col;
  const y = 90 + r() * 190; x.save(); x.translate(px, y); x.rotate(-0.15 + r() * 0.1); x.fillText(word.toLowerCase(), 0, 0);
  const w = x.measureText(word.toLowerCase()).width; x.lineWidth = 3; x.strokeStyle = col; x.beginPath(); x.moveTo(0, 12); x.lineTo(w, 6); x.stroke(); x.restore();
  return w;
}
