import { P } from '../core/state.js';
import { clamp, pick, rnd } from '../core/util.js';
import { all } from '../entities/registry.js';
import { spawnNpc } from '../npcs/npc.js';
import { ROADS } from '../world/collision.js';
import { pickTrafficModel } from './models/index.js';
import { spawnVehicle } from './vehicle.js';

// drive on the right
export function laneFor(roadPos, dirX, dirZ) {
  if (dirZ) return { x: roadPos - 3 * dirZ, z: null };
  return { x: null, z: roadPos + 3 * dirX };
}
export const nearestRoad = v => ROADS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
const clear = (x, z) => !all('vehicle').some(o => Math.abs(o.x - x) < 8 && Math.abs(o.z - z) < 8);

// a car with someone at the wheel somewhere on the grid, out of sight if `far`
export function spawnTrafficCar(far) {
  for (let i = 0; i < 20; i++) {
    const vertical = Math.random() < 0.5, road = pick(ROADS.slice(1, -1).concat([200])), s = Math.random() < 0.5 ? 1 : -1;
    const along = rnd(-195, 195);
    const dx = vertical ? 0 : s, dz = vertical ? s : 0, L = laneFor(road, dx, dz);
    const x = vertical ? L.x : along, z = vertical ? along : L.z;
    if (far && Math.hypot(x - P.x, z - P.z) < 70) continue;
    if (!clear(x, z)) continue;
    const c = spawnVehicle(pickTrafficModel('car'), x, z, Math.atan2(dx, dz), 'traffic'); c.v = 10;
    c.seatDriver(spawnNpc('motorist', x, z)); return c;
  }
}

// a biker on a road near the player, but not right on top of them
export function spawnTrafficBike() {
  const roads = ROADS.slice(1, -1).concat([200]);
  for (let i = 0; i < 12; i++) {
    const vertical = Math.random() < 0.5, near = roads.filter(r => Math.abs(r - (vertical ? P.x : P.z)) < 130); if (!near.length) continue;
    const road = pick(near), s = Math.random() < 0.5 ? 1 : -1, along = clamp((vertical ? P.z : P.x) + rnd(-130, 130), -195, 195);
    const dx = vertical ? 0 : s, dz = vertical ? s : 0, L = laneFor(road, dx, dz), x = vertical ? L.x : along, z = vertical ? along : L.z;
    if (Math.hypot(x - P.x, z - P.z) < 55) continue;
    if (!clear(x, z)) continue;
    const b = spawnVehicle(pickTrafficModel('bike'), x, z, Math.atan2(dx, dz), 'traffic'); b.v = b.top * 0.7; b.lean = 0;
    b.seatDriver(spawnNpc('biker', x, z));
    return b;
  }
}

// a cruiser racing up the player's road from 75 m away
export function spawnPoliceCar() {
  const vertical = Math.abs(P.x - nearestRoad(P.x)) < Math.abs(P.z - nearestRoad(P.z));
  const road = vertical ? nearestRoad(P.x) : nearestRoad(P.z);
  if (road >= 200 && vertical === true && P.x > 206) return;
  const pAlong = vertical ? P.z : P.x, s = Math.random() < 0.5 ? 1 : -1;
  let start = pAlong - s * 75; if (start < -200 || start > 200) start = pAlong + s * 75;
  const dir = Math.sign(pAlong - start) || 1, dx = vertical ? 0 : dir, dz = vertical ? dir : 0, L = laneFor(road, dx, dz);
  const x = vertical ? L.x : start, z = vertical ? start : L.z;
  if (Math.abs(x) > 205 || Math.abs(z) > 205) return;
  const c = spawnVehicle('police', x, z, Math.atan2(dx, dz), 'respond'); c.respT = 0; c.v = 18;
}
