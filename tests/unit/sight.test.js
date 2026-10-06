import { describe, expect, it } from 'vitest';
import { REACT_MAX, REACT_MIN, newSight, reactTo } from '../../public/js/combat/sight.js';

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
