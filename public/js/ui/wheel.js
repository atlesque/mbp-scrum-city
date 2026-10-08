import { cycleMelee, selectWeapon } from '../combat/combat.js';
import { kb } from '../core/controls.js';
import { G, I, P, inv } from '../core/state.js';
import { $ } from '../core/util.js';
import { WBY, wStat } from '../data/weapons.js';
import { RING_ARC, SLOT_ARC, WHEEL_SLOTS, defaultItem, ownedIn, pickAt, ringOf, slotAngle, slotKeys, stepRing } from '../game/wheel.js';
import { drawIcon } from './weapon-icons.js';

// ================= WEAPON WHEEL (on screen) =================
// Hold the melee key: the wheel opens over a slowed-down game and the mouse points at a slice instead of turning the
// camera. Releasing the key (or a left click) takes the weapon pointed at, a right click puts the wheel away, and a
// quick tap without pointing anywhere still steps through the fists and melee weapons. Layout and picking: game/wheel.js.
export const WHEEL_SLOW = 0.3;  // how fast the world runs while the wheel is open
const REACH = 240;              // mouse travel, in pixels, from the centre to the rim
const TAP = 250;                // ms: a release this quick, without pointing, is a tap

const W = { open: false, x: 0, y: 0, pick: null, at: 0, pointed: false };
export const wheelOpen = () => W.open;

export function openWheel() {
  if (W.open || G.state !== 'play' || !P.alive) return;
  Object.assign(W, { open: true, x: 0, y: 0, pick: null, at: performance.now(), pointed: false });
  I.mouseL = false; // a held trigger lets go
  $('wheel').hidden = false; $('hint').style.visibility = 'hidden'; draw();
}
// equip: take the weapon pointed at (key released, left click), or just close (right click, pause, getting wasted)
export function closeWheel(equip) {
  if (!W.open) return;
  W.open = false; $('wheel').hidden = true; $('hint').style.visibility = '';
  if (!equip) return;
  if (!W.pointed && performance.now() - W.at < TAP) cycleMelee();
  else if (W.pick?.item) selectWeapon(W.pick.item);
}
export function wheelMove(dx, dy) {
  if (!W.open) return;
  let x = W.x + dx / REACH, y = W.y + dy / REACH; const r = Math.hypot(x, y);
  if (r > 1.15) { x *= 1.15 / r; y *= 1.15 / r; }
  W.x = x; W.y = y;
  // back in the middle the last pick stays, so a quick flick out and back still counts
  const p = pickAt(x, y, inv.owned, W.pick, inv.cur, P.lastMelee);
  if (p.slot >= 0) { W.pick = p; W.pointed = true; }
  draw();
}
export function wheelScroll(dir) { if (W.open && W.pick) { W.pick = stepRing(W.pick, inv.owned, dir); draw(); } }

// ----- drawing -----
const C = { pink: '#ff4fa3', cyan: '#3ef0ff', ink: '#fff3fa', dim: '#c6afdc', cash: '#86ff7a' };
const HUD_FONT = "'Bowlby One','Arial Black',Impact,sans-serif", UI_FONT = "'Chakra Petch','Trebuchet MS',sans-serif";
const ICON_SCALE = { fist: 1.25, grenade: 1.2, molotov: 1.15 };
const GAP = 0.012;

function arc(x, cx, cy, ra, rb, a0, a1) {
  // angles clockwise from straight up, as in game/wheel.js; canvas angles start at 3 o'clock
  x.beginPath(); x.arc(cx, cy, rb, a0 - Math.PI / 2, a1 - Math.PI / 2); x.arc(cx, cy, ra, a1 - Math.PI / 2, a0 - Math.PI / 2, true); x.closePath();
}
const at = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
function glow(x, color, on) { x.shadowColor = on ? color : 'transparent'; x.shadowBlur = on ? 14 : 0; }

// what the centre says about weapon id: its name, and its ammo, price or where to find it
function about(id, i) {
  const w = WBY[id];
  if (!inv.owned[id]) return [w.name, w.dropOnly ? 'Not found yet' : `$${w.price.toLocaleString()} at Bullet Bros.`];
  const group = ownedIn(i, inv.owned), of = group.length > 1 ? `${group.indexOf(id) + 1} of ${group.length}` : '';
  if (w.melee) return [w.name, `Melee${of ? ' · ' + of : ''}`];
  if (w.thrown) return [w.name, `×${inv.ammo[id] || 0}${of ? ' · ' + of : ''}`];
  const mag = inv.mag[id] ?? wStat(w, inv.lvl[id] || 0).mag;
  return [w.name, `${mag} / ${w.infinite ? '∞' : inv.ammo[id] || 0}`];
}

