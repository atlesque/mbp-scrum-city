import { Sound } from '../core/audio.js';
import { pan3d } from '../core/spatial.js';
import { G, P, keys } from '../core/state.js';
import { clamp } from '../core/util.js';
import { all } from '../entities/registry.js';

const GEARS = [0, 7, 13, 19, 26, 34, 50];
// a passing bike is heard only up close: quiet at its loudest and gone by ENGINE_RANGE metres
export const ENGINE_RANGE = 28, ENGINE_NEAR = 0.07;
export const engineFalloff = d => clamp(1 - d / ENGINE_RANGE, 0, 1) ** 2.5;

// one synth engine voice: the player's ride, or else the nearest bike in traffic
export function updateEngineSound() {
  let vol = 0, v = 0, thr = false, M = null, pan = 0;
  if (G.state === 'play') {
    if (P.vehicle) { M = P.vehicle.model; v = Math.abs(P.vehicle.v); thr = !!(keys.KeyW || keys.ArrowUp); vol = 0.08 + (thr ? 0.03 : 0); }
    else {
      let bd = ENGINE_RANGE;
      for (const b of all('vehicle')) if (b.K.ambientEngine && b.driver && !b.dead) { const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < bd) { bd = d; M = b.model; v = b.v; thr = true; vol = ENGINE_NEAR * engineFalloff(d); pan = pan3d(b.x, b.z); } }
    }
  }
  const gears = M && M.engine && M.engine.gears || GEARS, rev = M && M.engine && M.engine.rev || 1;
  let rpm = 1050;
  if (v > 0.5) { let g = 0; while (g < gears.length - 2 && v > gears[g + 1]) g++; rpm = 2600 + clamp((v - gears[g]) / (gears[g + 1] - gears[g]), 0, 1) * 5600 + (thr ? 300 : 0); }
  Sound.setEngine(vol, rpm * rev, pan);
  Sound.setSkid(G.state === 'play' && P.vehicle && P.vehicle.skid || 0);
}
