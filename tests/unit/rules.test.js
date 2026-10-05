import { describe, expect, it } from 'vitest';
import { HEAT, WANTED, heatToLevel, mixPick } from '../../public/js/data/wanted.js';
import { WBY, WEAPONS, wStat } from '../../public/js/data/weapons.js';
import { NPC_TYPES } from '../../public/js/npcs/types.js';

describe('wanted level', () => {
  it('maps heat to the highest level reached', () => {
    expect(heatToLevel(0)).toBe(0);
    expect(heatToLevel(HEAT[1])).toBe(1);
    expect(heatToLevel(HEAT[3] - 0.01)).toBe(2);
    expect(heatToLevel(HEAT[5])).toBe(5);
    expect(heatToLevel(1e6)).toBe(5);
  });
  it('has a spawn table for every star', () => {
    for (let i = 1; i < HEAT.length; i++) {
      expect(WANTED[i].max).toBeGreaterThan(0);
      expect(WANTED[i].mix.reduce((s, [, w]) => s + w, 0)).toBeCloseTo(1);
    }
  });
  it('picks from a weighted mix', () => {
    const mix = [['cop', 0.25], ['swat', 0.75]];
    expect(mixPick(mix, 0.1)).toBe('cop');
    expect(mixPick(mix, 0.5)).toBe('swat');
    expect(mixPick(mix, 1)).toBe('swat');
  });
});

describe('weapon upgrades', () => {
  it('never get worse with level', () => {
    for (const w of WEAPONS) {
      for (let l = 0; l < 3; l++) {
        const a = wStat(w, l), b = wStat(w, l + 1);
        expect(b.dmg).toBeGreaterThanOrEqual(a.dmg);
        expect(b.mag).toBeGreaterThanOrEqual(a.mag);
        expect(b.rate).toBeLessThanOrEqual(a.rate);
      }
    }
  });
  it('a base pump shotgun drops a police officer when a third of its pellets land', () => {
    const w = WBY.shotgun;
    expect(Math.ceil(w.pellets / 3) * wStat(w, 0).dmg).toBeGreaterThanOrEqual(NPC_TYPES.cop.hp);
  });
});
