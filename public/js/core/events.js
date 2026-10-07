// Tiny event bus so systems can react to what happens in the game without importing each other.
//
// Events the game emits:
//   npc:killed        { npc, byPlayer, dir, vehicle }   vehicle: what the NPC was riding, if anything
//   vehicle:wrecked   { vehicle, byPlayer }
//   vehicle:burning   { vehicle, crash }                caught fire; crash: a collision did it, so it burns long (vehicles/firetruck.js)
//   vehicle:doused    { vehicle }                       firemen put the fire out
//   vehicle:enter     { vehicle }                       the player got on or in
//   vehicle:exit      { vehicle, crash }
//   wanted:up         { level }
//   wanted:lost       {}
//   shop:purchase     { shop, item, action, price }
//   player:died       { fee }
//   roof:up           { roof }                          took the stairs from a street door to its roof (world/rooftops.js)
//   roof:down         { roof }
//   settings:changed  { id, value }                    the player changed something on the Settings screen
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
  return () => { const l = handlers.get(name); l.splice(l.indexOf(fn), 1); };
}

export function emit(name, payload = {}) {
  for (const fn of handlers.get(name) || []) fn(payload);
}
