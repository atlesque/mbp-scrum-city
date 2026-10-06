import { Sound } from '../core/audio.js';
import { at } from '../core/spatial.js';
import { G, P, keys } from '../core/state.js';
import { clamp } from '../core/util.js';
import { all } from '../entities/registry.js';

const GEARS = [0, 7, 13, 19, 26, 34, 50];
// a passing bike is heard only up close: quiet at its loudest and gone by ENGINE_RANGE metres
export const ENGINE_RANGE = 28, ENGINE_NEAR = 0.07;
export const engineFalloff = d => clamp(1 - d / ENGINE_RANGE, 0, 1) ** 2.5;

// the profile core/audio.js hears passing engines by: this falloff, not the usual inverse-distance one
const ENGINE_HEAR = { max: ENGINE_RANGE, curve: engineFalloff };

export function rpmFor(M, v, thr) {
  const gears = M && M.engine && M.engine.gears || GEARS, rev = M && M.engine && M.engine.rev || 1;
  let rpm = 1050;
  if (v > 0.5) { let g = 0; while (g < gears.length - 2 && v > gears[g + 1]) g++; rpm = 2600 + clamp((v - gears[g]) / (gears[g + 1] - gears[g]), 0, 1) * 5600 + (thr ? 300 : 0); }
  return rpm * rev;
}
// every bike in traffic, as a sound source at its engine
export function engineSources() {
  const out = [];
  if (G.state === 'play') for (const b of all('vehicle')) if (b.K.ambientEngine && b.driver && !b.dead && b !== P.vehicle) out.push({ key: b, ...at(b, 0.6), vol: ENGINE_NEAR, rpm: rpmFor(b.model, Math.abs(b.v), true) });
  return out;
}

// the player's ride is heard as their own (unplaced); every bike passing by plays from where it is
export function updateEngineSound() {
  const V = G.state === 'play' && P.vehicle, thr = !!(keys.KeyW || keys.ArrowUp);
  Sound.setEngine(V ? 0.08 + (thr ? 0.03 : 0) : 0, V ? rpmFor(V.model, Math.abs(V.v), thr) : 1050);
  Sound.loops('engine', engineSources(), ENGINE_HEAR);
  Sound.setSkid(V && V.skid || 0);
}
