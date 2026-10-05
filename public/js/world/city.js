import { spick, srange, srnd } from '../core/util.js';
import { CYL6, GB, UNIT, addGeo, box, wallBox } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { crossTexture, neonTexture, windowTextures } from '../render/textures.js';
import { SHOP_TYPES } from '../shops/types.js';
import { ROADS, addCollider } from './collision.js';

// ================= WORLD =================
const PASTEL = ['#f7a8c4', '#8fe3d6', '#ffd0a1', '#c9b3f2', '#a7e8a1', '#fff1c9', '#ffb3a7', '#9fd4ff', '#f4ece6', '#ffc6e7', '#b8f0e6', '#ffe0b3'];
const NEON = ['#ff2fa8', '#21f7ff', '#b04bff', '#39ff88', '#ffcf3a', '#ff5a3d'];
export const signs = [], parkRects = [], healthSpots = [], armorSpots = [];
// filled by buildWorld: where shop doors are ({ type, x, z }) and where parked cars stand
export const shopSpots = [], lotSpots = [];
// Which blocks of the 8x8 grid hold a shop, and which way the storefront faces ('n' street side, 'e' beach side).
// The shop type (shops/types.js) supplies the storefront colours and sign.
export const SHOP_SITES = [
  { block: [4, 3], type: 'gunshop', face: 'n' },
  { block: [6, 5], type: 'gunshop', face: 'e' },
];
export let SPAWN = { x: -25, z: 7.5, yaw: Math.PI };
const HOTEL_NAMES = ['The Palms', 'Coral', 'Flamingo', 'Starlite', 'Breakers', 'Sunrise', 'Paradise', 'Tides', 'Seashell', 'Lagoon', 'Boulevard', 'Moonglow', 'Avalon', 'Riviera'];
const SHOP_NAMES = ['Diner', 'Disco', 'Arcade', 'Video', 'Liquor', 'Pawn', 'Cafe', 'Club 86', 'Motel', 'Bar', 'Records', 'Tattoo', 'Pizza', 'Roller'];
export let winMat, plainMat, neonMat, waterMesh, waterBase;

