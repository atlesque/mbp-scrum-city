import { selectWeapon } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { requestLock } from '../core/input.js';
import { save } from '../core/save.js';
import { G, I, P, inv, keys } from '../core/state.js';
import { $, clamp } from '../core/util.js';
import { WBY, WEAPONS, wStat } from '../data/weapons.js';

// ================= SHOP =================
export function openShop() {
  if (G.wanted >= 4) { Sound.deny(); return; }
  G.state = 'shop'; I.mouseL = false; I.mouseR = false; keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = false;
  $('shop').hidden = false; $('hud').hidden = true; renderShop();
  try { document.exitPointerLock(); } catch (e) {}
  Sound.setSiren(0); Sound.setEngine(0, 1000);
  setTimeout(() => { const b = $('shopGrid').querySelector('button:not([disabled])') || $('shopClose'); b && b.focus(); }, 30);
}
export function closeShop(fromClick) {
  if (G.state !== 'shop') return;
  $('shop').hidden = true; $('hud').hidden = false; G.state = 'play'; save(); requestLock(fromClick === true);
}
function renderShop() {
  $('shopMoney').textContent = '$' + inv.money.toLocaleString();
  $('shopSub').textContent = G.wanted ? `Est. 1979 · Cops outside: ${'★'.repeat(G.wanted)}` : 'Est. 1979 · No questions asked';
  const maxD = 420 * 2.0, bar = (v, m) => `<i><b style="width:${clamp(v / m * 100, 4, 100)}%"></b></i>`;
  let html = '';
  for (const w of WEAPONS) {
    const own = !!inv.owned[w.id], lvl = inv.lvl[w.id] || 0, st = wStat(w, lvl);
    const dps = st.dmg * w.pellets / st.rate;
    html += `<div class="card ${own ? 'owned' : ''}"><h3><span>${w.name}</span><span class="lvl">${own ? (lvl ? 'LV ' + (lvl + 1) : 'OWNED') : '$' + w.price.toLocaleString()}</span></h3>
      <div class="stat">Damage ${bar(Math.log(st.dmg * w.pellets + 1), Math.log(maxD))}</div>
      <div class="stat">Fire rate ${bar(1 / st.rate, 24)}</div>
      <div class="stat">Mag ${bar(Math.sqrt(st.mag), Math.sqrt(300))}</div>
      <div class="small">${Math.round(st.dmg)}${w.pellets > 1 ? '×' + w.pellets : ''} dmg · ${st.mag} rounds · ${Math.round(dps)} dmg/s${own && !w.infinite ? ` · ${inv.ammo[w.id] || 0} spare` : ''}</div>
      <div class="acts">`;
    if (!own) html += `<button class="sbtn" data-a="buy" data-w="${w.id}" ${inv.money < w.price ? 'disabled' : ''}>Buy <span class="p">$${w.price.toLocaleString()}</span></button>`;
    else {
      if (lvl < 3) { const cost = w.up * (lvl + 1); html += `<button class="sbtn" data-a="up" data-w="${w.id}" ${inv.money < cost ? 'disabled' : ''}>Upgrade to LV ${lvl + 2} <span class="p">$${cost.toLocaleString()}</span></button>`; }
      else html += `<button class="sbtn" disabled>Fully upgraded</button>`;
      if (!w.infinite) html += `<button class="sbtn cy" data-a="ammo" data-w="${w.id}" ${inv.money < w.ammoPrice ? 'disabled' : ''}>+${w.ammoPack} ammo <span class="p">$${w.ammoPrice}</span></button>`;
      if (inv.cur !== w.id) html += `<button class="sbtn cy" data-a="eq" data-w="${w.id}">Equip</button>`;
    }
    html += `</div></div>`;
  }
  const hpCost = 250, arCost = 400;
  html += `<div class="card"><h3><span>Street medic</span><span class="lvl">♥ ${Math.ceil(P.hp)}/100</span></h3><div class="small">A bandage, a bottle of something, and a pat on the back.</div><div class="acts"><button class="sbtn" data-a="hp" ${inv.money < hpCost || P.hp >= 100 ? 'disabled' : ''}>Full health <span class="p">$${hpCost}</span></button></div></div>`;
  html += `<div class="card"><h3><span>Kevlar vest</span><span class="lvl">◆ ${Math.ceil(P.armor)}/100</span></h3><div class="small">Soaks up most of each bullet until it's shredded.</div><div class="acts"><button class="sbtn cy" data-a="ar" ${inv.money < arCost || P.armor >= 100 ? 'disabled' : ''}>Full armor <span class="p">$${arCost}</span></button></div></div>`;
  $('shopGrid').innerHTML = html;
}
$('shopGrid').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, w = WBY[b.dataset.w];
  const pay = (n) => { if (inv.money < n) { Sound.deny(); return false; } inv.money -= n; Sound.buy(); return true; };
  if (a === 'buy' && pay(w.price)) { inv.owned[w.id] = true; inv.lvl[w.id] = 0; inv.mag[w.id] = wStat(w, 0).mag; inv.ammo[w.id] = (inv.ammo[w.id] || 0) + w.ammoPack; selectWeapon(w.id); }
  if (a === 'up' && pay(w.up * ((inv.lvl[w.id] || 0) + 1))) { inv.lvl[w.id] = (inv.lvl[w.id] || 0) + 1; inv.mag[w.id] = wStat(w, inv.lvl[w.id]).mag; }
  if (a === 'ammo' && pay(w.ammoPrice)) inv.ammo[w.id] = (inv.ammo[w.id] || 0) + w.ammoPack;
  if (a === 'eq') { selectWeapon(w.id); Sound.pickup(); }
  if (a === 'hp' && pay(250)) P.hp = 100;
  if (a === 'ar' && pay(400)) P.armor = 100;
  save(); renderShop(); G.hudCache = '';
});
$('shopClose').addEventListener('click', () => closeShop(true));
