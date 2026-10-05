import { on } from '../core/events.js';
import { G, stats } from '../core/state.js';
import { rnd } from '../core/util.js';
import { WANTED, mixPick } from '../data/wanted.js';
import { spawnNpc } from '../npcs/npc.js';
import { toast } from '../ui/hud.js';
import { isFree } from '../world/collision.js';
import { dropCash } from './pickups.js';
import { addHeat } from './wanted.js';

// ================= REWARDS =================
// What the player earns (and the heat they draw) is decided here, by listening to game events,
// so NPCs and vehicles don't need to know about money or the wanted system.
const cashOf = c => Array.isArray(c) ? Math.round(rnd(c[0], c[1])) : c || 0;
let toldRide = false;

on('npc:killed', ({ npc, byPlayer, vehicle }) => {
  if (vehicle && byPlayer && !toldRide) { toldRide = true; setTimeout(() => toast(`That ${vehicle.model.name} is up for grabs. Walk over and press <em>F</em> to ${vehicle.K.verb} it.`, 5), 600); }
  if (!byPlayer) return;
  const def = npc.def;
  stats.kills++; if (npc.faction === 'law') stats.cops++;
  addHeat(def.heat || 0);
  const cash = cashOf(def.cash); if (cash > 0) dropCash(npc.x, npc.z, cash);
});

on('vehicle:wrecked', ({ vehicle, byPlayer }) => {
  if (!byPlayer) return;
  const r = vehicle.K.wreckReward || {};
  if (r.heat) addHeat(r.heat);
  const cash = cashOf(r.cash); if (cash > 0) dropCash(vehicle.x + rnd(-2, 2), vehicle.z + rnd(-2, 2), cash);
});

// dragging someone out of their car is a crime
on('vehicle:jacked', () => addHeat(2));

// a police car that reaches the player lets two officers out, one on each side
on('police:arrived', ({ vehicle: c }) => {
  if (G.wanted <= 0) return;
  const lvl = WANTED[Math.max(1, G.wanted)];
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1, x = c.x + (c.dirZ ? side * 2.2 : side * 0.8), z = c.z + (c.dirX ? side * 2.2 : side * 0.8);
    if (isFree(x, z, 0.5)) spawnNpc(mixPick(lvl.mix), x, z);
  }
});
