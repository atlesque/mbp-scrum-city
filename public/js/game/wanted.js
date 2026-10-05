import { Sound } from '../core/audio.js';
import { G, P, cars, enemies, stats } from '../core/state.js';
import { $, clamp } from '../core/util.js';
import { HEAT, WANTED } from '../data/wanted.js';
import { findSpot, spawnEnemy, vol3d } from '../npcs/actors.js';
import { showBig } from '../ui/hud.js';
import { spawnCopCar } from '../vehicles/cars.js';
import { spawnHeli } from '../vehicles/heli.js';

// ================= WANTED =================
export function addHeat(v) {
  G.heat = Math.min(140, G.heat + v); G.lostT = 0;
  let lvl = 0; for (let i = 5; i >= 1; i--) if (G.heat >= HEAT[i]) { lvl = i; break; }
  if (lvl > G.wanted) {
    G.wanted = lvl; Sound.star(); stats.best = Math.max(stats.best, G.wanted);
    showBig(['', 'The cops noticed', 'Police are rolling', 'SWAT has been called', 'The Feds are here', 'They sent the army'][G.wanted]);
    G.spawnT = Math.min(G.spawnT, 1.2);
  }
}
export function updateWanted(dt) {
  const starsEl = $('stars');
  if (G.wanted > 0) {
    if (!G.seenNow) {
      G.lostT += dt; starsEl.classList.add('flash');
      if (G.lostT > 7 + G.wanted * 1.5) { G.wanted--; G.heat = G.wanted ? HEAT[G.wanted] : 0; G.lostT = 0; if (G.wanted === 0) { showBig('Heat lost'); for (const e of enemies) e.leaving = true; } }
    } else { G.lostT = Math.max(0, G.lostT - dt * 2); starsEl.classList.remove('flash'); }
    const L = WANTED[G.wanted]; // null once the last star just faded
    G.spawnT -= dt;
    const alive = enemies.filter(e => e.alive && !e.leaving).length;
    if (L && G.spawnT <= 0 && alive < L.max) {
      G.spawnT = L.every;
      G.copCarT -= L.every;
      if (L.cars && G.copCarT <= 0 && cars.filter(c => c.cop && !c.dead).length < 3) { spawnCopCar(); G.copCarT = 10; }
      else { const s = findSpot(48, 78, true, true); if (s) spawnEnemy(mixPick(L.mix), s.x, s.z); }
    }
    if (L && L.heli && !G.heli) { G.heliT -= dt; if (G.heliT <= 0) spawnHeli(); }
  } else starsEl.classList.remove('flash');
  G.seenNow = false;
  // siren: nearest police car, or faint while hunted on foot
  let sv = 0;
  if (G.wanted > 0) { sv = 0.025; for (const c of cars) if (c.cop && !c.dead) sv = Math.max(sv, vol3d(c.x, c.z) * 0.09); }
  Sound.setSiren(G.state === 'play' ? sv : 0);
  Sound.setHeli(G.heli && G.state === 'play' ? clamp(1 - Math.hypot(G.heli.x - P.x, G.heli.z - P.z) / 120, 0, 1) * 0.5 : 0);
}
export function mixPick(mix) { let r = Math.random(); for (const [t, w] of mix) { r -= w; if (r <= 0) return t; } return mix[0][0]; }
