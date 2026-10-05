import { Sound } from '../core/audio.js';
import { vol3d } from '../core/spatial.js';
import { G, P, keys } from '../core/state.js';
import { clamp } from '../core/util.js';
import { all } from '../entities/registry.js';

const GEARS = [0, 7, 13, 19, 26, 34, 50];

// one synth engine voice: the player's ride, or else the nearest bike in traffic
export function updateEngineSound() {
  let vol = 0, v = 0, thr = false, M = null;
  if (G.state === 'play') {
    if (P.vehicle) { M = P.vehicle.model; v = Math.abs(P.vehicle.v); thr = !!(keys.KeyW || keys.ArrowUp); vol = 0.16 + (thr ? 0.06 : 0); }
    else {
      let bd = 45;
      for (const b of all('vehicle')) if (b.K.ambientEngine && b.driver && !b.dead) { const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < bd) { bd = d; M = b.model; v = b.v; thr = true; vol = 0.14 * vol3d(b.x, b.z); } }
    }
  }
  const gears = M && M.engine && M.engine.gears || GEARS, rev = M && M.engine && M.engine.rev || 1;
  let rpm = 1050;
  if (v > 0.5) { let g = 0; while (g < gears.length - 2 && v > gears[g + 1]) g++; rpm = 2600 + clamp((v - gears[g]) / (gears[g + 1] - gears[g]), 0, 1) * 5600 + (thr ? 300 : 0); }
  Sound.setEngine(vol, rpm * rev);
}
