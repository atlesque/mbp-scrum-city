// The sun follows the day/night loop: up at dawn, down at dusk, below the horizon all night.
import { describe, expect, it } from 'vitest';
import { PEAK, RISE, SET, pinnedSunDir, sunAngles, sunDir } from '../../public/js/render/sunpath.js';

const len = v => Math.hypot(v.x, v.y, v.z);

describe('sun path', () => {
  it('is up through the day and down through the night', () => {
    for (const p of [0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.9, 0.95]) expect(sunAngles(p).el).toBeGreaterThan(0);
    for (const p of [0.46, 0.5, 0.6, 0.7, 0.8, 0.84]) expect(sunAngles(p).el).toBeLessThan(0);
  });
  it('sinks through dusk and climbs through dawn', () => {
    expect(sunAngles(0.38).el).toBeGreaterThan(sunAngles(0.41).el);
    expect(sunAngles(0.41).el).toBeGreaterThan(sunAngles(0.44 + 0.01).el);
    expect(sunAngles(0.92).el).toBeGreaterThan(sunAngles(0.88).el);
  });
  it('crosses the horizon at sunrise and sunset and peaks between them', () => {
    expect(sunAngles(RISE).el).toBeCloseTo(0, 6);
    expect(sunAngles(SET).el).toBeCloseTo(0, 6);
    const noon = (RISE + ((SET - RISE + 1) % 1) / 2) % 1;
    expect(sunAngles(noon).el).toBeCloseTo(PEAK, 6);
  });
  it('moves smoothly, with no jump where the loop wraps', () => {
    for (let p = 0; p < 1; p += 0.001) {
      const a = sunDir(p), b = sunDir(p + 0.001);
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.02);
    }
  });
  it('sets where the old fixed sun sat, and rises on the other side', () => {
    const set = sunDir(SET), rise = sunDir(RISE);
    expect(set.x).toBeGreaterThan(0.9);
    expect(rise.x).toBeLessThan(-0.9);
    expect(len(set)).toBeCloseTo(1, 6);
  });
  it('sinks straight down when the time of day is pinned', () => {
    expect(pinnedSunDir(0).y).toBeGreaterThan(0.1);
    expect(pinnedSunDir(1).y).toBeLessThan(0);
    expect(len(pinnedSunDir(0.5))).toBeCloseTo(1, 6);
  });
});
