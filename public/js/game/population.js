import { DENSITY, settings } from '../core/settings.js';
import { G, P } from '../core/state.js';
import { pick } from '../core/util.js';
import { all, count, removeEntity } from '../entities/registry.js';
import { findSpot, spawnNpc } from '../npcs/npc.js';
import { spawnTrafficBike, spawnTrafficCar } from '../vehicles/traffic.js';
import { crew } from './crew.js';

// ================= POPULATION =================
// How busy the city is. Each row keeps `target()` of whatever `counts` matches alive near the player,
// calling `spawn()` up to `perTick` times every half second. Add a row to populate a new NPC or vehicle type.
// busy() scales a target by the player's Crowds and traffic setting.
// Rows marked `world` are the crew's in multiplayer: only the host's game spawns them (game/crew.js runsWorld, net/world.js),
// and riders turn up near any of the crew.
const busy = n => Math.round(n * (DENSITY[settings.density] || 1));
const anyone = () => pick([P, ...crew.others()]);
export const POPULATION = [
  { id: 'civilians', perTick: 4, target: () => busy(G.wanted >= 3 ? 26 : 38),
    counts: e => (e.kind === 'npc' || e.kind === 'ghost') && e.type === 'civilian' && e.alive, // (another player's people nearby count too)
    spawn: () => { const s = findSpot(G.state === 'title' ? 10 : 45, 95, G.state !== 'title', false); return s && spawnNpc('civilian', s.x, s.z); } },
  { id: 'traffic', perTick: 1, world: true, target: () => busy(22),
    counts: e => e.kind === 'vehicle' && e.model.kind === 'car' && e.mode === 'traffic' && !e.dead,
    spawn: () => spawnTrafficCar(true) },
  { id: 'bikers', perTick: 1, world: true, target: () => busy(4),
    counts: e => e.kind === 'vehicle' && e.model.kind === 'bike' && e.driver && e.driver.kind === 'npc',
    spawn: () => spawnTrafficBike('bike', 'biker', null, anyone()) },
  { id: 'steppers', perTick: 1, world: true, target: () => busy(5),
    counts: e => e.kind === 'vehicle' && e.model.kind === 'step' && e.driver && e.driver.kind === 'npc',
    spawn: () => spawnTrafficBike('step', 'stepper', null, anyone()) },
  // the one guy on the pimped e-step (models/pimpstep.js); take his ride and another one turns up
  { id: 'stepking', perTick: 1, world: true, target: () => 1,
    counts: e => e.kind === 'vehicle' && e.model.id === 'pimpstep' && e.driver && e.driver.kind === 'npc',
    spawn: () => spawnTrafficBike('step', 'stepking', 'pimpstep', anyone()) },
];

export function managePopulation(dt) {
  managePopulation.t = (managePopulation.t || 0) - dt; if (managePopulation.t > 0) return; managePopulation.t = 0.5;
  // anything that has wandered off or has lain there long enough
  for (const e of all()) if (e.shouldDespawn && e.shouldDespawn()) removeEntity(e);
  const host = crew.runsWorld();
  for (const row of POPULATION) {
    if (row.world && !host) continue;
    let n = count(row.counts), tries = 0;
    while (n < row.target() && tries++ < row.perTick) if (row.spawn()) n++;
  }
}
