import { curWeapon } from '../combat/combat.js';
import { settings } from '../core/settings.js';
import { RADAR_GLOW, RADAR_PULSE_FROM } from '../data/wanted.js';
import { G, I, P, inv } from '../core/state.js';
import { $, clamp } from '../core/util.js';
import { hintShown } from '../game/hint.js';

// ================= HUD =================
export function drawWeaponIcon() {
  const c = $('wicon'), x = c.getContext('2d'), id = inv.cur; x.clearRect(0, 0, 240, 112);
  x.save(); x.translate(120, 56); x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 6; x.lineJoin = 'round';
  const shapes = {
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
    grenade: [[-30, -24, 60, 64], [-36, -12, 72, 10], [-36, 10, 72, 10], [-12, -40, 24, 18], [12, -36, 14, 50], [-30, -52, 16, 14]],
    molotov: [[-28, -10, 56, 60], [-12, -36, 24, 28], [-8, -50, 16, 16], [-4, -64, 14, 16]],
  };
  for (const s of shapes[id]) { x.strokeRect(s[0], s[1], s[2], s[3]); }
  for (const s of shapes[id]) { x.fillRect(s[0], s[1], s[2], s[3]); }
  x.restore();
}
export function updateHUD() {
  const w = curWeapon(), mag = inv.mag[w.id] || 0;
  const ammoStr = w.melee ? '' : w.thrown ? `${inv.ammo[w.id] || 0}` : G.reloadT > 0 ? 'Reloading' : `${mag}<span>/${w.infinite ? '∞' : (inv.ammo[w.id] || 0)}</span>`;
  const key = [ammoStr, w.name, Math.ceil(P.hp), Math.ceil(P.armor), inv.money, G.wanted].join('|');
  if (key !== G.hudCache) {
    G.hudCache = key;
    $('ammo').innerHTML = ammoStr; $('wname').textContent = w.name; $('crosshair').style.opacity = w.melee ? '0.45' : '';
    $('hpNum').textContent = Math.max(0, Math.ceil(P.hp)); $('hpFill').style.width = clamp(P.hp, 0, 100) + '%';
    $('arNum').textContent = Math.ceil(P.armor); $('arFill').style.width = clamp(P.armor, 0, 100) + '%';
    $('money').textContent = '$' + String(Math.max(0, inv.money)).padStart(8, '0');
    [...$('stars').children].forEach((s, i) => s.classList.toggle('on', i < G.wanted));
    const radar = $('radarWrap'); radar.style.setProperty('--heat', RADAR_GLOW[G.wanted] || 0); radar.classList.toggle('pulse', G.wanted >= RADAR_PULSE_FROM);
  }
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
