import { Sound } from '../core/audio.js';
import { EAR_Y } from '../core/spatial.js';
import { P } from '../core/state.js';
import { roomAt } from '../world/acoustics.js';

// ================= THE CITY AROUND YOU =================
// Everything heard in the world that isn't a person, a gun or a vehicle: how the street echoes, kept up to date
// a few times a second as the player moves.
const ROOM_EVERY = 0.25; // seconds between looks at the walls around the listener
let roomT = 0;
export function updateAmbience(dt) {
  if (!Sound.ready) return;
  if ((roomT -= dt) <= 0) { roomT = ROOM_EVERY; const feet = P.y || 0; Sound.room(roomAt(P.x, feet + EAR_Y, P.z, feet)); }
}
