import { G, P, bikes, cam, enemies, pickups } from '../core/state.js';
import { $, angDiff } from '../core/util.js';
import { makeCanvas } from '../render/textures.js';
import { SPAWN, parkRects, shops } from './city.js';
import { ROADS, tallBoxes } from './collision.js';

// ================= MAP / RADAR =================
const MAP = { x0: -260, z0: -260, s: 2, size: 1120 };
let mapCanvas;
export function buildMap() {
  mapCanvas = makeCanvas(MAP.size, MAP.size); const x = mapCanvas.getContext('2d');
  const R = (wx, wz, w, h, c) => { x.fillStyle = c; x.fillRect((wx - MAP.x0) * MAP.s, (wz - MAP.z0) * MAP.s, w * MAP.s, h * MAP.s); };
  R(-260, -260, 560, 560, '#2e2344');
  R(-206, -206, 412, 412, '#b9a5c9');
  for (const r of ROADS) { R(r - 6, -206, 12, 412, '#4a3c63'); R(-206, r - 6, 412, 12, '#4a3c63'); }
  R(206, -260, 46, 560, '#e9cf96'); R(251, -260, 60, 560, '#2aa9c6');
  for (const p of parkRects) R(p[0], p[1], p[2], p[3], '#5fa865');
  for (const b of tallBoxes) R(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0, '#d9c8e6');
}
const radarCtx = $('radar').getContext('2d');
export function drawRadar() {
  const c = radarCtx, S = 400, Rr = S / 2, zoom = 2.6 / MAP.s;
  c.save(); c.clearRect(0, 0, S, S);
  c.beginPath(); c.arc(Rr, Rr, Rr, 0, 7); c.clip();
  c.fillStyle = '#2e2344'; c.fillRect(0, 0, S, S);
  c.translate(Rr, Rr); c.rotate(cam.yaw - Math.PI); c.scale(zoom, zoom);
  c.translate(-(P.x - MAP.x0) * MAP.s, -(P.z - MAP.z0) * MAP.s);
  c.drawImage(mapCanvas, 0, 0);
  c.restore();
  const toR = (wx, wz) => {
    const dx = (wx - P.x) * MAP.s * zoom, dz = (wz - P.z) * MAP.s * zoom, a = cam.yaw - Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    return [Rr + dx * ca - dz * sa, Rr + dx * sa + dz * ca];
  };
  const blip = (wx, wz, col, size, edge, shape) => {
    let [bx, by] = toR(wx, wz); const dx = bx - Rr, dy = by - Rr, d = Math.hypot(dx, dy);
    if (d > Rr - 10) { if (!edge) return; bx = Rr + dx / d * (Rr - 12); by = Rr + dy / d * (Rr - 12); }
    c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 3;
    if (shape === 'sq') { c.fillRect(bx - size, by - size, size * 2, size * 2); c.strokeRect(bx - size, by - size, size * 2, size * 2); }
    else { c.beginPath(); c.arc(bx, by, size, 0, 7); c.fill(); c.stroke(); }
  };
  const flashOn = (performance.now() / 250 | 0) % 2;
  for (const p of pickups) if (p.active && p.type !== 'cash') blip(p.x, p.z, p.type === 'health' ? '#ff5a7a' : '#5ec8ff', 6, false, 'sq');
  for (const sh of shops) { const [bx, by] = toR(sh.x, sh.z); const dx = bx - Rr, dy = by - Rr, d = Math.hypot(dx, dy); const k = d > Rr - 16 ? (Rr - 18) / d : 1; c.font = '30px "Bowlby One", Impact'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 6; c.strokeStyle = '#000'; c.strokeText('$', Rr + dx * k, Rr + dy * k); c.fillStyle = '#ff4fa3'; c.fillText('$', Rr + dx * k, Rr + dy * k); }
  { const [bx, by] = toR(SPAWN.x, SPAWN.z); if (Math.hypot(bx - Rr, by - Rr) < Rr - 10) { c.fillStyle = '#fff'; c.fillRect(bx - 9, by - 3, 18, 6); c.fillRect(bx - 3, by - 9, 6, 18); c.fillStyle = '#ff3344'; c.fillRect(bx - 7, by - 2, 14, 4); c.fillRect(bx - 2, by - 7, 4, 14); } }
  for (const b of bikes) { if (b === P.bike || b.dead) continue; if (b.rider) blip(b.x, b.z, '#f4f4f4', 5, false); else blip(b.x, b.z, '#3ef0ff', 6, true, 'sq'); }
  for (const e of enemies) if (e.alive) blip(e.x, e.z, e.type === 'cop' ? (flashOn ? '#ff3b4e' : '#4a7dff') : '#ff3b4e', 7, true);
  if (G.heli && G.heli.alive) blip(G.heli.x, G.heli.z, flashOn ? '#ffd23e' : '#ff3b4e', 11, true, 'sq');
  // player arrow
  c.save(); c.translate(Rr, Rr); c.rotate(-angDiff(cam.yaw, P.yaw));
  c.beginPath(); c.moveTo(0, -16); c.lineTo(11, 12); c.lineTo(0, 6); c.lineTo(-11, 12); c.closePath(); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 4; c.stroke(); c.fill(); c.restore();
  c.font = '26px "Bowlby One", Impact'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const na = cam.yaw - Math.PI, nr = Rr - 20, nx = Rr + Math.sin(na) * nr, ny = Rr - Math.cos(na) * nr;
  c.lineWidth = 5; c.strokeStyle = '#000'; c.strokeText('N', nx, ny); c.fillStyle = '#ffd23e'; c.fillText('N', nx, ny);
}
