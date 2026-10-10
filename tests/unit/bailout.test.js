import { describe, expect, it } from 'vitest';
import { BAIL, bailDamage, bailLaunch, hopLaunch, tumbleStep } from '../../public/js/game/bailout.js';

const roll = (yaw, v, side) => {
  const vx = Math.sin(yaw) * v, vz = Math.cos(yaw) * v, T = bailLaunch(yaw, vx, vz, side);
  const b = { x: 0, z: 0, y: 0, vx: T.vx, vz: T.vz, vy: T.vy };
  let t = 0; while (tumbleStep(b, T, 1 / 60)) t += 1 / 60;
  return { b, T, t };
};

describe('bailing out of a moving vehicle', () => {
  it('stepping out slowly does no damage', () => {
    expect(bailDamage(5, 9)).toBe(0);
    expect(bailDamage(9, 9)).toBe(0);
  });
  it('only stings a little, even at top speed', () => {
    expect(bailDamage(10, 9)).toBeGreaterThanOrEqual(BAIL.hurtMin);
    expect(bailDamage(20, 9)).toBeGreaterThan(bailDamage(10, 9));
    expect(bailDamage(46, 9)).toBeLessThanOrEqual(BAIL.hurtMax);
    expect(bailDamage(200, 9)).toBe(BAIL.hurtMax);
    expect(BAIL.hurtMax).toBeLessThanOrEqual(15);
  });
  it('throws the player out sideways, away from the vehicle', () => {
    for (const yaw of [0, 0.7, Math.PI / 2, 2.5, -1.2]) for (const side of [1, -1]) {
      const T = bailLaunch(yaw, Math.sin(yaw) * 30, Math.cos(yaw) * 30, side);
      const sx = Math.cos(yaw) * side, sz = -Math.sin(yaw) * side; // the side they go out of
      expect(T.vx * sx + T.vz * sz).toBeGreaterThanOrEqual(BAIL.out);
      // and slower along the road than the vehicle, so it pulls away ahead of them
      expect(T.vx * Math.sin(yaw) + T.vz * Math.cos(yaw)).toBeCloseTo(30 * BAIL.keep);
    }
  });
  it('ends up well clear of where the vehicle drove', () => {
    for (const v of [10, 25, 46]) {
      const { b } = roll(0, v, 1); // heading +z, door side +x
      expect(b.x).toBeGreaterThan(1.5);
      expect(b.z).toBeGreaterThan(0);
    }
  });
  it('rolls to a stop and comes up standing', () => {
    const { b, T, t } = roll(1, 40, -1);
    expect(t).toBeLessThan(4);
    expect(b.vx).toBe(0); expect(b.vz).toBe(0); expect(b.y).toBe(0);
    expect(T.roll).toBe(0);
  });
});

describe('hopping off a regular e-step', () => {
  it('the regular e-steps hop off, so a faster step that leaves the flag off keeps the roll', async () => {
    const { estep, sharestep } = await import('../../public/js/vehicles/models/estep.js');
    expect(estep.hopOff).toBe(true);
    expect(sharestep.hopOff).toBe(true);
  });
  it('jumps up and out to the door side, keeping some of the speed', () => {
    const H = hopLaunch(0, 0, 7, 1); // heading +z at 25 km/h, door side +x
    expect(H.vy).toBe(BAIL.hopUp);
    expect(H.vx).toBeCloseTo(BAIL.hopOut);
    expect(H.vz).toBeCloseTo(7 * BAIL.hopKeep);
    expect(hopLaunch(0, 0, 7, -1).vx).toBeCloseTo(-BAIL.hopOut);
  });
});
