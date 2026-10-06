import { describe, expect, it } from 'vitest';
import { FLING, airborne, blastLaunch, flyStep, launch, settleFlip } from '../../public/js/npcs/fling.js';

describe('bodies thrown by explosions', () => {
  it('nothing outside the blast radius is thrown', () => {
    expect(blastLaunch(7, 0, 7)).toBeNull();
    expect(blastLaunch(5, 5, 7)).toBeNull();
  });
  it('throws outward and up, harder near the centre', () => {
    const near = blastLaunch(1, 0, 8), far = blastLaunch(0, -6, 8);
    expect(near.vx).toBeGreaterThan(0); expect(Math.abs(near.vz)).toBeLessThan(1e-9);
    expect(far.vz).toBeLessThan(0);
    expect(near.vx).toBeGreaterThan(-far.vz);
    expect(near.vy).toBeGreaterThan(far.vy);
    expect(far.vy).toBeGreaterThanOrEqual(FLING.minUp);
  });
  it('a body on the centre still goes somewhere', () => {
    const l = blastLaunch(0, 0, 8, () => 0.25);
    expect(Math.hypot(l.vx, l.vz)).toBeCloseTo(FLING.maxOut);
  });
  it('a more powerful blast (a rocket) throws further', () => {
    const flight = power => { const b = { x: 0, z: 0 }; launch(b, blastLaunch(2, 0, 8, Math.random, power)); for (let t = 0; t < 5 && flyStep(b, 1 / 60); t += 1 / 60); return b.x; };
    expect(flight(1.7)).toBeGreaterThan(flight(1) * 1.8);
  });
  it('flies, lands, bounces and settles on the ground', () => {
    const b = { x: 0, z: 0 };
    launch(b, blastLaunch(1, 0, 8));
    expect(airborne(b)).toBe(true);
    let peak = 0, t = 0;
    while (t < 5) { const up = flyStep(b, 1 / 60); peak = Math.max(peak, b.y); t += 1 / 60; if (!up) break; }
    expect(peak).toBeGreaterThan(2);
    expect(b.x).toBeGreaterThan(10);
    expect(b.y).toBe(0); expect(airborne(b)).toBe(false);
    expect(t).toBeLessThan(5);
  });
  it('the tumble eases back to lying flat', () => {
    const b = { flip: Math.PI * 2 + 0.6 };
    for (let i = 0; i < 120; i++) settleFlip(b, 1 / 60);
    expect(b.flip).toBe(0);
  });
});

describe('vehicles thrown by explosions', () => {
  it('a rocket throws a wreck further than a car going up does', async () => {
    const { blastThrow } = await import('../../public/js/vehicles/knock.js');
    const r = () => 0.5, base = blastThrow(3, 0, 10, 4, r), rocket = blastThrow(3, 0, 10, 4, r, 1.7);
    expect(rocket.vx).toBeCloseTo(base.vx * 1.7);
    expect(rocket.up).toBeGreaterThan(base.up);
  });
});
