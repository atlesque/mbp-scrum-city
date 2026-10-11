import { held, kb } from '../core/controls.js';
import { Sound } from '../core/audio.js';
import { requestLock } from '../core/input.js';
import { G, I, P, keys } from '../core/state.js';
import { $ } from '../core/util.js';
import { all, entities } from '../entities/registry.js';
import { SHOP_TYPES } from '../shops/types.js';
import { toast } from './hud.js';
import { SPAWN, shopSpots } from '../world/city.js';
import { CLUB, CLUB_NAME } from '../world/club.js';
import { LANDMARK_SITES } from '../world/landmarks.js';
import { MAP, mapImage } from '../world/radar.js';
import { clampView, openView, panBy, toScreen, toWorld, zoomAt } from '../world/mapview.js';

// ================= WORLD MAP =================
// The whole city on one screen, north up: the map key (M unless rebound) or the pause menu's Map button opens it.
// Like a shop's menu, the city waits while it is open. Drag or use the movement keys to pan, scroll or +/- to zoom,
// click to drop a waypoint (it shows on the radar until you get there), click it again or right click to clear it.
// Every marker comes from the same blip(radar) trait the radar draws (entities/registry.js), so anything that
// shows on the radar shows here too; the names of places come from the lists below.
const BLIP = 0.62; // blips are sized for the radar's 400 px canvas shown at 200 px; this is their size here per unit
const LEGEND = [
  ['cross', '#ff3344', 'Hospital'], ['$', '#ff4fa3', 'Bullet Bros. Guns'], ['sq', '#ff4fd8', CLUB_NAME],
  ['sq', '#5dff9e', 'Roof door'], ['sq', '#ff9a3e', 'Jetpack'], ['sq', '#ff5a3c', 'Parachute'],
  ['sq', '#ff5a7a', 'Health'], ['sq', '#5ec8ff', 'Armor'], ['dot', '#ff3b4e', 'Law'], ['wp', '#c77dff', 'Waypoint'],
];
const CREW_ROW = ['dot', '#b8ff3e', 'Your crew']; // (only while there's someone else in the city)
const LANDMARK_NAMES = { vac: 'VAC Gent', belpaire: 'Belpaire', teirlinck: 'Herman Teirlinck' };
function places() {
  const out = [{ x: SPAWN.x, z: SPAWN.z - 10, name: 'City General' }];
  for (const s of LANDMARK_SITES) out.push({ x: -175 + s.block[0] * 50, z: -175 + s.block[1] * 50, name: LANDMARK_NAMES[s.type] || s.type });
  for (const s of shopSpots) out.push({ x: s.x, z: s.z, name: SHOP_TYPES[s.type].name });
  if (CLUB.site) out.push({ x: CLUB.site.door.x, z: CLUB.site.door.z, name: CLUB_NAME });
  return out;
}

let view = null, from = 'play', drag = null, raf = 0, last = 0;
const el = $('worldMap'), cv = $('mapCanvas'), ctx = cv.getContext('2d');
const size = () => [cv.clientWidth || innerWidth, cv.clientHeight || innerHeight];
export const mapOpen = () => G.state === 'map';
export const mapView = () => view;

