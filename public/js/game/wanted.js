import { Sound } from '../core/audio.js';
import { emit } from '../core/events.js';
import { at } from '../core/spatial.js';
import { G, P, stats } from '../core/state.js';
import { $ } from '../core/util.js';
import { HEAT, SIX_STAR_AFTER, WANTED, footMix, heatToLevel, mixPick, pickRide } from '../data/wanted.js';
import { all, count, removeEntity } from '../entities/registry.js';
import { findSpot, spawnNpc } from '../npcs/npc.js';
import { showBig } from '../ui/hud.js';
import { spawnHeli } from '../vehicles/heli.js';
import { spawnTank } from '../vehicles/tank.js';
import { spawnUfo } from '../vehicles/ufo.js';
import { spawnResponder } from '../vehicles/traffic.js';
import { answersHeat, sirenOn } from '../vehicles/vehicle.js';

// ================= WANTED =================
const LEVEL_TEXT = ['', 'The cops noticed', 'Police are rolling', 'SWAT has been called', 'The Feds are here', 'They sent the army', 'They are not from here'];

const isLaw = e => e.kind === 'npc' && e.faction === 'law';
// at most this many police cars and army trucks on their way at once, and around at all (parked ones included)
export const RESPONDERS = { enRoute: 2, max: 5 };

// send the next police car or army truck, depending on who the level calls in (see RIDES in data/wanted.js). When there
// are too many about already, an empty one parked well away from the player makes room; without that, nothing comes.
export function sendResponder(L) {
  const live = all('vehicle').filter(v => answersHeat(v) && !v.dead);
  if (live.filter(v => v.mode === 'respond').length >= RESPONDERS.enRoute) return null;
  if (live.length >= RESPONDERS.max) {
    const spare = live.filter(v => v.mode === 'parked' && !v.driver && Math.hypot(v.x - P.x, v.z - P.z) > 40)
      .sort((a, b) => Math.hypot(b.x - P.x, b.z - P.z) - Math.hypot(a.x - P.x, a.z - P.z))[0];
    if (!spare) return null;
    removeEntity(spare);
  }
  return spawnResponder(pickRide(L.mix)) || null;
}

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
// The secret sixth star: no amount of heat reaches it. Keep five stars for SIX_STAR_AFTER seconds straight and the
// aliens come for you; losing the fifth star starts the count over.
export function holdFive(dt) {
  if (G.wanted !== 5) { if (G.wanted < 5) G.fiveT = 0; return; }
  G.fiveT += dt;
  if (G.fiveT < SIX_STAR_AFTER) return;
  G.wanted = 6; G.lostT = 0; G.ufoT = Math.min(G.ufoT, 2); Sound.star(); stats.best = Math.max(stats.best, 6);
  showBig(LEVEL_TEXT[6]);
  emit('wanted:up', { level: 6 });
}
export function updateWanted(dt) {
  const starsEl = $('stars');
  holdFive(dt);
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
      // a police car or army truck when one is due; otherwise someone walks in, never a soldier (they only come by truck)
      if (L.cars && G.copCarT <= 0 && sendResponder(L)) G.copCarT = L.carEvery || 10;
      else { const mix = footMix(L.mix), s = mix && findSpot(48, 78, true, true); if (s) spawnNpc(mixPick(mix), s.x, s.z); }
    }
    if (L && L.heli && !G.heli) { G.heliT -= dt; if (G.heliT <= 0) spawnHeli(); }
    if (L && L.tank && !G.tank) { G.tankT -= dt; if (G.tankT <= 0) spawnTank(); }
    if (L && L.ufo && !G.ufo) { G.ufoT -= dt; if (G.ufoT <= 0) spawnUfo(); }
  } else starsEl.classList.remove('flash');
  G.seenNow = false;
  Sound.loops('siren', sirenSources());
  Sound.loops('rotor', rotorSources());
  Sound.loops('tank', tankSources());
  Sound.loops('ufo', ufoSources());
  Sound.setIntensity(G.wanted);
}

// sirens: one per police car out hunting you, each playing from its car (core/audio.js keeps the loudest few);
// none while only cops on foot hunt you. A fire truck on its way to a fire has its siren going too, and so does a police
// car or fire truck the player switched theirs on in (see sirenOn in vehicles/vehicle.js).
export function sirenSources() {
  const out = [];
  if (G.state !== 'play') return out;
  for (const c of all('vehicle')) if ((c.model.police || c.model.siren) && sirenOn(c)) out.push({ key: c, ...at(c, c.model.sirenY ?? 1.6), vol: SIREN_VOL });
  for (const t of all('firetruck')) if (t.siren && !t.dead) out.push({ key: t, ...at(t, 3), vol: SIREN_VOL });
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
// the UFO's hum, from the saucer
export const UFO_VOL = 0.5;
export function ufoSources() {
  return G.state === 'play' ? all('ufo').filter(u => !u.falling).map(u => ({ key: u, ...at(u, 0), vol: UFO_VOL })) : [];
}
