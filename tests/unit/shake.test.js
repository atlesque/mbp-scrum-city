// Explosion screen shake: harder the closer and bigger the blast, nothing far away, stacking up to a cap.
import { describe, expect, it } from 'vitest';
import { SHAKE, blastShake, stackShake } from '../../public/js/combat/shake.js';

describe('explosion screen shake', () => {
  it('shakes harder the closer the blast', () => {
    const at = [0, 5, 10, 20, 30].map(d => blastShake(10, d));
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeLessThan(at[i - 1]);
    expect(at[0]).toBeCloseTo(1);
  });
  it('does not shake beyond a few blast radii', () => {
    expect(blastShake(10, 10 * SHAKE.reachMul)).toBe(0);
    expect(blastShake(10, 200)).toBe(0);
    expect(blastShake(6, 30)).toBe(0); // a bike's blast does not reach as far as a rocket's
    expect(blastShake(10, 30)).toBeGreaterThan(0);
  });
  it('bigger blasts shake harder at the same distance', () => {
    expect(blastShake(15, 8)).toBeGreaterThan(blastShake(9, 8));
    expect(blastShake(9, 8)).toBeGreaterThan(blastShake(6, 8));
  });
  it('stacks blasts up to a cap and never cuts a running shake short', () => {
    let s = stackShake(0, blastShake(10, 15));
    const one = s;
    s = stackShake(s, blastShake(10, 15));
    expect(s).toBeCloseTo(one * 2);
    for (let i = 0; i < 10; i++) s = stackShake(s, blastShake(10, 0));
    expect(s).toBe(SHAKE.cap);
    expect(stackShake(1.3, 0)).toBe(1.3);
  });
});