// `back` is where closing it goes: 'play', or 'paused' when it was opened from the pause menu
export function openMap(back = 'play') {
  if (G.state !== back) return;
  if (P.club) { toast('No map signal in here. Step outside first.'); return; }
  from = back; G.state = 'map'; I.mouseL = false; I.mouseR = false; for (const k in keys) keys[k] = false;
  $('pause').hidden = true; $('hud').hidden = true; el.hidden = false;
  buildLegend(); // (the crew row comes and goes)
  $('mapHelp').innerHTML = `Drag or <kbd>${kbMoveKeys()}</kbd> to pan · scroll or <kbd>+</kbd> <kbd>−</kbd> to zoom · click to set a waypoint · <kbd>${kb('map')}</kbd> or <kbd>Esc</kbd> to close`;
  const [w, h] = size(); view = openView(P.x, P.z, w, h);
  // the mouse is needed to drag the map around (the pointer lock handler sees state 'map' and doesn't pause)
  if (document.pointerLockElement) document.exitPointerLock();
  Sound.hush();
  last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
export function closeMap(fromClick) {
  if (G.state !== 'map') return;
  cancelAnimationFrame(raf); el.hidden = true; drag = null; for (const k in keys) keys[k] = false;
  if (from === 'paused') { G.state = 'paused'; $('pause').hidden = false; setTimeout(() => $('pauseMapBtn').focus(), 20); return; }
  $('hud').hidden = false; G.state = 'play'; G.hudCache = ''; requestLock(fromClick === true);
}
const kbMoveKeys = () => ['forward', 'left', 'back', 'right'].map(kb).join('');

// keys while the map is open (core/input.js hands them over); movement keys are read as held in tick()
export function mapKey(e) {
  if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(1.25);
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomBy(0.8);
  else if (e.code === 'Backspace' || e.code === 'Delete') G.waypoint = null;
}
function zoomBy(f, sx, sy) { const [w, h] = size(); view = zoomAt(view, w, h, sx ?? w / 2, sy ?? h / 2, f); }

function tick(now) {
  if (G.state !== 'map') return;
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const [w, h] = size(), sp = 700 * dt * (held('sprint') ? 2 : 1);
  const dx = (held('right') ? 1 : 0) - (held('left') ? 1 : 0), dy = (held('back') ? 1 : 0) - (held('forward') ? 1 : 0);
  view = dx || dy ? panBy(view, w, h, -dx * sp, -dy * sp) : clampView(view, w, h);
  drawMap(w, h);
}

function drawMap(w, h) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = ctx, v = view, at = (x, z) => toScreen(v, w, h, x, z);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#2e2344'; c.fillRect(0, 0, w, h);
  // the radar's map image, MAP.s pixels per metre from (MAP.x0, MAP.z0)
  const [ix, iy] = at(MAP.x0, MAP.z0), k = v.zoom / MAP.s;
  c.imageSmoothingEnabled = true; c.drawImage(mapImage(), ix, iy, mapImage().width * k, mapImage().height * k);
  // what blip(radar) draws with, sized for this screen
  const s = BLIP, painter = {
    flash: (performance.now() / 250 | 0) % 2,
    dot(x, z, col, size, edge, shape) {
      const [bx, by] = at(x, z), r = Math.max(2.5, size * s); if (bx < -20 || by < -20 || bx > w + 20 || by > h + 20) return;
      c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2;
      if (shape === 'sq') { c.fillRect(bx - r, by - r, r * 2, r * 2); c.strokeRect(bx - r, by - r, r * 2, r * 2); }
      else { c.beginPath(); c.arc(bx, by, r, 0, 7); c.fill(); c.stroke(); }
    },
    glyph(x, z, ch, col) { const [bx, by] = at(x, z); outlined(c, ch, bx, by, col, 22); },
    // a name under a marker (the rest of the crew, in multiplayer)
    label(x, z, text, col) {
      const [bx, by] = at(x, z); c.font = '700 13px "Chakra Petch", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(text, bx, by + 11); c.fillStyle = col; c.fillText(text, bx, by + 11);
    },
  };
  const blips = []; for (const e of entities) if (e.blip && !e.removed) blips.push(e);
  blips.sort((a, b) => a.blipLayer - b.blipLayer);
  for (const e of blips) e.blip(painter);
  const [hx, hy] = at(SPAWN.x, SPAWN.z); cross(c, hx, hy, 1);
  // names of places, once there is room for them
  if (v.zoom > 1.5) {
    c.font = '700 13px "Chakra Petch", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
    for (const p of places()) { const [px, py] = at(p.x, p.z); c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(p.name, px, py + 12); c.fillStyle = '#fff3fa'; c.fillText(p.name, px, py + 12); }
  }
  if (G.waypoint) { const [wx, wy] = at(G.waypoint.x, G.waypoint.z); diamond(c, wx, wy, 9, '#c77dff'); }
  // the player, pointing the way they face (forward is (sin yaw, cos yaw), as on the radar)
  const [px, py] = at(P.x, P.z);
  c.save(); c.translate(px, py); c.rotate(Math.PI - P.yaw); const pulse = 1 + 0.12 * Math.sin(performance.now() / 160);
  c.scale(pulse, pulse); c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 4.5); c.lineTo(-8, 9); c.closePath();
  c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.stroke(); c.fill(); c.restore();
  outlined(c, 'N', w - 40, 84, '#ffd23e', 26);
}

function outlined(c, ch, x, y, col, px) {
  c.font = `${px}px "Bowlby One", Impact`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = px / 5; c.strokeStyle = '#000';
  c.strokeText(ch, x, y); c.fillStyle = col; c.fillText(ch, x, y);
}
function cross(c, x, y, k) {
  c.fillStyle = '#fff'; c.fillRect(x - 9 * k, y - 3 * k, 18 * k, 6 * k); c.fillRect(x - 3 * k, y - 9 * k, 6 * k, 18 * k);
  c.fillStyle = '#ff3344'; c.fillRect(x - 7 * k, y - 2 * k, 14 * k, 4 * k); c.fillRect(x - 2 * k, y - 7 * k, 4 * k, 14 * k);
}
export function diamond(c, x, y, r, col) {
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath();
  c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2.5; c.fill(); c.stroke();
}

function buildLegend() {
  const rows = [...LEGEND]; if (all('remote').length) rows.splice(rows.length - 1, 0, CREW_ROW);
  $('mapLegend').innerHTML = rows.map(([shape, col, name]) => {
    const m = shape === '$' ? `<b style="color:${col}">$</b>` : shape === 'cross' ? '<b class="mk-cross">+</b>'
      : `<i class="mk-${shape}" style="background:${col}"></i>`;
    return `<li>${m}<span>${name}</span></li>`;
  }).join('');
}

// ---- mouse: drag to pan, wheel to zoom, click to set or clear the waypoint ----
cv.addEventListener('mousedown', e => {
  if (!mapOpen()) return;
  if (e.button === 2) { G.waypoint = null; return; }
  if (e.button === 0) drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
addEventListener('mousemove', e => {
  if (!drag || !mapOpen()) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  const [w, h] = size(); view = panBy(view, w, h, dx, dy); cv.classList.add('dragging');
});
addEventListener('mouseup', e => {
  if (!drag || !mapOpen()) { drag = null; return; }
  const click = drag.moved < 5; drag = null; cv.classList.remove('dragging');
  if (!click) return;
  const r = cv.getBoundingClientRect(), [w, h] = size(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const wp = G.waypoint;
  if (wp) { const [ax, ay] = toScreen(view, w, h, wp.x, wp.z); if (Math.hypot(ax - sx, ay - sy) < 14) { G.waypoint = null; return; } }
  const [x, z] = toWorld(view, w, h, sx, sy); G.waypoint = { x, z }; Sound.pickup();
});
cv.addEventListener('wheel', e => {
  if (!mapOpen()) return; e.preventDefault();
  const r = cv.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());
$('mapClose').addEventListener('click', () => closeMap(true));
$('pauseMapBtn').addEventListener('click', () => openMap('paused'));
