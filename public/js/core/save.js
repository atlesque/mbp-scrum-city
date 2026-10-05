import { inv, stats } from './state.js';
import { WEAPONS, wStat } from '../data/weapons.js';

// ================= SAVE =================
// Saves carry a version. When the shape changes, bump SAVE_VERSION and add a step to MIGRATIONS that
// upgrades the previous version, so old saves in players' browsers keep loading.
export const SAVE_KEY = 'neonbay86';
export const SAVE_VERSION = 2;
const MIGRATIONS = {
  // v1 (no version field): { money, owned, lvl, ammo, stats }
  1: d => ({ v: 2, money: d.money, weapons: { owned: d.owned || {}, lvl: d.lvl || {}, ammo: d.ammo || {} }, stats: d.stats || {} }),
};
export function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  let v = d.v || 1;
  while (v < SAVE_VERSION) { if (!MIGRATIONS[v]) return null; d = MIGRATIONS[v](d); v = d.v; }
  return v === SAVE_VERSION ? d : null;
}
export function serialize(inv, stats) {
  return { v: SAVE_VERSION, money: inv.money, weapons: { owned: inv.owned, lvl: inv.lvl, ammo: inv.ammo }, stats };
}
export function apply(d, inv, stats) {
  if (typeof d.money === 'number') inv.money = d.money;
  Object.assign(inv.owned, d.weapons.owned); Object.assign(inv.lvl, d.weapons.lvl); Object.assign(inv.ammo, d.weapons.ammo);
  Object.assign(stats, d.stats);
}

export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(inv, stats))); } catch (e) {}
}
export function load(data) {
  let d = data && data.inv ? data.inv : null;
  if (!d) try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
  d = migrate(d); if (!d) return;
  apply(d, inv, stats);
  for (const w of WEAPONS) if (inv.owned[w.id]) { inv.lvl[w.id] = inv.lvl[w.id] || 0; inv.mag[w.id] = wStat(w, inv.lvl[w.id]).mag; }
}
