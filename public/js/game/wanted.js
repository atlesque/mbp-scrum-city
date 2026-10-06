import { Sound } from '../core/audio.js';
import { emit } from '../core/events.js';
import { at } from '../core/spatial.js';
import { G, stats } from '../core/state.js';
import { $ } from '../core/util.js';
import { HEAT, WANTED, heatToLevel, mixPick } from '../data/wanted.js';
import { all, count } from '../entities/registry.js';
import { findSpot, spawnNpc } from '../npcs/npc.js';
import { showBig } from '../ui/hud.js';
import { spawnHeli } from '../vehicles/heli.js';
import { spawnTank } from '../vehicles/tank.js';
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
    if (L && L.tank && !G.tank) { G.tankT -= dt; if (G.tankT <= 0) spawnTank(); }
  } else starsEl.classList.remove('flash');
  G.seenNow = false;
  Sound.loops('siren', sirenSources());
  Sound.loops('rotor', rotorSources());
  Sound.loops('tank', tankSources());
  Sound.setIntensity(G.wanted);
}

// sirens: one per police car out hunting you, each playing from its car (core/audio.js keeps the loudest few);
// none while only cops on foot hunt you
export function sirenSources() {
  const out = [];
  if (G.wanted > 0 && G.state === 'play') for (const c of all('vehicle')) if (isPolice(c) && !c.dead) out.push({ key: c, ...at(c, 1.6), vol: SIREN_VOL });
  return out;
}
export const SIREN_VOL = 0.09, ROTOR_VOL = 0.5;
// the chopper's rotor, from the chopper, up in the air
export function rotorSources() {
  return G.state === 'play' ? all('heli').map(h => ({ key: h, ...at(h, 1), vol: ROTOR_VOL })) : [];
}
// the tank's engine and tracks, louder as it gets going; wrecks are silent
export const TANK_VOL = 0.45;
export function tankSources() {
  return G.state === 'play' ? all('tank').filter(t => !t.dead).map(t => ({ key: t, ...at(t, 1), vol: TANK_VOL, speed: t.v })) : [];
}
