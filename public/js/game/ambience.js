import { Sound } from '../core/audio.js';
import { EAR_Y } from '../core/spatial.js';
import { G, P } from '../core/state.js';
import { clamp, rnd } from '../core/util.js';
import { lighting } from '../render/lighting.js';
import { AMB } from '../data/ambience.js';
import { roomAt } from '../world/acoustics.js';
import { beachHuts, parkRects, signs } from '../world/city.js';

// ================= THE CITY AROUND YOU =================
// Everything heard in the world that isn't a person, a gun or a vehicle, kept up to date as the player moves:
// - how the street echoes (world/acoustics.js), looked at a few times a second
// - the city's bed: far traffic and voices by day, crickets and a hush by night, wind up on the roofs and a breeze
//   on the beach; the street gets quieter and duller the higher you climb, and fades out across the sand
// - the surf, played from the stretch of shore nearest the player, and gulls over the beach by day
// - Neon FM, which drops back while on foot so the city can be heard, and comes back up in a vehicle
// - the city's places, each heard only a few steps from it: the park fountains, the music through the wall of a
//   club or a bar, an arcade's bleeps, the radios in the beach huts and, after dark, the buzz of the neon signs
const ROOM_EVERY = 0.25, BED_EVERY = 0.5; // seconds between looks at the walls, and between bed mixes
export const BEACH_X = 195; // where the last buildings give way to the sand
export const SHORE_X = 251, SURF_SPREAD = 26, SURF_VOL = 0.4; // the waterline, and the surf's three points along it

// the bed's levels (0 to 1) and brightness (Hz) for the time of day (night 0 to 1), how high the player's feet
// are and how far east they stand
export function bedMix(night, feet, x) {
  const beach = clamp((x - BEACH_X) / 40, 0, 1), up = clamp((feet - 3) / 15, 0, 1);
  const city = (1 - 0.75 * beach) * (1 - 0.45 * up);
  return {
    day: city * (1 - night),
    night: city * night * (1 - 0.5 * up),
    wind: 0.8 * Math.max(up, 0.35 * beach),
    bright: 12000 - 8500 * up,
  };
}
// the surf: three points on the waterline, abreast of the player and either side of them
export const surfSources = z => [-1, 0, 1].map(i => ({ key: 'surf' + i, x: SHORE_X, y: 0.4, z: z + i * SURF_SPREAD, vol: SURF_VOL }));
// gulls call over the beach by day, now and then, only while the player is near enough the sea to hear them
export const gullsOut = (night, x) => night < 0.45 && x > BEACH_X - 60;

// What each kind of place sounds like: `sound` a recording (data/ambience.js) or a groove drawn in core/audio.js
// (or 'radio', Neon FM), `wall` the lowpass (Hz) of a wall it is heard through, `vol` how loud next to the
// others, `prof` how far it carries, `night` true when it is only heard after dark.
export const SPOTS = {
  fountain: { sound: AMB.fountain, vol: 0.6, prof: { ref: 3, max: 30 } },
  disco: { sound: 'club-disco', wall: 420, vol: 0.5, prof: { ref: 3, max: 32 } },
  salsa: { sound: 'club-salsa', wall: 650, vol: 0.5, prof: { ref: 3, max: 32 } },
  arcade: { sound: 'arcade', wall: 2400, vol: 0.18, prof: { ref: 2, max: 18 } },
  radio: { sound: 'radio', vol: 0.5, prof: { ref: 2, max: 24 } },
  neon: { sound: 'neon-buzz', vol: 0.08, prof: { ref: 1.5, max: 10 }, night: true },
};
// the shops whose sign says what plays inside: Miami bars and Club 86 play salsa, the disco disco
export const SIGN_SPOTS = { Disco: 'disco', 'Club 86': 'salsa', Bar: 'salsa', Arcade: 'arcade' };
// every place in the city that makes a sound, from what buildWorld laid out: a fountain in the middle of each park,
// a radio in each beach hut, a groove at the door under a club's, bar's or arcade's sign, a buzz at every neon sign
export function placeSpots(signList, parks, huts) {
  const spot = (type, x, y, z) => { const s = { type, x, y, z, ...SPOTS[type], base: SPOTS[type].vol }; s.key = s; return s; };
  return [
    ...parks.map(([x, z, w, d]) => spot('fountain', x + w / 2, 1, z + d / 2)),
    ...huts.map(h => spot('radio', h.x, 2, h.z)),
    ...signList.filter(s => SIGN_SPOTS[s.text]).map(s => spot(SIGN_SPOTS[s.text], s.x, 1.5, s.z)),
    ...signList.filter(s => !s.cross).map(s => spot('neon', s.x, s.y, s.z)),
  ];
}
// this frame's sources: every spot, a night-only one turned up with the dark
export function spotSources(spots, night) { for (const s of spots) s.vol = s.night ? s.base * night : s.base; return spots; }

let roomT = 0, bedT = 0, gullT = 3, spots = null;
export function updateAmbience(dt) {
  if (!Sound.ready) return;
  const feet = P.y || 0, night = lighting.night;
  if ((roomT -= dt) <= 0) { roomT = ROOM_EVERY; Sound.room(roomAt(P.x, feet + EAR_Y, P.z, feet)); }
  if ((bedT -= dt) <= 0) { bedT = BED_EVERY; Sound.bed(bedMix(night, feet, P.x)); }
  Sound.onFoot(!P.vehicle && G.state !== 'title');
  const out = G.state === 'play' || G.state === 'dead';
  Sound.loops('surf', out ? surfSources(P.z) : []);
  if (!spots && signs.length) spots = placeSpots(signs, parkRects, beachHuts);
  Sound.loops('spot', out && spots ? spotSources(spots, night) : []);
  if ((gullT -= dt) <= 0) {
    gullT = rnd(2.5, 8);
    if (G.state === 'play' && gullsOut(night, P.x)) Sound.gull({ x: rnd(212, 262), y: rnd(7, 16), z: P.z + rnd(-45, 45) });
  }
}
