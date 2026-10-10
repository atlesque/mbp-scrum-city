import { groundKind } from '../world/city.js';

// ================= WHAT A BULLET LANDS ON =================
// The surface (a key of IMPACTS in data/impacts.js) a shot's hit (castBullet in combat/combat.js) struck, for the
// sound it makes and the bits that fly up. Anything not named here sounds like brick.
export const PROP_SURFACE = { palm: 'wood', hut: 'wood', umbrella: 'wood', lamp: 'metal' };
export const GROUND_SURFACE = { water: 'water', sand: 'sand', park: 'sand', paved: 'brick' };
export function surfaceOf(h) {
  if (h.kind === 'entity') {
    const e = h.entity;
    if (h.occupant || e.kind === 'npc') return 'flesh'; // a driver shot through the window, or anyone on foot or on a bike
    return e.surface || 'metal'; // vehicles, the chopper, the tank, the UFO
  }
  if (h.kind === 'player') return 'flesh';
  if (h.kind === 'prop') return PROP_SURFACE[h.prop.kind] || 'wood';
  if (h.kind === 'ground') return GROUND_SURFACE[groundKind(h.p.x, h.p.z)] || 'brick';
  return 'brick'; // the buildings, roofs and the walls round the map
}
