import { describe, expect, it } from 'vitest';
import { AIM_CLOSE, AIM_FLOOR, AIM_HALF, aimFalloff, REACT_MAX, REACT_MIN, newSight, reactTo } from '../../public/js/combat/sight.js';

// steps a sight record with the player in view until it is ready; returns how long that took
function reactionTime(s, dt = 0.001) {
  let t = 0;
  reactTo(s, true, dt);
  while (!reactTo(s, true, dt)) t += dt;
  return t;
}

describe('shooter line of sight', () => {
  it('never fires at a player out of view', () => {
    const s = newSight();
    for (let i = 0; i < 100; i++) expect(reactTo(s, false, 0.05)).toBe(false);
  });
  it('waits 50 to 200 ms after the player comes into view', () => {
    for (let i = 0; i < 50; i++) {
      const t = reactionTime(newSight());
      expect(t).toBeGreaterThanOrEqual(REACT_MIN - 0.002);
      expect(t).toBeLessThanOrEqual(REACT_MAX + 0.002);
    }
    expect(REACT_MIN).toBe(0.05); expect(REACT_MAX).toBe(0.2);
  });
  it('starts the reaction over when the player ducks out of view', () => {
    const s = newSight();
    reactionTime(s);
    expect(reactTo(s, true, 0.016)).toBe(true);
    expect(reactTo(s, false, 0.016)).toBe(false);
    expect(reactTo(s, true, 0.016)).toBe(false);
  });
});

describe('accuracy over distance', () => {
  it('keeps full accuracy up close', () => {
    expect(aimFalloff(0)).toBe(1);
    expect(aimFalloff(AIM_CLOSE)).toBe(1);
  });
  it('halves the hit chance every AIM_HALF metres past close range', () => {
    expect(aimFalloff(AIM_CLOSE + AIM_HALF)).toBeCloseTo(0.5);
    expect(aimFalloff(AIM_CLOSE + 2 * AIM_HALF)).toBeCloseTo(0.25);
  });
  it('only ever drops as the player gets further away, down to a floor', () => {
    let last = 1;
    for (let d = 0; d <= 200; d += 2) { const f = aimFalloff(d); expect(f).toBeLessThanOrEqual(last); last = f; }
    expect(aimFalloff(500)).toBe(AIM_FLOOR);
  });
  it('falls off steeply: a quarter of the close-range chance by 24 m, near the floor by 40 m', () => {
    expect(aimFalloff(24)).toBeLessThanOrEqual(0.25);
    expect(aimFalloff(40)).toBeLessThan(0.08);
  });
  it('lets a shooter set its own close range', () => {
    expect(aimFalloff(30, 32)).toBe(1);
    expect(aimFalloff(32 + AIM_HALF, 32)).toBeCloseTo(0.5);
  });
});
