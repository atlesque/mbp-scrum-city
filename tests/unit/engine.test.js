// The bike engine should be quiet and only audible close by.
import { describe, expect, it } from 'vitest';
import { ENGINE_RANGE, engineFalloff } from '../../public/js/vehicles/engine.js';

describe('engine sound falloff', () => {
  it('is full volume on top of the bike and silent at the range', () => {
    expect(engineFalloff(0)).toBe(1);
    expect(engineFalloff(ENGINE_RANGE)).toBe(0);
    expect(engineFalloff(ENGINE_RANGE + 10)).toBe(0);
  });
  it('drops off steeply with distance', () => {
    expect(engineFalloff(ENGINE_RANGE / 4)).toBeLessThan(0.5);
    expect(engineFalloff(ENGINE_RANGE / 2)).toBeLessThan(0.2);
  });
});

describe('passing bike engines', async () => {
  const { G, P } = await import('../../public/js/core/state.js');
  const { addEntity, removeEntity } = await import('../../public/js/entities/registry.js');
  const { engineSources } = await import('../../public/js/vehicles/engine.js');
  it('play from every ridden bike in traffic, not from the player\'s own ride', () => {
    G.state = 'play';
    const bike = (x, z) => addEntity({ kind: 'vehicle', K: { ambientEngine: true }, model: {}, driver: {}, x, z, v: 10, dead: false });
    const a = bike(5, 0), b = bike(-5, 3), mine = bike(0, 0);
    P.vehicle = mine;
    const s = engineSources();
    expect(s.map(e => e.key)).toEqual([a, b]);
    expect(s[0].rpm).toBeGreaterThan(2000);
    P.vehicle = null; G.state = 'loading';
    for (const e of [a, b, mine]) removeEntity(e);
  });
});
