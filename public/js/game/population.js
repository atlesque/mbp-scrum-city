import { G, P, bikes, cars, enemies, peds } from '../core/state.js';
import { findSpot, removeActor, spawnPed } from '../npcs/actors.js';
import { removeBike, spawnBikerNear } from '../vehicles/bikes.js';
import { removeCar, spawnTraffic } from '../vehicles/cars.js';

// ================= POPULATION =================
export function managePopulation(dt) {
  managePopulation.t = (managePopulation.t || 0) - dt; if (managePopulation.t > 0) return; managePopulation.t = 0.5;
  for (const p of peds.slice()) { const d = Math.hypot(p.x - P.x, p.z - P.z); if (d > 115 || (!p.alive && p.deadT > 25)) removeActor(peds, p); }
  for (const e of enemies.slice()) { const d = Math.hypot(e.x - P.x, e.z - P.z); if (d > 130 || (!e.alive && e.deadT > 25)) removeActor(enemies, e); }
  let alivePeds = peds.filter(p => p.alive).length, tries = 0;
  const target = G.wanted >= 3 ? 26 : 38;
  while (alivePeds < target && tries++ < 4) { const s = findSpot(G.state === 'title' ? 10 : 45, 95, G.state !== 'title', false); if (s) { spawnPed(s.x, s.z); alivePeds++; } }
  for (const c of cars.slice()) {
    const d = Math.hypot(c.x - P.x, c.z - P.z);
    if ((c.dead && c.deadT > 30 && d > 40) || (c.cop && d > 150)) removeCar(c);
  }
  if (cars.filter(c => c.mode === 'traffic' && !c.dead).length < 22) spawnTraffic(true);
  for (const b of bikes.slice()) {
    if (b === P.bike) continue; const d = Math.hypot(b.x - P.x, b.z - P.z);
    if (b.rider ? d > 170 : b.dead ? (b.deadT > 30 && d > 40) || d > 150 : d > 260) removeBike(b);
  }
  if (bikes.filter(b => b.rider && b.rider !== 'player').length < 4) spawnBikerNear();
}
