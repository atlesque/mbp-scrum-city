import { describe, expect, it } from 'vitest';
import { LEAD, MAX_INTENSITY, MUSIC_LAYERS, musicLayers } from '../../public/js/data/music.js';
import { HEAT } from '../../public/js/data/wanted.js';

describe('wanted-level music', () => {
  it('plays synths but no drums at zero stars', () => {
    const on = musicLayers(0);
    expect(on.pad && on.bass).toBe(true);
    expect(on.kick || on.snare || on.hats).toBe(false);
  });
  it('brings the drums in at one star', () => {
    const on = musicLayers(1);
    expect(on.kick && on.snare && on.hats).toBe(true);
  });
  it('adds at least one layer with every star and never drops one', () => {
    expect(MAX_INTENSITY).toBe(HEAT.length - 1);
    const count = l => Object.values(musicLayers(l)).filter(Boolean).length;
    for (let l = 1; l <= MAX_INTENSITY; l++) {
      expect(count(l)).toBeGreaterThan(count(l - 1));
      for (const [k, v] of Object.entries(musicLayers(l - 1))) if (v) expect(musicLayers(l)[k], k).toBe(true);
    }
    expect(Object.values(musicLayers(MAX_INTENSITY)).every(Boolean)).toBe(true);
  });
  it('clamps odd levels', () => {
    expect(musicLayers(-3)).toEqual(musicLayers(0));
    expect(musicLayers(99)).toEqual(musicLayers(MAX_INTENSITY));
    expect(musicLayers(undefined)).toEqual(musicLayers(0));
    expect(Object.keys(musicLayers(2))).toEqual(Object.keys(MUSIC_LAYERS));
  });
  it('keeps the lead inside one bar', () => {
    for (const [at, tone, , len] of LEAD) { expect(at + len).toBeLessThanOrEqual(16); expect(tone).toBeLessThan(3); }
  });
});
