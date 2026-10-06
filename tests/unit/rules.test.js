import { describe, expect, it } from 'vitest';
import { HEAT, RADAR_GLOW, RADAR_PULSE_FROM, WANTED, heatToLevel, mixPick } from '../../public/js/data/wanted.js';
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
  it('glows the minimap red, stronger with every star', () => {
    expect(RADAR_GLOW).toHaveLength(HEAT.length);
    expect(RADAR_GLOW[0]).toBe(0);
    for (let i = 1; i < RADAR_GLOW.length; i++) expect(RADAR_GLOW[i]).toBeGreaterThan(RADAR_GLOW[i - 1]);
    expect(RADAR_GLOW.at(-1)).toBe(1);
    expect(RADAR_PULSE_FROM).toBeLessThan(HEAT.length);
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
        expect(b.blastMul).toBeGreaterThanOrEqual(a.blastMul);
      }
    }
  });
  it('give the minigun and rocket launcher a big step per level', () => {
    const mg0 = wStat(WBY.minigun, 0), mg3 = wStat(WBY.minigun, 3);
    expect(mg3.dmg / mg3.rate).toBeGreaterThanOrEqual(4 * mg0.dmg / mg0.rate);
    const r0 = wStat(WBY.rpg, 0), r3 = wStat(WBY.rpg, 3);
    expect(r3.dmg).toBeGreaterThanOrEqual(2 * r0.dmg);
    expect(r0.blastMul).toBe(1);
    expect(r3.blastMul).toBeGreaterThan(1.5);
  });
  it('a base pump shotgun drops a police officer when a third of its pellets land', () => {
    const w = WBY.shotgun;
    expect(Math.ceil(w.pellets / 3) * wStat(w, 0).dmg).toBeGreaterThanOrEqual(NPC_TYPES.cop.hp);
  });
});

describe('car explosions', () => {
  // mirrors Vehicle.blast and Npc.blast: falloff to the edge of the radius plus a flat bonus
  const atDist = (d, b, bonus) => b.dmg * (1 - d / b.r) + bonus;
  it('set off the toughest car parked alongside', async () => {
    const { car } = await import('../../public/js/vehicles/kinds/car.js');
    const { VEHICLE_MODELS } = await import('../../public/js/vehicles/models/index.js');
    const toughest = Math.max(...Object.values(VEHICLE_MODELS).filter(m => m.kind === 'car').map(m => m.hp));
    expect(atDist(4.5, car.blast, 40)).toBeGreaterThanOrEqual(toughest);
  });
  it('kill a pedestrian most of the way out', async () => {
    const { car } = await import('../../public/js/vehicles/kinds/car.js');
    const { NPC_TYPES } = await import('../../public/js/npcs/types.js');
    expect(atDist(car.blast.r * 0.9, car.blast, 30)).toBeGreaterThanOrEqual(NPC_TYPES.civilian.hp);
  });
});
