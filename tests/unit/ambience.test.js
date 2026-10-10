// The city around the player: its bed by time of day, height and the beach, the surf and the gulls.
import { describe, expect, it } from 'vitest';
import { BEACH_X, SHORE_X, bedMix, gullsOut, surfSources } from '../../public/js/game/ambience.js';

describe('the city bed', () => {
  it('is the day bed by day and the night bed by night', () => {
    expect(bedMix(0, 0, 0)).toMatchObject({ day: 1, night: 0, wind: 0 });
    expect(bedMix(1, 0, 0)).toMatchObject({ day: 0, night: 1, wind: 0 });
  });
  it('gets quieter and duller up on a roof, where the wind picks up', () => {
    const street = bedMix(0, 0, 0), roof = bedMix(0, 20, 0);
    expect(roof.day).toBeLessThan(street.day * 0.6);
    expect(roof.bright).toBeLessThan(street.bright / 2);
    expect(roof.wind).toBeGreaterThan(0.5);
  });
  it('fades out across the sand, where a breeze comes in off the sea', () => {
    const sand = bedMix(0, 0, SHORE_X);
    expect(sand.day).toBeLessThan(0.3);
    expect(sand.wind).toBeGreaterThan(0.2);
    expect(bedMix(0, 0, BEACH_X).day).toBe(1);
  });
});

describe('the surf', () => {
  it('plays from three points on the waterline abreast of the player', () => {
    const s = surfSources(40);
    expect(s.map(p => p.x)).toEqual([SHORE_X, SHORE_X, SHORE_X]);
    expect(s.map(p => p.z)).toEqual([14, 40, 66]);
    expect(new Set(s.map(p => p.key)).size).toBe(3);
  });
  it('has gulls over it by day, near the beach only', () => {
    expect(gullsOut(0, SHORE_X)).toBe(true);
    expect(gullsOut(1, SHORE_X)).toBe(false);
    expect(gullsOut(0, 0)).toBe(false);
  });
});

describe('the places that make a sound', async () => {
  const { placeSpots, spotSources, SPOTS } = await import('../../public/js/game/ambience.js');
  const signs = [{ text: 'Bar', x: 10, y: 5.2, z: 3 }, { text: 'Disco', x: -4, y: 5.2, z: 8 }, { text: 'Pawn', x: 0, y: 5.2, z: 0 }, { text: '+', x: 1, y: 3, z: 1, cross: true }];
  const spots = placeSpots(signs, [[100, 200, 32, 32]], [{ x: 234, z: 85 }]);
  const of = type => spots.filter(s => s.type === type);
  it('put a fountain in the middle of each park and a radio in each beach hut', () => {
    expect(of('fountain').map(s => [s.x, s.z])).toEqual([[116, 216]]);
    expect(of('radio').map(s => [s.x, s.z])).toEqual([[234, 85]]);
  });
  it('play salsa in the bars and disco in the disco, at street level under the sign', () => {
    expect(of('salsa').map(s => [s.x, s.y, s.z])).toEqual([[10, 1.5, 3]]);
    expect(of('disco').map(s => s.x)).toEqual([-4]);
    expect(spots.filter(s => s.type !== 'neon' && s.x === 0)).toEqual([]); // a pawn shop is quiet
  });
  it('buzz at every neon sign, and only after dark', () => {
    expect(of('neon')).toHaveLength(3);
    const day = spotSources(spots, 0);
    expect(day.filter(s => s.type === 'neon').every(s => s.vol === 0)).toBe(true);
    const night = spotSources(spots, 1);
    expect(night.find(s => s.type === 'neon').vol).toBe(SPOTS.neon.vol);
    expect(night.find(s => s.type === 'salsa').vol).toBe(SPOTS.salsa.vol);
    expect(night.every(s => s.key === s)).toBe(true);
  });
});
