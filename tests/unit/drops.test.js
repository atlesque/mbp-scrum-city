import { describe, expect, it } from 'vitest';
import { DROP_TYPES } from '../../public/js/game/pickups.js';
import { WBY } from '../../public/js/data/weapons.js';

describe('enemy drops', () => {
  const { armor, ammo } = DROP_TYPES;
  it('armor tops up to 100 and is left alone at full armor', () => {
    const p = { armor: 90 };
    expect(armor.useful(p)).toBe(true);
    armor.take(p);
    expect(p.armor).toBe(100);
    expect(armor.useful(p)).toBe(false);
  });
  it('ammo is no use with only the pistol', () => {
    expect(ammo.useful({}, { owned: { pistol: true }, ammo: {} })).toBe(false);
  });
  it('ammo adds a quarter pack to every gun that uses it', () => {
    const inv = { owned: { pistol: true, smg: true, rpg: true }, ammo: { smg: 10 } };
    expect(ammo.useful({}, inv)).toBe(true);
    ammo.take({}, inv);
    expect(inv.ammo).toEqual({ smg: 10 + WBY.smg.ammoPack / 4, rpg: 1 });
  });
});
