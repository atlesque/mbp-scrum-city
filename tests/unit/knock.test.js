// Ramming rules: cars send bikes flying, bikes only knock each other over at speed, nothing knocks a car.
import { describe, expect, it } from 'vitest';
import { closingSpeed, knockImpulse, touching } from '../../public/js/vehicles/knock.js';
import { KINDS } from '../../public/js/vehicles/vehicle.js';

const at = (kind, x, z, yaw, v) => ({ K: KINDS[kind], x, z, yaw, v, dead: false });

describe('ramming', () => {
  it('a car hitting a parked bike sends it flying and barely slows down', () => {
    const c = at('car', 0, 0, 0, 20), b = at('bike', 0, 2.4, Math.PI / 2, 0);
    expect(touching(c, b)).toBe(true);
    const k = knockImpulse(c, b);
    expect(k).not.toBeNull();
    expect(k.vz).toBeGreaterThan(20); // thrown faster than the car is going
    expect(k.up).toBeGreaterThan(0);
    expect(k.keep).toBeGreaterThan(0.8);
  });
  it('a car creeping into a bike only nudges it', () => {
    expect(knockImpulse(at('car', 0, 0, 0, 2), at('bike', 0, 2.6, 0, 0))).toBeNull();
  });
  it('a bike knocks another bike over only at speed', () => {
    const b = at('bike', 0, 1.5, Math.PI / 2, 0);
    expect(knockImpulse(at('bike', 0, 0, 0, 6), b)).toBeNull();
    const k = knockImpulse(at('bike', 0, 0, 0, 18), b);
    expect(k).not.toBeNull();
    expect(k.keep).toBeLessThan(0.9); // the rider feels it more than a car does
  });
  it('a bike shoves a bike lying in the road at any real speed', () => {
    const down = Object.assign(at('bike', 0, 1.5, 0, 0), { fallen: true });
    expect(knockImpulse(at('bike', 0, 0, 0, 6), down)).not.toBeNull();
  });
  it('a bike catching up with a bike going the same way barely closes on it', () => {
    expect(knockImpulse(at('bike', 0, 0, 0, 20), at('bike', 0, 1.5, 0, 16))).toBeNull();
  });
  it('nothing knocks a car around', () => {
    expect(knockImpulse(at('bike', 0, 0, 0, 40), at('car', 0, 3, 0, 0))).toBeNull();
    expect(knockImpulse(at('car', 0, 0, 0, 40), at('car', 0, 4, 0, 0))).toBeNull();
  });
  it('measures closing speed head on', () => {
    expect(closingSpeed(at('bike', 0, 0, 0, 10), at('bike', 0, 5, Math.PI, 10)).closing).toBeCloseTo(20);
  });
});
