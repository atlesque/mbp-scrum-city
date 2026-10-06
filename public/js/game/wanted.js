import { Sound } from '../core/audio.js';
import { emit } from '../core/events.js';
import { pan3d, vol3d } from '../core/spatial.js';
import { G, P, stats } from '../core/state.js';
import { $, clamp } from '../core/util.js';
import { HEAT, WANTED, heatToLevel, mixPick } from '../data/wanted.js';
import { all, count } from '../entities/registry.js';
import { findSpot, spawnNpc } from '../npcs/npc.js';
import { showBig } from '../ui/hud.js';
import { spawnHeli } from '../vehicles/heli.js';
import { spawnPoliceCar } from '../vehicles/traffic.js';

// ================= WANTED =================
const LEVEL_TEXT = ['', 'The cops noticed', 'Police are rolling', 'SWAT has been called', 'The Feds are here', 'They sent the army'];

const isLaw = e => e.kind === 'npc' && e.faction === 'law';
const isPolice = e => e.kind === 'vehicle' && e.model.police;

export function addHeat(v) {
  G.heat = Math.min(140, G.heat + v); G.lostT = 0;
  const lvl = heatToLevel(G.heat);
  if (lvl > G.wanted) {
    G.wanted = lvl; Sound.star(); stats.best = Math.max(stats.best, G.wanted);
    showBig(LEVEL_TEXT[G.wanted]);
    G.spawnT = Math.min(G.spawnT, 1.2);
    emit('wanted:up', { level: G.wanted });
  }
}
export function updateWanted(dt) {
  const starsEl = $('stars');
  if (G.wanted > 0) {
    if (!G.seenNow) {
      G.lostT += dt; starsEl.classList.add('flash');
      if (G.lostT > 7 + G.wanted * 1.5) {
        G.wanted--; G.heat = G.wanted ? HEAT[G.wanted] : 0; G.lostT = 0;
        if (G.wanted === 0) { showBig('Heat lost'); for (const e of all('npc')) if (isLaw(e)) e.leaving = true; emit('wanted:lost', {}); }
      }
    } else { G.lostT = Math.max(0, G.lostT - dt * 2); starsEl.classList.remove('flash'); }
    const L = WANTED[G.wanted]; // null once the last star just faded
    G.spawnT -= dt;
    const alive = count(e => isLaw(e) && e.alive && !e.leaving);
    if (L && G.spawnT <= 0 && alive < L.max) {
      G.spawnT = L.every;
      G.copCarT -= L.every;
      if (L.cars && G.copCarT <= 0 && count(e => isPolice(e) && !e.dead) < 3) { spawnPoliceCar(); G.copCarT = 10; }
      else { const s = findSpot(48, 78, true, true); if (s) spawnNpc(mixPick(L.mix), s.x, s.z); }
    }
    if (L && L.heli && !G.heli) { G.heliT -= dt; if (G.heliT <= 0) spawnHeli(); }
  } else starsEl.classList.remove('flash');
  G.seenNow = false;
  // siren: nearest police car, or faint while hunted on foot
  let sv = 0, sp = 0;
  if (G.wanted > 0) { sv = 0.025; for (const c of all('vehicle')) if (c.model.police && !c.dead) { const cv = vol3d(c.x, c.z) * 0.09; if (cv > sv) { sv = cv; sp = pan3d(c.x, c.z); } } }
  Sound.setSiren(G.state === 'play' ? sv : 0, sp);
  Sound.setIntensity(G.wanted);
  Sound.setHeli(G.heli && G.state === 'play' ? clamp(1 - Math.hypot(G.heli.x - P.x, G.heli.z - P.z) / 120, 0, 1) * 0.5 : 0, G.heli ? pan3d(G.heli.x, G.heli.z) : 0);
}