function blockKind(i, j) {
  if (i === 3 && j === 4) return 'hospital';
  if (SHOP_SITES.some(s => s.block[0] === i && s.block[1] === j)) return 'shop';
  if ([[2, 2], [5, 6], [1, 5], [6, 1], [3, 7], [0, 3], [7, 3]].some(([a, b]) => a === i && b === j)) return 'park';
  if ([[4, 6], [2, 0], [5, 2], [0, 7]].some(([a, b]) => a === i && b === j)) return 'lot';
  return 'city';
}
function palm(gb, x, z, h) {
  h = h || srange(7, 11); const lean = srange(0.4, 1.4), la = srange(0, Math.PI * 2), segs = 6;
  let px = x, pz = z;
  for (let s = 0; s < segs; s++) {
    const t = s / segs, y = t * h + h / segs / 2, off = Math.pow(t, 2) * lean;
    px = x + Math.cos(la) * off; pz = z + Math.sin(la) * off;
    addGeo(gb, CYL6, px, y, pz, 0.42 - t * 0.14, h / segs + 0.05, 0.42 - t * 0.14, 0, s * 0.5, 0, s % 2 ? '#8a6a4a' : '#7a5c40');
  }
  const top = h, tx = x + Math.cos(la) * lean, tz = z + Math.sin(la) * lean;
  for (let k = 0; k < 8; k++) {
    const ry = k / 8 * Math.PI * 2 + srange(-.2, .2), rx = srange(0.35, 0.75), L = srange(3.2, 4.2);
    addGeo(gb, UNIT, tx + Math.sin(ry) * Math.cos(rx) * L / 2, top - Math.sin(rx) * L / 2, tz + Math.cos(ry) * Math.cos(rx) * L / 2, 0.85, 0.06, L, rx, ry, 0, k % 2 ? '#3f9a4e' : '#2f7f45', 'YXZ');
  }
  box(gb, 0.5, 0.5, 0.5, tx, top - 0.2, tz, '#5a3d24');
  addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, h, false);
}
function lamp(gb, ng, x, z, ry) {
  box(gb, 0.16, 6, 0.16, x, 3, z, '#3b3446');
  const ax = Math.sin(ry), az = Math.cos(ry);
  box(gb, 0.12, 0.12, 1.6, x + ax * 0.7, 6, z + az * 0.7, '#3b3446', ry);
  box(ng, 0.4, 0.14, 0.7, x + ax * 1.4, 5.92, z + az * 1.4, '#ffe6a8', ry);
}
function addSign(text, x, y, z, ry, w, color, font) { signs.push({ text, x, y, z, ry, w, color, font }); }
function building(walls, plain, neon, x0, x1, z0, z1, h, style, face, signText) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const col = spick(PASTEL), trim = srnd() < 0.6 ? '#fff6ee' : spick(PASTEL), neonC = spick(NEON);
  wallBox(walls, plain, cx, h / 2, cz, w, h, d, col);
  box(plain, w + 0.3, 0.35, d + 0.3, cx, 3.4, cz, trim);
  box(plain, w + 0.5, 0.6, d + 0.5, cx, h + 0.3, cz, trim);
  const fn = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[face];
  const fx = cx + fn[0] * w / 2, fz = cz + fn[1] * d / 2, fw = fn[0] ? d : w, ry = Math.atan2(fn[0], fn[1]);
  const along = (o) => [fx + (fn[0] ? 0 : o), fz + (fn[0] ? o : 0)];
  // awning over the ground floor
  if (srnd() < 0.7) { const [ax, az] = along(0); const aw = fw * 0.75; box(plain, fn[0] ? 1.6 : aw, 0.14, fn[0] ? aw : 1.6, ax + fn[0] * 0.8, 2.9, az + fn[1] * 0.8, spick(['#ff6fae', '#3fd6c8', '#ffb347', '#a77bff', '#ffffff'])); }
  if (style === 'deco') {
    // vertical fins and a central parapet: the Ocean Drive look
    for (const o of [-fw * 0.32, 0, fw * 0.32]) { const [a, b] = along(o); box(plain, fn[0] ? 0.5 : 0.7, h - 3.4, fn[0] ? 0.7 : 0.5, a + fn[0] * 0.2, 3.6 + (h - 3.4) / 2, b + fn[1] * 0.2, trim); }
    const [pa, pb] = along(0); box(plain, fn[0] ? 0.8 : fw * 0.35, 2.4, fn[0] ? fw * 0.35 : 0.8, pa, h + 1.5, pb, trim);
    box(neon, fn[0] ? 0.12 : fw * 0.36, 0.14, fn[0] ? fw * 0.36 : 0.12, pa + fn[0] * 0.45, h + 2.6, pb + fn[1] * 0.45, neonC);
    for (const o of [-fw / 2 + 0.1, fw / 2 - 0.1]) { const [a, b] = along(o); box(neon, 0.14, h - 3.6, 0.14, a + fn[0] * 0.15, 3.6 + (h - 3.6) / 2, b + fn[1] * 0.15, neonC); }
  }
  if (style === 'tower' && h > 24) {
    const w2 = w * 0.68, d2 = d * 0.68, h2 = h * srange(0.18, 0.4);
    wallBox(walls, plain, cx, h + h2 / 2, cz, w2, h2, d2, col); box(plain, w2 + 0.4, 0.5, d2 + 0.4, cx, h + h2 + 0.25, cz, trim);
    if (srnd() < 0.6) { const w3 = w2 * 0.55, h3 = h2 * 0.6; wallBox(walls, plain, cx, h + h2 + h3 / 2, cz, w3, h3, w3, trim); box(neon, 0.25, 6, 0.25, cx, h + h2 + h3 + 3, cz, neonC); }
  }
  if (style === 'deco' || srnd() < (style === 'tower' ? 0.25 : 0.4)) {
    const y = h + 0.66;
    box(neon, w + 0.55, 0.14, 0.14, cx, y, z0 - 0.25, neonC); box(neon, w + 0.55, 0.14, 0.14, cx, y, z1 + 0.25, neonC);
    box(neon, 0.14, 0.14, d + 0.55, x0 - 0.25, y, cz, neonC); box(neon, 0.14, 0.14, d + 0.55, x1 + 0.25, y, cz, neonC);
  }
  if (signText) {
    const sw = Math.min(fw * 0.8, style === 'deco' ? 11 : 8);
    addSign(signText, fx + fn[0] * 0.35, style === 'deco' ? Math.min(h - 2.5, 8.5) : 5.2, fz + fn[1] * 0.35, ry, sw, spick(NEON), srnd() < 0.6 ? '"Yellowtail", cursive' : '"Bowlby One", Impact, sans-serif');
  }
  addCollider(x0, x1, z0, z1, h, true);
}
export function buildWorld() {
  const walls = new GB(), plain = new GB(), neon = new GB(), trees = new GB();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: '#4a4152' }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  // road markings
  for (const r of ROADS) for (let t = -204; t < 204; t += 6) {
    if (ROADS.some(q => Math.abs(t - q) < 8)) continue;
    box(plain, 0.2, 0.03, 2.6, r, 0.02, t, '#f2cf5c'); box(plain, 2.6, 0.03, 0.2, t, 0.02, r, '#f2cf5c');
  }
  for (const a of ROADS) for (const b of ROADS) for (let k = -4; k <= 4; k++) {
    if (a > -200 && a < 200) { box(plain, 0.7, 0.025, 3.6, a + k * 1.25, 0.02, b - 8.2, '#ece6ee'); box(plain, 0.7, 0.025, 3.6, a + k * 1.25, 0.02, b + 8.2, '#ece6ee'); }
    if (b > -200 && b < 200) { box(plain, 3.6, 0.025, 0.7, a - 8.2, 0.02, b + k * 1.25, '#ece6ee'); box(plain, 3.6, 0.025, 0.7, a + 8.2, 0.02, b + k * 1.25, '#ece6ee'); }
  }
  let hotelIx = 0;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const cx = -175 + i * 50, cz = -175 + j * 50, kind = blockKind(i, j);
    box(plain, 38, 0.14, 38, cx, 0.07, cz, '#cbbac6');
    box(plain, 38.3, 0.1, 38.3, cx, 0.05, cz, '#9d8ea5');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lamp(plain, neon, cx + sx * 17.6, cz + sz * 17.6, Math.atan2(sx, sz));
    for (const [ox, oz, ry] of [[0, -17.6, Math.PI], [0, 17.6, 0], [-17.6, 0, -Math.PI / 2], [17.6, 0, Math.PI / 2]]) lamp(plain, neon, cx + ox, cz + oz, ry);
    const district = i >= 6 ? 'deco' : i <= 2 && j >= 1 && j <= 6 ? 'tower' : 'mid';
    if (kind === 'park') {
      box(plain, 32, 0.08, 32, cx, 0.17, cz, '#6fb35e');
      box(plain, 32, 0.09, 2.4, cx, 0.18, cz, '#e8d3a5'); box(plain, 2.4, 0.09, 32, cx, 0.18, cz, '#e8d3a5');
      box(plain, 4, 0.8, 4, cx, 0.5, cz, '#f3ece6'); box(neon, 2.8, 0.1, 2.8, cx, 0.92, cz, '#5fe6ff');
      addCollider(cx - 2, cx + 2, cz - 2, cz + 2, 0.9, false);
      for (let k = 0; k < 9; k++) { const px = cx + srange(-14, 14), pz = cz + srange(-14, 14); if (Math.abs(px - cx) < 3 || Math.abs(pz - cz) < 3) continue; palm(trees, px, pz); }
      parkRects.push([cx - 16, cz - 16, 32, 32]);
      healthSpots.push([cx + 5, cz + 1.2]);
      continue;
    }
    if (kind === 'lot') {
      box(plain, 32, 0.06, 32, cx, 0.16, cz, '#6b6274');
      for (let k = -3; k <= 3; k++) { box(plain, 0.2, 0.02, 5, cx + k * 4, 0.2, cz - 8, '#f4f0f6'); box(plain, 0.2, 0.02, 5, cx + k * 4, 0.2, cz + 8, '#f4f0f6'); }
      for (let k = -3; k < 3; k++) for (const s of [-1, 1]) if (srnd() < 0.55) lotSpots.push({ x: cx + k * 4 + 2, z: cz + s * 8, yaw: s > 0 ? 0 : Math.PI });
      armorSpots.push([cx, cz]);
      continue;
    }
    if (kind === 'hospital') {
      const x0 = cx - 14, x1 = cx + 14, z0 = cz - 13, z1 = cz + 14, h = 15;
      wallBox(walls, plain, cx, h / 2, (z0 + z1) / 2, 28, h, 27, '#f5f3f0');
      box(plain, 28.6, 0.6, 27.6, cx, h + 0.3, (z0 + z1) / 2, '#5fd1c4'); box(plain, 28.4, 0.4, 27.4, cx, 3.4, (z0 + z1) / 2, '#5fd1c4');
      box(plain, 10, 0.25, 3, cx, 3.1, z0 - 1.4, '#ffffff'); box(neon, 10, 0.1, 0.1, cx, 3.0, z0 - 2.9, '#ff4455');
      signs.push({ cross: true, x: cx, y: 9.5, z: z0 - 0.3, ry: Math.PI, w: 4 });
      signs.push({ text: 'Bay General', x: cx, y: 5.3, z: z0 - 0.3, ry: Math.PI, w: 10, color: '#5ff3ff', font: '"Bowlby One", Impact, sans-serif' });
      addCollider(x0, x1, z0, z1, h, true);
      SPAWN = { x: cx + 4, z: cz - 17.6, yaw: Math.PI / 2 };
      healthSpots.push([cx + 8, cz - 17.2]);
      continue;
    }
    const lots = [];
    if (kind === 'shop') {
      const site = SHOP_SITES.find(s => s.block[0] === i && s.block[1] === j);
      if (site.face === 'e') { lots.push({ x0: cx + 2, x1: cx + 16, z0: cz - 8, z1: cz + 8, face: 'e', shop: site.type }); lots.push({ x0: cx - 16, x1: cx, z0: cz - 16, z1: cz + 16, face: 'w' }); }
      else { lots.push({ x0: cx - 7, x1: cx + 9, z0: cz - 16, z1: cz - 4, face: 'n', shop: site.type }); lots.push({ x0: cx - 16, x1: cx + 16, z0: cz - 1, z1: cz + 16, face: 's' }); }
    } else if (district === 'deco') {
      lots.push({ x0: cx - 16, x1: cx - 1, z0: cz - 16, z1: cz + 16, face: 'w' });
      lots.push({ x0: cx + 1, x1: cx + 16, z0: cz - 16, z1: cz - 1, face: i === 7 ? 'e' : 'n' });
      lots.push({ x0: cx + 1, x1: cx + 16, z0: cz + 1, z1: cz + 16, face: i === 7 ? 'e' : 's' });
    } else {
      const r = srnd();
      if (r < 0.3) lots.push({ x0: cx - 15, x1: cx + 15, z0: cz - 15, z1: cz + 15, face: spick(['n', 's', 'e', 'w']) });
      else if (r < 0.6) { if (srnd() < 0.5) { lots.push({ x0: cx - 16, x1: cx - 1, z0: cz - 15, z1: cz + 15, face: 'w' }); lots.push({ x0: cx + 1, x1: cx + 16, z0: cz - 15, z1: cz + 15, face: 'e' }); } else { lots.push({ x0: cx - 15, x1: cx + 15, z0: cz - 16, z1: cz - 1, face: 'n' }); lots.push({ x0: cx - 15, x1: cx + 15, z0: cz + 1, z1: cz + 16, face: 's' }); } }
      else for (const sx of [-1, 1]) for (const sz of [-1, 1]) lots.push({ x0: sx < 0 ? cx - 16 : cx + 1, x1: sx < 0 ? cx - 1 : cx + 16, z0: sz < 0 ? cz - 16 : cz + 1, z1: sz < 0 ? cz - 1 : cz + 16, face: srnd() < 0.5 ? (sx < 0 ? 'w' : 'e') : (sz < 0 ? 'n' : 's') });
    }
    for (const L of lots) {
      if (L.shop) {
        const h = 6, w = L.x1 - L.x0, d = L.z1 - L.z0, scx = (L.x0 + L.x1) / 2, scz = (L.z0 + L.z1) / 2, sf = SHOP_TYPES[L.shop].storefront;
        wallBox(walls, plain, scx, h / 2, scz, w, h, d, sf.wall);
        box(plain, w + 0.6, 0.7, d + 0.6, scx, h + 0.35, scz, sf.roof);
        const fn = L.face === 'e' ? [1, 0] : [0, -1];
        const fx = scx + fn[0] * w / 2, fz = scz + fn[1] * d / 2;
        box(neon, fn[0] ? 0.15 : w + 0.6, 0.15, fn[0] ? d + 0.6 : 0.15, fx + fn[0] * 0.35, h + 0.75, fz + fn[1] * 0.35, sf.neon);
        box(plain, fn[0] ? 2 : w * 0.8, 0.16, fn[0] ? d * 0.8 : 2, fx + fn[0], 3.0, fz + fn[1], sf.awning);
        signs.push({ text: sf.sign.text, x: fx + fn[0] * 0.4, y: 4.6, z: fz + fn[1] * 0.4, ry: Math.atan2(fn[0], fn[1]), w: 10, color: sf.sign.color, font: sf.sign.font });
        addCollider(L.x0, L.x1, L.z0, L.z1, h, true);
        shopSpots.push({ type: L.shop, x: fx + fn[0] * 2.2, z: fz + fn[1] * 2.2 });
        continue;
      }
      const inset = 0.6, x0 = L.x0 + inset, x1 = L.x1 - inset, z0 = L.z0 + inset, z1 = L.z1 - inset;
      let h, style = district;
      if (district === 'tower') h = srange(22, 64);
      else if (district === 'deco') h = srange(9, 17);
      else h = srange(8, 26);
      let sign = null;
      if (district === 'deco' && L.face === 'e' && i === 7) sign = HOTEL_NAMES[hotelIx++ % HOTEL_NAMES.length] + ' Hotel';
      else if (srnd() < (district === 'tower' ? 0.15 : 0.35)) sign = spick(SHOP_NAMES);
      building(walls, plain, neon, x0, x1, z0, z1, h, style, L.face, sign);
    }
    if (srnd() < 0.5) healthSpots.push([cx + spick([-17.6, 17.6]), cz + srange(-12, 12)]);
    else if (srnd() < 0.4) armorSpots.push([cx + srange(-12, 12), cz + spick([-17.6, 17.6])]);
  }
  // beach
  box(plain, 50, 0.12, 900, 229, 0.04, 0, '#f1d6a2');
  box(plain, 3, 0.14, 900, 206.5, 0.07, 0, '#cbbac6');
  for (let z = -198; z <= 198; z += 11) { palm(trees, 210 + srange(-0.6, 0.6), z + srange(-2, 2), srange(8, 12)); }
  for (let z = -170; z <= 170; z += 85) {
    const c = spick(['#ff6fae', '#3fd6c8', '#ffb347', '#a77bff']);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(plain, 0.2, 2.2, 0.2, 234 + a * 1.1, 1.1, z + b * 1.1, '#f4ece6');
    box(plain, 3, 2, 3, 234, 3.2, z, c); box(plain, 3.6, 0.3, 3.6, 234, 4.35, z, '#ffffff'); addCollider(232.6, 235.4, z - 1.6, z + 1.6, 4.5, false);
    box(plain, 0.3, 0.1, 3, 231.5, 1.2, z, '#f4ece6');
  }
  for (let k = 0; k < 26; k++) {
    const ux = srange(218, 246), uz = srange(-200, 200), c = spick(['#ff6fae', '#3fd6c8', '#ffe066', '#a77bff', '#ffffff']);
    box(plain, 0.08, 2.4, 0.08, ux, 1.2, uz, '#f4ece6'); addGeo(plain, new THREE.ConeGeometry(1.6, 0.6, 8).toNonIndexed(), ux, 2.5, uz, 1, 1, 1, 0, 0, 0, c);
    box(plain, 0.9, 0.06, 1.9, ux + 1.3, 0.14, uz, spick(['#ff9ecb', '#7fe7ff', '#fff1a6']));
  }
  // backdrop beyond the play area
  const ring = (x, z) => { const h = srange(14, 60), w = srange(16, 30); wallBox(walls, plain, x, h / 2, z, w, h, w, spick(PASTEL)); box(plain, w + 0.4, 0.6, w + 0.4, x, h + 0.3, z, '#fff6ee'); };
  for (let x = -330; x <= 200; x += 34) { ring(x, -238); ring(x, 238); ring(x, -280); ring(x, 280); }
  for (let z = -200; z <= 200; z += 34) { ring(-238, z); ring(-280, z); }
  healthSpots.push([210, -40], [212, 90]); armorSpots.push([214, 20]);

  const [wt, we] = windowTextures();
  winMat = new THREE.MeshLambertMaterial({ map: wt, vertexColors: true, emissiveMap: we, emissive: 0xffffff });
  plainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  neonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(walls.geometry(), winMat), new THREE.Mesh(plain.geometry(), plainMat), new THREE.Mesh(neon.geometry(), neonMat), new THREE.Mesh(trees.geometry(), plainMat));

  // water: faceted low-poly swell
  const wg = new THREE.PlaneGeometry(500, 900, 36, 64).toNonIndexed(); wg.rotateX(-Math.PI / 2); wg.translate(250 + 250, 0.1, 0);
  waterBase = Float32Array.from(wg.attributes.position.array);
  waterMesh = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: '#36c1d0', emissive: '#0e3a52', transparent: true, opacity: 0.94 }));
  scene.add(waterMesh);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 900), new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.7 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(251, 0.16, 0); scene.add(foam);

  // signs
  const crossT = crossTexture();
  for (const s of signs) {
    const mat = new THREE.MeshBasicMaterial({ map: s.cross ? crossT : neonTexture(s.text, s.color, s.font), transparent: true, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.cross ? s.w : s.w / 4), mat);
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry; scene.add(m);
  }
}
// top of the ground slabs laid down in buildWorld: block sidewalks, park and lot surfaces, the beach
export function groundAt(x, z) {
  if (x > 204) return x >= 205 && x <= 208 ? 0.14 : x < 254 ? 0.1 : 0;
  const i = Math.round((x + 175) / 50), j = Math.round((z + 175) / 50);
  if (i < 0 || i > 7 || j < 0 || j > 7) return 0;
  const dx = Math.abs(x + 175 - i * 50), dz = Math.abs(z + 175 - j * 50);
  if (dx > 19.15 || dz > 19.15) return 0;
  if (dx > 19 || dz > 19) return 0.1;
  if (dx < 16 && dz < 16) { const k = blockKind(i, j); if (k === 'park') return dx < 1.2 || dz < 1.2 ? 0.225 : 0.21; if (k === 'lot') return 0.19; }
  return 0.14;
}
