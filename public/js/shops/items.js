import { WBY, wStat } from '../data/weapons.js';

// What a shop can sell. Each item type renders its card and carries out the buttons on it.
//   render(item, ctx)        -> card HTML; buttons carry data-a (the action) and data-i (the item's index)
//   act(item, action, ctx)   -> true when something happened
// ctx: { inv, player, pay(price) -> bool, equip(weaponId) }. No DOM or sound here, so it is unit-testable.
const clampPct = (v, m) => Math.max(4, Math.min(100, v / m * 100));
const bar = (v, m) => `<i><b style="width:${clampPct(v, m)}%"></b></i>`;
const money = n => '$' + n.toLocaleString();
const btn = (i, a, label, price, enabled, cls = '') => `<button class="sbtn${cls ? ' ' + cls : ''}" data-a="${a}" data-i="${i}" ${enabled ? '' : 'disabled'}>${label}${price != null ? ` <span class="p">${money(price)}</span>` : ''}</button>`;
export const upgradeCost = (w, lvl) => w.up * (lvl + 1);
export const MAX_LEVEL = 3;

export const ITEM_TYPES = {
  weapon: {
    render(item, ctx, i) {
      const { inv } = ctx, w = WBY[item.id], found = !!(inv.owned[w.id] && inv.found?.[w.id]), own = !!inv.owned[w.id] && !found, lvl = inv.lvl[w.id] || 0, st = wStat(w, lvl);
      const dps = st.dmg * w.pellets / st.rate, maxD = 420 * 2.0;
      let html = `<div class="card ${own ? 'owned' : ''}"><h3><span>${w.name}</span><span class="lvl">${own ? (lvl ? 'LV ' + (lvl + 1) : 'OWNED') : found ? 'PICKED UP' : money(w.price)}</span></h3>
      <div class="stat">Damage ${bar(Math.log(st.dmg * w.pellets + 1), Math.log(maxD))}</div>`;
      if (w.melee) html += `<div class="stat">Speed ${bar(1 / st.rate, 12)}</div>
      <div class="stat">Reach ${bar(w.reach, 2.4)}</div>
      <div class="small">${Math.round(st.dmg)} dmg · ${w.reach} m reach · ${Math.round(dps)} dmg/s${w.blade ? ' · bladed' : ''}${w.hits > 1 ? ` · hits ${w.hits} at once` : ''}</div>`;
      else html += `
      <div class="stat">Fire rate ${bar(1 / st.rate, 24)}</div>
      <div class="stat">Mag ${bar(Math.sqrt(st.mag), Math.sqrt(300))}</div>
      <div class="small">${Math.round(st.dmg)}${w.pellets > 1 ? '×' + w.pellets : ''} dmg · ${st.mag} rounds · ${Math.round(dps)} dmg/s${st.blastMul > 1 ? ` · +${Math.round((st.blastMul - 1) * 100)}% blast radius` : ''}${own && !w.infinite ? ` · ${inv.ammo[w.id] || 0} spare` : ''}</div>`;
      html += `<div class="acts">`;
      // a picked-up weapon is lost when the player gets wasted; buying it keeps it (and opens upgrades)
      if (found) { html += btn(i, 'buy', 'Buy to keep', w.price, inv.money >= w.price); if (inv.cur !== w.id) html += btn(i, 'eq', 'Equip', null, true, 'cy'); }
      else if (!own) html += btn(i, 'buy', 'Buy', w.price, inv.money >= w.price);
      else {
        if (lvl < MAX_LEVEL) { const cost = upgradeCost(w, lvl); html += btn(i, 'up', `Upgrade to LV ${lvl + 2}`, cost, inv.money >= cost); }
        else html += `<button class="sbtn" disabled>Fully upgraded</button>`;
        if (!w.infinite) html += btn(i, 'ammo', `+${w.ammoPack} ammo`, w.ammoPrice, inv.money >= w.ammoPrice, 'cy');
        if (inv.cur !== w.id) html += btn(i, 'eq', 'Equip', null, true, 'cy');
      }
      return html + `</div></div>`;
    },
    act(item, a, ctx) {
      const { inv } = ctx, w = WBY[item.id], lvl = inv.lvl[w.id] || 0, found = !!(inv.owned[w.id] && inv.found?.[w.id]);
      if (a === 'buy' && found && ctx.pay(w.price)) { delete inv.found[w.id]; if (!w.melee) inv.ammo[w.id] = (inv.ammo[w.id] || 0) + w.ammoPack; ctx.equip(w.id); return true; }
      if (found && a !== 'eq') return false;
      if (a === 'buy' && !inv.owned[w.id] && ctx.pay(w.price)) { inv.owned[w.id] = true; inv.lvl[w.id] = 0; inv.mag[w.id] = wStat(w, 0).mag; if (!w.melee) inv.ammo[w.id] = (inv.ammo[w.id] || 0) + w.ammoPack; ctx.equip(w.id); return true; }
      if (a === 'up' && inv.owned[w.id] && lvl < MAX_LEVEL && ctx.pay(upgradeCost(w, lvl))) { inv.lvl[w.id] = lvl + 1; inv.mag[w.id] = wStat(w, lvl + 1).mag; return true; }
      if (a === 'ammo' && inv.owned[w.id] && !w.infinite && ctx.pay(w.ammoPrice)) { inv.ammo[w.id] = (inv.ammo[w.id] || 0) + w.ammoPack; return true; }
      if (a === 'eq' && inv.owned[w.id]) { ctx.equip(w.id); return true; }
      return false;
    },
  },
  heal: {
    render(item, { inv, player }, i) {
      return `<div class="card"><h3><span>${item.name}</span><span class="lvl">♥ ${Math.ceil(player.hp)}/100</span></h3><div class="small">${item.blurb}</div><div class="acts">${btn(i, 'buy', 'Full health', item.price, inv.money >= item.price && player.hp < 100)}</div></div>`;
    },
    act(item, a, ctx) { if (a === 'buy' && ctx.player.hp < 100 && ctx.pay(item.price)) { ctx.player.hp = 100; return true; } return false; },
  },
  armor: {
    render(item, { inv, player }, i) {
      return `<div class="card"><h3><span>${item.name}</span><span class="lvl">◆ ${Math.ceil(player.armor)}/100</span></h3><div class="small">${item.blurb}</div><div class="acts">${btn(i, 'buy', 'Full armor', item.price, inv.money >= item.price && player.armor < 100, 'cy')}</div></div>`;
    },
    act(item, a, ctx) { if (a === 'buy' && ctx.player.armor < 100 && ctx.pay(item.price)) { ctx.player.armor = 100; return true; } return false; },
  },
};
