import { inv, stats } from './state.js';
import { WEAPONS, wStat } from '../data/weapons.js';

export function save() {
  try { localStorage.setItem('neonbay86', JSON.stringify({ money: inv.money, owned: inv.owned, lvl: inv.lvl, ammo: inv.ammo, stats })); } catch (e) {}
}
export function load(data) {
  let d = data && data.inv ? data.inv : null;
  if (!d) try { d = JSON.parse(localStorage.getItem('neonbay86') || 'null'); } catch (e) {}
  if (!d) return;
  if (typeof d.money === 'number') inv.money = d.money;
  if (d.owned) Object.assign(inv.owned, d.owned);
  if (d.lvl) Object.assign(inv.lvl, d.lvl);
  if (d.ammo) Object.assign(inv.ammo, d.ammo);
  if (d.stats) Object.assign(stats, d.stats);
  for (const w of WEAPONS) if (inv.owned[w.id]) { inv.lvl[w.id] = inv.lvl[w.id] || 0; inv.mag[w.id] = wStat(w, inv.lvl[w.id]).mag; }
}
