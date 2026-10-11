import { freshTeam, selectPokemon, SPECIES, xpToNextLevel } from '../pokemon/team.js';
import { REPAIR, WBY, wStat } from '../data/weapons.js';

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

// the repair tool's card: how quick it fixes and how long the charge lasts, then buy (or buy to keep) and equip
function toolCard(w, inv, i, own, found) {
  let html = `<div class="card ${own ? 'owned' : ''}"><h3><span>${w.name}</span><span class="lvl">${own ? 'OWNED' : found ? 'PICKED UP' : money(w.price)}</span></h3>
      <div class="stat">Repair ${bar(REPAIR.rate, 0.25)}</div>
      <div class="stat">Charge ${bar(REPAIR.charge, 8)}</div>
      <div class="small">Hold fire up close to fix any vehicle and put out its fire · good as new in ${Math.round(1 / REPAIR.rate)} s · ${REPAIR.charge} s charge, refills on its own</div><div class="acts">`;
  if (found) html += btn(i, 'buy', 'Buy to keep', w.price, inv.money >= w.price);
  else if (!own) html += btn(i, 'buy', 'Buy', w.price, inv.money >= w.price);
  if ((own || found) && inv.cur !== w.id) html += btn(i, 'eq', 'Equip', null, true, 'cy');
  return html + `</div></div>`;
}

export const ITEM_TYPES = {
  pokeballs: {
    render(item, { inv }, i) {
      const team = inv.pokemon || freshTeam();
      return `<div class="card"><h3><span>Poké Balls ×${item.amount}</span><span class="lvl">${team.balls} IN BAG</span></h3><div class="small">Approach a wild Pokémon and press the use key to throw. Each attempt uses one ball.</div><div class="acts">${btn(i, 'buy', 'Buy pack', item.price, inv.money >= item.price && team.balls <= 999 - item.amount)}</div></div>`;
    },
    act(item, a, ctx) {
      const team = ctx.inv.pokemon ||= freshTeam();
      if (a !== 'buy' || team.balls > 999 - item.amount || !ctx.pay(item.price)) return false;
      team.balls += item.amount; return true;
    },
  },
  pokemonTeam: {
    render(item, { inv }, i) {
      const team = inv.pokemon || freshTeam();
      return `<div class="card"><h3><span>Your Pokémon</span><span class="lvl">${team.party.length}/6</span></h3><div class="small">Select a partner to follow and help battle NPCs you attack. Fainted partners rest until healed.</div><div class="acts">${btn(i, 'heal', 'Heal team · free', null, team.party.some(p => p.hp < 100), 'cy')}${btn(i, 'recall', 'Recall partner', null, team.selected >= 0)}</div>${team.party.map((p, n) => `<div class="small">${SPECIES[p.species].name} Lv ${p.level || 1} · ${SPECIES[p.species].move} · HP ${Math.ceil(p.hp)}/100 ${team.selected === n ? '· FOLLOWING' : ''} · XP ${p.xp || 0}/${xpToNextLevel(p.level || 1)}${SPECIES[p.species].evolveLevel ? ' · evolves at Lv ' + SPECIES[p.species].evolveLevel : SPECIES[p.species].evolutionItem ? ' · ' + (SPECIES[p.species].evolutionItem === 'leafstone' ? 'Leaf Stone' : 'Thunder Stone') + ' evolution' : ''}</div><div class="acts">${btn(i, 'select:' + n, 'Select ' + SPECIES[p.species].name, null, p.hp > 0 && team.selected !== n, 'cy')}${SPECIES[p.species].evolutionItem ? btn(i, 'evolve:' + n, (SPECIES[p.species].evolutionItem === 'leafstone' ? 'Leaf Stone' : 'Thunder Stone') + ' → ' + SPECIES[SPECIES[p.species].evolvesTo].name, 300, inv.money >= 300) : ''}</div>`).join('')}${team.party.length ? '' : '<div class="small">Your first catch becomes your partner. Five starter balls are in your bag.</div>'}</div>`;
    },
    act(item, a, ctx) {
      const team = ctx.inv.pokemon ||= freshTeam();
      if (a === 'heal') { for (const p of team.party) p.hp = 100; return true; }
      if (a === 'recall') return selectPokemon(team, -1);
      if (/^evolve:\d+$/.test(a)) {
        const p = team.party[+a.split(':')[1]], def = p && SPECIES[p.species];
        if (!['thunderstone', 'leafstone'].includes(def?.evolutionItem) || !ctx.pay(300)) return false;
        p.species = def.evolvesTo; return true;
      }
      if (/^select:\d+$/.test(a)) return selectPokemon(team, +a.split(':')[1]);
      return false;
    },
  },
  weapon: {
    render(item, ctx, i) {
      const { inv } = ctx, w = WBY[item.id], found = !!(inv.owned[w.id] && inv.found?.[w.id]), own = !!inv.owned[w.id] && !found, lvl = inv.lvl[w.id] || 0, st = wStat(w, lvl);
      if (w.tool) return toolCard(w, inv, i, own, found);
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
      if (w.tool && (a === 'up' || a === 'ammo')) return false; // no upgrades and nothing to load
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
