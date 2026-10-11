import { P } from '../core/state.js';

// ================= THE CREW =================
// In multiplayer everyone in the room is one crew (net/sync.js fills this in): the law hunts whichever of them is
// nearest, and they share one wanted level. In single player the crew is just the player.
export const crew = {
  // the other players out in the city: { id, x, y, z, alive, moveSpeed }
  others: () => [],
  // a bullet from someone in this game landed on another player: (them, damage, zone)
  hit: null,
};

// who a hunter at x, z goes after: the nearest of the crew still standing (the player when nobody is)
export function nearestOf(x, z) {
  let best = P, bd = P.alive ? Math.hypot(P.x - x, P.z - z) : Infinity;
  for (const o of crew.others()) {
    if (!o.alive) continue;
    const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; }
  }
  return best;
}
