import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, apply, migrate, serialize } from '../../public/js/core/save.js';

describe('saves', () => {
  it('upgrades a v1 save from before versioning', () => {
    const v1 = { money: 1234, owned: { pistol: true, smg: true }, lvl: { smg: 2 }, ammo: { smg: 90 }, stats: { kills: 7 } };
    const d = migrate(v1);
    expect(d.v).toBe(SAVE_VERSION);
    const inv = { money: 0, owned: {}, lvl: {}, ammo: {} }, stats = { kills: 0, cops: 0 };
    apply(d, inv, stats);
    expect(inv).toEqual({ money: 1234, owned: { pistol: true, smg: true }, lvl: { smg: 2 }, ammo: { smg: 90 }, found: {} });
    expect(stats).toEqual({ kills: 7, cops: 0 });
  });
  it('round-trips the current format', () => {
    const inv = { money: 50, owned: { pistol: true, minigun: true }, lvl: { pistol: 1 }, ammo: { minigun: 500 }, found: { minigun: true } }, stats = { kills: 1 };
    const d = migrate(JSON.parse(JSON.stringify(serialize(inv, stats))));
    const inv2 = { money: 0, owned: {}, lvl: {}, ammo: {} }, stats2 = {};
    apply(d, inv2, stats2);
    expect(inv2).toEqual(inv); expect(stats2).toEqual(stats);
  });
  it('ignores junk and saves from the future', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate('nope')).toBeNull();
    expect(migrate({ v: SAVE_VERSION + 1 })).toBeNull();
  });
});
