// Cross-checks the data registries, so a typo in a new vehicle, NPC or shop fails here
// instead of in the middle of a game.
import { describe, expect, it } from 'vitest';
import { BEHAVIOURS } from '../../public/js/npcs/behaviours.js';
import { NPC_TYPES } from '../../public/js/npcs/types.js';
import { ITEM_TYPES } from '../../public/js/shops/items.js';
import { SHOP_TYPES } from '../../public/js/shops/types.js';
import { WANTED } from '../../public/js/data/wanted.js';
import { WBY } from '../../public/js/data/weapons.js';
import { VEHICLE_MODELS } from '../../public/js/vehicles/models/index.js';
import { KINDS } from '../../public/js/vehicles/vehicle.js';
import { SHOP_SITES } from '../../public/js/world/city.js';

describe('vehicle models', () => {
  for (const [id, m] of Object.entries(VEHICLE_MODELS)) it(id, () => {
    expect(m.id).toBe(id);
    expect(KINDS[m.kind], `kind ${m.kind}`).toBeDefined();
    expect(m.hp).toBeGreaterThan(0);
    expect(typeof m.name).toBe('string');
    expect(typeof m.short).toBe('string');
    expect(m.engine && m.engine.rev).toBeGreaterThan(0);
  });
  it('every kind has the hooks the vehicle layer calls', () => {
    const hooks = ['build', 'pose', 'drive', 'coast', 'seat', 'unseat', 'aim', 'seatZ', 'exitAt', 'hitBox', 'pushOut', 'reach', 'onDriverGone', 'onPlayerEnter', 'onPlayerExit', 'wreck', 'blip', 'tip'];
    for (const [name, K] of Object.entries(KINDS)) for (const h of hooks) expect(typeof K[h], `${name}.${h}`).toBe('function');
  });
});

describe('NPC types', () => {
  for (const [id, t] of Object.entries(NPC_TYPES)) it(id, () => {
    expect(BEHAVIOURS[t.behaviour], `behaviour ${t.behaviour}`).toBeDefined();
    expect(['civilian', 'law']).toContain(t.faction);
    expect(t.hp).toBeGreaterThan(0);
    expect(t.despawn).toBeGreaterThan(0);
    if (t.gun) expect(WBY[t.gun], `gun ${t.gun}`).toBeDefined();
  });
  it('wanted levels only send law NPCs that exist', () => {
    for (const L of WANTED.slice(1)) for (const [type] of L.mix) expect(NPC_TYPES[type] && NPC_TYPES[type].faction, type).toBe('law');
  });
});

describe('shops', () => {
  for (const [id, s] of Object.entries(SHOP_TYPES)) it(id, () => {
    expect(s.name && s.marker && s.marker.glyph && s.marker.color).toBeTruthy();
    for (const item of s.catalogue) {
      expect(ITEM_TYPES[item.type], `item type ${item.type}`).toBeDefined();
      if (item.type === 'weapon') expect(WBY[item.id], `weapon ${item.id}`).toBeDefined();
    }
  });
  it('every shop site uses a known shop type', () => {
    for (const s of SHOP_SITES) expect(SHOP_TYPES[s.type], s.type).toBeDefined();
  });
});
