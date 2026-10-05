import { G } from '../core/state.js';
import { all, count, removeEntity } from '../entities/registry.js';
import { findSpot, spawnNpc } from '../npcs/npc.js';
import { spawnTrafficBike, spawnTrafficCar } from '../vehicles/traffic.js';

// ================= POPULATION =================
// How busy the bay is. Each row keeps `target()` of whatever `counts` matches alive near the player,
// calling `spawn()` up to `perTick` times every half second. Add a row to populate a new NPC or vehicle type.
export const POPULATION = [
  { id: 'civilians', perTick: 4, target: () => G.wanted >= 3 ? 26 : 38,
    counts: e => e.kind === 'npc' && e.type === 'civilian' && e.alive,
    spawn: () => { const s = findSpot(G.state === 'title' ? 10 : 45, 95, G.state !== 'title', false); return s && spawnNpc('civilian', s.x, s.z); } },
  { id: 'traffic', perTick: 1, target: () => 22,
    counts: e => e.kind === 'vehicle' && e.model.kind === 'car' && e.mode === 'traffic' && !e.dead,
    spawn: () => spawnTrafficCar(true) },
  { id: 'bikers', perTick: 1, target: () => 4,
    counts: e => e.kind === 'vehicle' && e.model.kind === 'bike' && e.driver && e.driver.kind === 'npc',
    spawn: () => spawnTrafficBike() },
];

export function managePopulation(dt) {
  managePopulation.t = (managePopulation.t || 0) - dt; if (managePopulation.t > 0) return; managePopulation.t = 0.5;
  // anything that has wandered off or has lain there long enough
  for (const e of all()) if (e.shouldDespawn && e.shouldDespawn()) removeEntity(e);
  for (const row of POPULATION) {
    let n = count(row.counts), tries = 0;
    while (n < row.target() && tries++ < row.perTick) if (row.spawn()) n++;
  }
}
