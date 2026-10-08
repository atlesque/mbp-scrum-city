import { describe, expect, it } from 'vitest';
import { apply, migrate, serialize } from '../../public/js/core/save.js';
import { stats } from '../../public/js/core/state.js';
import { clock } from '../../public/js/core/util.js';

describe('five star heat highscore', () => {
  it('starts at zero for a new player', () => {
    expect(stats.fiveStar).toBe(0);
  });
  it('travels with the save, so it reaches the account', () => {
    const inv = { money: 9, owned: { pistol: true }, lvl: {}, ammo: {}, found: {} };
    const d = migrate(JSON.parse(JSON.stringify(serialize(inv, { kills: 4, fiveStar: 312.5 }))));
    const s = { kills: 0, fiveStar: 0 };
    apply(d, { owned: {}, lvl: {}, ammo: {} }, s);
    expect(s.fiveStar).toBe(312.5);
  });
  it('keeps zero when an older save has none', () => {
    const s = { kills: 0, fiveStar: 0 };
    apply(migrate({ v: 2, money: 1, weapons: { owned: {}, lvl: {}, ammo: {} }, stats: { kills: 3 } }), { owned: {}, lvl: {}, ammo: {} }, s);
    expect(s).toEqual({ kills: 3, fiveStar: 0 });
  });
  it('reads as a clock', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(75.9)).toBe('1:15');
    expect(clock(3725)).toBe('1:02:05');
  });
});
