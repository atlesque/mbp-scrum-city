import { seeded } from '../core/util.js';

// ================= TEXTURES =================
export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// Returns the facade map, its emissive map, and light(frac), which redraws the emissive map with that
// share of the windows switched on. The 22% lit in the daytime map stay on; the rest come on in a fixed order.
export function windowTextures() {
  const S = 256, c = makeCanvas(S, S), e = makeCanvas(S, S), x = c.getContext('2d'), y = e.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  const r = seeded(7), wins = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const px = i * 32, py = j * 32, roll = r(), lit = roll < 0.22;
    x.fillStyle = '#d9d2df'; x.fillRect(px + 4, py + 6, 24, 22);
    const g = x.createLinearGradient(px, py, px + 32, py + 32);
    if (lit) { g.addColorStop(0, '#ffe7a8'); g.addColorStop(1, '#ffb877'); } else { g.addColorStop(0, '#5a7fa8'); g.addColorStop(1, '#2c3d66'); }
    x.fillStyle = g; x.fillRect(px + 6, py + 8, 20, 18);
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(px + 15, py + 8, 2, 18);
    if (!lit && r() < 0.3) { x.fillStyle = 'rgba(240,230,220,.75)'; x.fillRect(px + 6, py + 8, 20, 6 + r() * 10); }
    // windows lit only at night sit on a blue pane, so they glow a little softer
    wins.push({ px, py, roll, col: lit ? (r() < 0.5 ? '#ffcf8a' : '#ffa8d0') : (i + j) % 3 ? '#b8905a' : '#a8708c' });
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  [t, te].forEach(q => { q.wrapS = q.wrapT = THREE.RepeatWrapping; q.anisotropy = 4; });
  let shown = -1;
  function light(frac) {
    const n = wins.filter(w => w.roll < frac).length; if (n === shown) return; shown = n;
    y.fillStyle = '#000'; y.fillRect(0, 0, S, S);
    for (const w of wins) if (w.roll < frac) { y.fillStyle = w.col; y.fillRect(w.px + 6, w.py + 8, 20, 18); }
    te.needsUpdate = true;
  }
  light(0.22);
  return [t, te, light];
}
const shirtCache = {};
export function shirtMat(base, a, b) {
  const key = base + a + b; if (shirtCache[key]) return shirtCache[key];
  if (!a) return (shirtCache[key] = new THREE.MeshLambertMaterial({ color: base }));
  const c = makeCanvas(64, 64), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 14; i++) {
    const cx = Math.random() * 64, cy = Math.random() * 64, r = 3 + Math.random() * 3;
    x.fillStyle = b; x.save(); x.translate(cx, cy); x.rotate(Math.random() * 6); x.fillRect(-r * 1.6, -1, r * 3.2, 2); x.restore();
    x.fillStyle = a; for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; x.beginPath(); x.arc(cx + Math.cos(an) * r * 0.6, cy + Math.sin(an) * r * 0.6, r * 0.5, 0, 7); x.fill(); }
    x.fillStyle = '#ffe36b'; x.beginPath(); x.arc(cx, cy, r * 0.3, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter;
  return (shirtCache[key] = new THREE.MeshLambertMaterial({ map: t }));
}
export function neonTexture(text, color, font) {
  const c = makeCanvas(512, 128), x = c.getContext('2d');
  let size = 92; x.font = `${size}px ${font}`;
  while (x.measureText(text).width > 470 && size > 30) { size -= 4; x.font = `${size}px ${font}`; }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 22; x.fillStyle = color;
  for (let i = 0; i < 3; i++) x.fillText(text, 256, 68);
  x.shadowBlur = 4; x.fillStyle = '#fff6fb'; x.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
export function crossTexture() {
  const c = makeCanvas(128, 128), x = c.getContext('2d');
  x.shadowColor = '#ff2b3a'; x.shadowBlur = 16; x.fillStyle = '#ff3344';
  x.fillRect(44, 14, 40, 100); x.fillRect(14, 44, 100, 40); x.shadowBlur = 0; x.fillStyle = '#ffd9dd'; x.fillRect(54, 24, 20, 80); x.fillRect(24, 54, 80, 20);
  return new THREE.CanvasTexture(c);
}
export function glyphSprite(ch, color, size) {
  const c = makeCanvas(128, 128), x = c.getContext('2d');
  x.font = '96px "Bowlby One", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 18; x.fillStyle = color; x.fillText(ch, 64, 70); x.fillText(ch, 64, 70);
  x.shadowBlur = 0; x.lineWidth = 4; x.strokeStyle = '#000'; x.strokeText(ch, 64, 70); x.fillStyle = '#fff'; x.fillText(ch, 64, 70);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
  s.scale.set(size, size, 1); return s;
}
