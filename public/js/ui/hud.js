import { curWeapon } from '../combat/combat.js';
import { settings } from '../core/settings.js';
import { RADAR_GLOW, RADAR_PULSE_FROM } from '../data/wanted.js';
import { G, I, P, inv, stats } from '../core/state.js';
import { $, clamp, clock } from '../core/util.js';
import { hintShown } from '../game/hint.js';
import { REPAIR, tool } from '../game/repair.js';
import { flyingHeli, heliGunHud } from '../vehicles/heli-guns.js';
import { drawIcon } from './weapon-icons.js';

// ================= HUD =================
export function drawWeaponIcon(id = inv.cur) {
  const c = $('wicon'), x = c.getContext('2d'); x.clearRect(0, 0, 240, 112); updateHUD.icon = id;
  drawIcon(x, id, 120, 56);
}
export function updateHUD() {
  // flying a chopper, its own guns are shown instead of the one in hand
  const heli = flyingHeli(), hg = heli && heliGunHud(heli);
  const w = curWeapon(), mag = inv.mag[w.id] || 0;
  const ammoStr = hg ? hg.ammo : w.melee ? '' : w.tool ? `${Math.round(tool.charge / REPAIR.charge * 100)}<span>%</span>` : w.thrown ? `${inv.ammo[w.id] || 0}` : G.reloadT > 0 ? 'Reloading' : `${mag}<span>/${w.infinite ? '∞' : (inv.ammo[w.id] || 0)}</span>`;
  const name = hg ? hg.name : w.name, icon = hg ? hg.icon : inv.cur;
  if (icon !== updateHUD.icon) drawWeaponIcon(icon);
  const key = [ammoStr, name, Math.ceil(P.hp), Math.ceil(P.armor), inv.money, G.wanted].join('|');
  if (key !== G.hudCache) {
    G.hudCache = key;
    $('ammo').innerHTML = ammoStr; $('wname').textContent = name; $('crosshair').style.opacity = w.melee && !hg ? '0.45' : '';
    $('hpNum').textContent = Math.max(0, Math.ceil(P.hp)); $('hpFill').style.width = clamp(P.hp, 0, 100) + '%';
    $('arNum').textContent = Math.ceil(P.armor); $('arFill').style.width = clamp(P.armor, 0, 100) + '%';
    $('money').textContent = '$' + String(Math.max(0, inv.money)).padStart(8, '0');
    [...$('stars').children].forEach((s, i) => s.classList.toggle('on', i < G.wanted));
    const radar = $('radarWrap'); radar.style.setProperty('--heat', RADAR_GLOW[G.wanted] || 0); radar.classList.toggle('pulse', G.wanted >= RADAR_PULSE_FROM); radar.classList.toggle('alien', G.wanted >= 6);
  }
  // at five stars (and six) the five star heat highscore ticks up under the stars
  const five = G.wanted >= 5 ? clock(stats.fiveStar || 0) : '';
  if (five !== updateHUD.five) { updateHUD.five = five; $('heatClock').hidden = !five; if (five) $('heatClockNum').textContent = five; }
  const v = P.vehicle, mph = settings.units === 'mph', spd = v ? Math.round(Math.abs(v.v) * (mph ? 2.237 : 3.6)) : -1, sk = spd + settings.units;
  const shown = hintShown() && $('settings').hidden, paused = G.state === 'paused', hk = `${shown}${!!v}${paused}`;
  if (hk !== updateHUD.hint) { updateHUD.hint = hk; const h = $('hint'); h.hidden = !shown; h.classList.toggle('up', !!v); h.classList.toggle('top', paused); }
  if (sk !== updateHUD.spd) {
    updateHUD.spd = sk; $('speedo').hidden = spd < 0;
    if (spd >= 0) { $('kmh').textContent = String(spd).padStart(3, '0'); $('spdUnit').textContent = mph ? 'mph' : 'km/h'; }
  }
  if (v) $('vehHp').style.width = clamp(v.hp / v.model.hp * 100, 0, 100) + '%';
  if (G.hitT > 0) { G.hitT -= 1 / 60; if (G.hitT <= 0) $('crosshair').className = ''; }
  const spread = (P.moveSpeed > 6 ? 2 : P.moveSpeed > 1 ? 1.4 : 1) * (I.mouseR ? 0.55 : 1) * w.spread * 300;
  const off = clamp(spread, 0, 16);
  const ch = $('crosshair').children; ch[0].style.transform = `translateY(${-off}px)`; ch[1].style.transform = `translateY(${off}px)`; ch[2].style.transform = `translateX(${-off}px)`; ch[3].style.transform = `translateX(${off}px)`;
}
export function toast(html, dur = 4.5) { const t = $('toast'); t.innerHTML = html; t.classList.add('show'); G.toastT = dur; }
export function showBig(text) { const b = $('bigText'); b.textContent = text; b.classList.add('show'); G.bigT = 2.4; }
export function showRadio(text) { const r = $('radio'); r.textContent = text; r.classList.add('show'); G.radioT = 3; }
