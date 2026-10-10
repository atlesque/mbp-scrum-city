import { kb } from '../core/controls.js';
import { on } from '../core/events.js';
import { G, stats } from '../core/state.js';
import { rnd } from '../core/util.js';
import { WANTED, crewMix, mixPick } from '../data/wanted.js';
import { spawnNpc } from '../npcs/npc.js';
import { toast } from '../ui/hud.js';
import { isFree } from '../world/collision.js';
import { dropCash, dropItem, dropWeapon } from './pickups.js';
import { addHeat } from './wanted.js';

// ================= REWARDS =================
// What the player earns (and the heat they draw) is decided here, by listening to game events,
// so NPCs and vehicles don't need to know about money or the wanted system.
const cashOf = c => Array.isArray(c) ? Math.round(rnd(c[0], c[1])) : c || 0;
let toldRide = false;

on('npc:killed', ({ npc, byPlayer, vehicle }) => {
  if (vehicle && byPlayer && !toldRide) { toldRide = true; setTimeout(() => toast(`That ${vehicle.model.name} is up for grabs. Walk over and press <em>${kb('ride')}</em> to ${vehicle.K.verb} it.`, 5), 600); }
  if (!byPlayer) return;
  const def = npc.def;
  stats.kills++; if (npc.faction === 'law') stats.cops++;
  addHeat(def.heat || 0);
  const cash = cashOf(def.cash); if (cash > 0) dropCash(npc.x, npc.z, cash);
  for (const [type, chance] of Object.entries(def.drops || {})) if (Math.random() < chance) dropItem(type, npc.x + rnd(-1.2, 1.2), npc.z + rnd(-1.2, 1.2));
  for (const [id, chance] of Object.entries(def.weaponDrops || {})) if (Math.random() < chance) dropWeapon(id, npc.x + rnd(-1, 1), npc.z + rnd(-1, 1));
});

on('vehicle:wrecked', ({ vehicle, byPlayer }) => {
  if (!byPlayer) return;
  const r = vehicle.K.wreckReward || {};
  if (r.heat) addHeat(r.heat);
  const cash = cashOf(r.cash); if (cash > 0) dropCash(vehicle.x + rnd(-2, 2), vehicle.z + rnd(-2, 2), cash);
});

// dragging someone out of their car is a crime
on('vehicle:jacked', () => addHeat(2));
// a driver pulled out of their car or scared off it may leave something behind on the road (leaveDrops in npcs/types.js)
export function leaveBehind(driver, rand = Math.random) {
  const out = [];
  for (const [id, chance] of Object.entries(driver?.def?.leaveDrops || {})) if (rand() < chance) out.push(dropWeapon(id, driver.x + rnd(-0.8, 0.8), driver.z + rnd(-0.8, 0.8)));
  return out;
}
on('vehicle:jacked', ({ driver }) => leaveBehind(driver));
on('vehicle:scared', ({ driver }) => leaveBehind(driver));

// a police car or army truck that reaches the player lets its crew out: two officers from a cruiser, one each side; soldiers
// from a truck, two from the cab and the rest jumping off the back. Each brings only who rides in it (RIDES in data/wanted.js).
on('police:arrived', ({ vehicle: c }) => {
  if (G.wanted <= 0) return;
  const mix = crewMix(WANTED[Math.max(1, G.wanted)].mix, c.model.id) || crewMix(WANTED[5].mix, c.model.id);
  if (!mix) return;
  for (const [side, back] of crewSpots(c)) {
    const fx = c.dirX, fz = c.dirZ, x = c.x + fz * side + fx * back, z = c.z - fx * side + fz * back;
    if (isFree(x, z, 0.5)) spawnNpc(mixPick(mix), x, z);
  }
});
// where each of a vehicle's crew gets out, as [sideways, along] from its middle
export function crewSpots(c) {
  const n = c.model.crew || 2, w = c.K.body.hw + 1, back = -c.K.body.hl - 1, out = [[-w, 0], [w, 0]];
  for (let k = 2; k < n; k++) out.push([(k % 2 ? 1 : -1) * 0.8, back - Math.floor((k - 2) / 2) * 1.2]);
  return out.slice(0, n);
}
