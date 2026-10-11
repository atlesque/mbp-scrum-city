import { P } from '../core/state.js';
import { all } from '../entities/registry.js';

// ================= THE CREW =================
// In multiplayer everyone in the room is one crew (net/sync.js fills this in): the law hunts whichever of them is
// nearest, and they share one wanted level. In single player the crew is just the player.
export const crew = {
  // the other players out in the city: { id, x, y, z, alive, moveSpeed }
  others: () => [],
  // a bullet from someone in this game landed on another player: (them, damage, zone)
  hit: null,
  // in a room right now (net/sync.js)
  online: () => false,
  // this player's id in the room
  me: () => '',
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

// ---- where a player comes into the city ----
// In multiplayer the city doesn't empty out when a player dies or joins: the rest of the crew may have the law right on
// top of the usual spawn point. So whoever comes in (Play, or out of the hospital) takes the first of the spots that has
// nobody hunting within SAFE_R, the usual one first; when they all do, the one with the law furthest off.
export const SAFE_R = 60;
const hunting = e => e.alive && (e.kind === 'npc' || e.kind === 'ghost') && e.faction === 'law';
export function safeSpot(spots, enemies, r = SAFE_R) {
  let best = spots[0], far = -1;
  for (const s of spots) {
    let near = Infinity; for (const e of enemies) near = Math.min(near, Math.hypot(e.x - s.x, e.z - s.z));
    if (near >= r) return s;
    if (near > far) { far = near; best = s; }
  }
  return best;
}
// home: the usual spawn { x, z, yaw }; spots: other places on the pavement to try (nearest goes first)
export function spawnSpot(home, spots) {
  if (!crew.online()) return home;
  const d = s => Math.hypot(s.x - home.x, s.z - home.z);
  return safeSpot([home, ...[...spots].sort((a, b) => d(a) - d(b)).map(s => ({ x: s.x, z: s.z, yaw: home.yaw }))], all().filter(hunting));
}
