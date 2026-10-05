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
