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

// ---- electric cars (a model with `electric: true`) ----
// No engine note: below HUM_TOP km/h they play the soft pedestrian-warning hum a real EV makes, fading out over
// the last few km/h, and from then on all you hear is the tyres and the wind, growing with speed.
export const HUM_FADE = 24, HUM_TOP = 30, ROAD_FULL = 130; // km/h
export const kmh = v => Math.abs(v) * 3.6;
export function evMix(v) {
  const k = kmh(v);
  return {
    hum: clamp((HUM_TOP - k) / (HUM_TOP - HUM_FADE), 0, 1) * (0.6 + 0.4 * clamp(k / 10, 0, 1)), // a little softer standing still
    road: clamp(k / ROAD_FULL, 0, 1) ** 1.3,
    speed: k,
  };
}
export const isElectric = V => !!(V && V.model && V.model.electric);
export const EV_NEAR = 0.07;
// every electric car driving in traffic, as a sound source at its wheels
export function evSources() {
  const out = [];
  if (G.state === 'play') for (const c of all('vehicle')) if (isElectric(c) && c.driver && !c.dead && c !== P.vehicle) out.push({ key: c, ...at(c, 0.5), vol: EV_NEAR, ...evMix(c.v) });
  return out;
}

// the player's ride is heard as their own (unplaced); every bike and electric car passing by plays from where it is
export function updateEngineSound() {
  const V = G.state === 'play' && P.vehicle, thr = !!(keys.KeyW || keys.ArrowUp), ev = isElectric(V);
  Sound.setEngine(V && !ev ? 0.08 + (thr ? 0.03 : 0) : 0, V && !ev ? rpmFor(V.model, Math.abs(V.v), thr) : 1050);
  Sound.setElectric(ev ? 0.09 : 0, evMix(ev ? V.v : 0));
  Sound.loops('engine', engineSources(), ENGINE_HEAR);
  Sound.loops('ev', evSources(), ENGINE_HEAR);
  Sound.setSkid(V && V.skid || 0);
}
