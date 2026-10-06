// Every live thing in the world (people, vehicles, the chopper, shops, pickups) registers here.
// Shared systems (main loop, bullets, explosions, collision, radar, population, interaction)
// walk this one set and use whichever traits an entity has, so a new kind of thing plugs in
// without editing those systems.
//
// Every entity has `kind` ('npc', 'vehicle', 'heli', 'shop', 'pickup') and x / z. Optional traits:
//   update(dt)                     per-frame logic
//   raycast(o, d, maxT)            -> { t, head?, zone? } | null   bullets and rockets test against this
//   onShot(hit, dmg, dir)          a player bullet landed; returns { head } for the hit marker
//   onRocket(dmg)                  a rocket struck it directly (the blast is handled separately)
//   blast(x, y, z, R, dmg, byPlayer)  caught in an explosion centred at x, y, z
//   fling(x, y, z, R)              thrown by that explosion, after every blast() has run
//   pushOut(o, r, self)            push a moving circle {x, z} of radius r out of it; true on contact
//   blip(radar), blipLayer         draw on the radar; higher layers draw on top
//   interaction(player)            -> { keys, prompt, priority, dist, run } when the player can use it
//   shouldDespawn(player)          true to remove it
//   dispose()                      free meshes; called once on removal
export const entities = new Set();

export function addEntity(e) { entities.add(e); return e; }

export function removeEntity(e) {
  if (!entities.delete(e)) return;
  e.removed = true;
  if (e.dispose) e.dispose();
}

// a snapshot, safe to iterate while entities are added or removed
export function all(kind) {
  const out = [];
  for (const e of entities) if (!kind || e.kind === kind) out.push(e);
  return out;
}

export function count(pred) {
  let n = 0;
  for (const e of entities) if (pred(e)) n++;
  return n;
}