function draw() {
  const cv = $('wheel'), dpr = Math.min(2, devicePixelRatio || 1), vw = innerWidth, vh = innerHeight;
  if (cv.width !== Math.round(vw * dpr) || cv.height !== Math.round(vh * dpr)) { cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, vw, vh);
  x.fillStyle = 'rgba(14,6,26,.45)'; x.fillRect(0, 0, vw, vh);
  const cx = vw / 2, cy = vh / 2, r1 = Math.min(vw, vh) * 0.28, r0 = r1 * 0.42, o0 = r1 * 1.05, o1 = r1 * 1.35, k = r1 / 168;
  const hov = W.pick ? W.pick.slot : -1;

  x.fillStyle = 'rgba(23,12,40,.72)'; x.beginPath(); x.arc(cx, cy, r1 + 4, 0, Math.PI * 2); x.fill();
  WHEEL_SLOTS.forEach((s, i) => {
    const am = slotAngle(i), on = i === hov, owned = ownedIn(i, inv.owned);
    arc(x, cx, cy, r0 + 4, r1, am - SLOT_ARC / 2 + GAP, am + SLOT_ARC / 2 - GAP);
    glow(x, C.pink, on);
    x.fillStyle = on ? 'rgba(255,79,163,.30)' : 'rgba(37,20,64,.78)'; x.fill();
    x.strokeStyle = on ? C.pink : 'rgba(198,175,220,.25)'; x.lineWidth = on ? 2 : 1; x.stroke(); glow(x, 0, false);
    // the weapon it gives, or a locked gun (dimmed) or one still to find (a question mark)
    const [ix, iy] = at(cx, cy, (r0 + r1) / 2 + 6 * k, am);
    const id = on && W.pick.item ? W.pick.item : defaultItem(i, inv.owned, inv.cur, P.lastMelee) || s.items[0];
    const unknown = !owned.length && s.items.every(it => WBY[it].dropOnly);
    if (unknown) { x.fillStyle = 'rgba(198,175,220,.4)'; x.font = `${24 * k}px ${HUD_FONT}`; x.textAlign = 'center'; x.fillText('?', ix, iy + 8 * k); }
    else {
      x.globalAlpha = owned.length ? 1 : 0.28; drawIcon(x, id, ix, iy, 0.3 * k * (ICON_SCALE[id] || 1)); x.globalAlpha = 1;
      if (!owned.length) { const [lx, ly] = at(cx, cy, (r0 + r1) / 2 - 22 * k, am); x.fillStyle = 'rgba(198,175,220,.5)'; x.font = `700 ${9 * k}px ${UI_FONT}`; x.textAlign = 'center'; x.fillText('LOCKED', lx, ly + 4 * k); }
    }
    const [kx, ky] = at(cx, cy, r1 - 13 * k, am);
    x.fillStyle = on ? C.pink : 'rgba(198,175,220,.7)'; x.font = `${10 * k}px ${HUD_FONT}`; x.textAlign = 'center'; x.fillText(slotKeys(i, kb('melee')), kx, ky + 4 * k);
    // a closed group: one tick on the rim per weapon in it
    if (!on && owned.length > 1) {
      x.fillStyle = 'rgba(62,240,255,.55)';
      for (let t = 0; t < owned.length; t++) { const c = am + (t - (owned.length - 1) / 2) * 0.07; arc(x, cx, cy, r1 + 5, r1 + 10, c - 0.027, c + 0.027); x.fill(); }
    }
  });

  // the open group's outer ring
  const ring = hov >= 0 ? ringOf(hov, inv.owned) : null;
  if (ring) ring.items.forEach((id, t) => {
    const a0 = ring.start + t * RING_ARC + GAP, a1 = ring.start + (t + 1) * RING_ARC - GAP, on = id === W.pick.item;
    arc(x, cx, cy, o0, o1, a0, a1); glow(x, C.cyan, on);
    x.fillStyle = on ? 'rgba(62,240,255,.28)' : 'rgba(23,12,40,.85)'; x.fill();
    x.strokeStyle = on ? C.cyan : 'rgba(62,240,255,.35)'; x.lineWidth = on ? 2 : 1; x.stroke(); glow(x, 0, false);
    const [ix, iy] = at(cx, cy, (o0 + o1) / 2, (a0 + a1) / 2); drawIcon(x, id, ix, iy, 0.22 * k * (ICON_SCALE[id] || 1));
  });
  // where the mouse points
  if (Math.hypot(W.x, W.y) > 0.05) {
    const a = Math.atan2(W.x, -W.y), [px, py] = at(cx, cy, (ring && W.pick.ring ? o1 : r1) + 12 * k, a);
    x.fillStyle = ring && W.pick.ring ? C.cyan : C.pink; glow(x, x.fillStyle, true); x.beginPath(); x.arc(px, py, 4 * k, 0, Math.PI * 2); x.fill(); glow(x, 0, false);
  }

  // the centre: the weapon pointed at (or in hand) and its ammo
  const hub = x.createRadialGradient(cx, cy, 0, cx, cy, r0); hub.addColorStop(0, '#2a1648'); hub.addColorStop(1, '#170c28');
  x.fillStyle = hub; x.beginPath(); x.arc(cx, cy, r0, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(255,79,163,.6)'; x.lineWidth = 1.5; x.stroke();
  const showId = W.pick?.item || (hov >= 0 ? WHEEL_SLOTS[hov].items[0] : inv.cur);
  const slotOf = WHEEL_SLOTS.findIndex(s => s.items.includes(showId));
  const [name, sub] = about(showId, slotOf);
  x.textAlign = 'center'; x.fillStyle = C.ink; x.font = `${(name.length > 11 ? 12 : 15) * k}px ${HUD_FONT}`; x.fillText(name.toUpperCase(), cx, cy + 2 * k);
  x.fillStyle = WBY[showId].melee || WBY[showId].thrown ? C.cyan : inv.owned[showId] ? C.cash : C.dim;
  x.font = `700 ${11 * k}px ${UI_FONT}`; x.fillText(sub.toUpperCase(), cx, cy + 22 * k);

  x.font = `600 13px ${UI_FONT}`; x.fillStyle = C.dim;
  x.fillText(`Point with the mouse · scroll for the next in a group · release ${kb('melee')} or click to take it · right click to cancel`, cx, vh - 28);
}
