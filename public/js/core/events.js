// Tiny event bus so systems can react to what happens in the game without importing each other.
//
// Events the game emits:
//   npc:attacked      { npc, source }                   player or Pokémon damage; partners assist player attacks
//   npc:killed        { npc, byPlayer, dir, vehicle }   vehicle: what the NPC was riding, if anything
//   vehicle:wrecked   { vehicle, byPlayer }
//   vehicle:burning   { vehicle, crash }                caught fire; crash: a collision did it, so it burns long (vehicles/firetruck.js)
//   vehicle:doused    { vehicle }                       firemen (or the player's repair tool) put the fire out
//   vehicle:jacked    { vehicle, driver }               the player dragged the driver out (or shoved the rider off) to take it
//   vehicle:scared    { vehicle, driver }               a melee blow on a civilian's vehicle sent the driver running
//   vehicle:enter     { vehicle }                       the player got on or in
//   vehicle:exit      { vehicle, crash }
//   wanted:up         { level }
//   wanted:lost       {}
//   shop:purchase     { shop, item, action, price }
//   player:died       { fee }
//   roof:up           { roof }                          took the stairs from a street door to its roof (world/rooftops.js)
//   roof:down         { roof }
//   settings:changed  { id, value }                    the player changed something on the Settings screen
//   player:shot       { weapon, from, ends }           the player's gun went off: the muzzle and where each pellet stopped (net/sync.js)
//   player:boom       { x, y, z, R, dmg, power }       the player's rocket or grenade burst (net/sync.js)
//   player:swing      { anim, dur, step }              the player started a melee swing (net/sync.js)
//   player:fire       { x, y, z }                      the player's molotov burst into a pool of fire (net/sync.js)
//   npc:shot          { npc, from, end }               someone hunting the crew fired (net/sync.js shows it to the others)
//   npc:boom          { x, y, z, R, dmg, power }       a rocket fired at the crew burst (net/sync.js)
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
  return () => { const l = handlers.get(name); l.splice(l.indexOf(fn), 1); };
}

export function emit(name, payload = {}) {
  for (const fn of handlers.get(name) || []) fn(payload);
}
