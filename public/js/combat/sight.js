import { rnd } from '../core/util.js';

// Shooters fire only at a player they can see, and only after a short reaction once the player comes into view.
// Losing sight resets the reaction, so ducking behind a wall and stepping out again buys another moment.
export const REACT_MIN = 0.05, REACT_MAX = 0.2;
// how often a shooter re-checks its line of sight, in seconds
export const SIGHT_EVERY = 0.05;

// a fresh sight record: { visible, react }
export function newSight() { return { visible: false, react: 0 }; }

// feed in whether the player is in view this frame; returns true once the shooter has reacted and may fire
export function reactTo(s, visible, dt) {
  if (!visible) { s.visible = false; s.react = 0; return false; }
  if (!s.visible) { s.visible = true; s.react = rnd(REACT_MIN, REACT_MAX); return false; }
  s.react -= dt;
  return s.react <= 0;
}

// Shooters miss more the further off the player is: full accuracy up to `close` metres, then the hit chance
// halves every AIM_HALF metres beyond that, never dropping below AIM_FLOOR of the close-range figure.
export const AIM_CLOSE = 8, AIM_HALF = 8, AIM_FLOOR = 0.05;
export function aimFalloff(dist, close = AIM_CLOSE) {
  return Math.max(AIM_FLOOR, 0.5 ** (Math.max(0, dist - close) / AIM_HALF));
}
