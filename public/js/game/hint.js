import { G, P, stats } from '../core/state.js';

// The controls hint (bottom right) shows for a new player's first 10 minutes of play, then only in the pause menu.
// Play time lives in the save (stats.played), so it carries across sessions and devices. It stops counting at the
// limit so the save, and the account copy, stop changing once it's reached.
export const HINT_FOR = 600;
export function countPlayTime(dt) { if (!(stats.played >= HINT_FOR)) stats.played = Math.min(HINT_FOR, (stats.played || 0) + dt); }
// riding, the speedo has the bottom of the screen, so the hint waits for the pause menu (and sits above the speedo there)
export const hintShown = () => G.state === 'paused' || (!P.vehicle && !(stats.played >= HINT_FOR));
