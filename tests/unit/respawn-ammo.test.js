import { describe, expect, it } from 'vitest';
import { loadAll, wStat, WBY } from '../../public/js/data/weapons.js';

describe('loading every gun on respawn', () => {
  it('fills each owned magazine from spare ammo', () => {
    const inv = { owned: { pistol: true, smg: true, rifle: true }, lvl: { pistol: 0, smg: 1, rifle: 0 }, mag: { pistol: 2, smg: 0, rifle: 10 }, ammo: { smg: 100, rifle: 5 } };
    loadAll(inv);
    const smgMag = wStat(WBY.smg, 1).mag;
    expect(inv.mag).toEqual({ pistol: 12, smg: smgMag, rifle: 15 });
    expect(inv.ammo).toEqual({ smg: 100 - smgMag, rifle: 0 });
  });
  it('leaves guns the player does not own alone', () => {
    const inv = { owned: { pistol: true }, lvl: {}, mag: {}, ammo: { smg: 50 } };
    loadAll(inv);
    expect(inv.mag).toEqual({ pistol: 12 });
    expect(inv.ammo).toEqual({ smg: 50 });
  });
});
