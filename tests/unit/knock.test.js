// Ramming rules: cars send bikes flying, bikes only knock each other over at speed, cars shove cars.
import { describe, expect, it } from 'vitest';
import { blastThrow, closingSpeed, knockImpulse, rideOver, shoveImpulse, touching, velocity } from '../../public/js/vehicles/knock.js';
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
  it('a car still knocks a burnt-out bike aside', () => {
    const wreck = Object.assign(at('bike', 0, 2.4, Math.PI / 2, 0), { dead: true, fallen: true });
    expect(knockImpulse(at('car', 0, 0, 0, 20), wreck)).not.toBeNull();
  });
  it('a car still shoves a burnt-out car along', () => {
    const wreck = Object.assign(at('car', 0, 4.4, 0, 0), { dead: true });
    expect(shoveImpulse(at('car', 0, 0, 0, 15), wreck).vz).toBeGreaterThan(5);
  });
  it('nothing knocks a car around', () => {
    expect(knockImpulse(at('bike', 0, 0, 0, 40), at('car', 0, 3, 0, 0))).toBeNull();
    expect(knockImpulse(at('car', 0, 0, 0, 40), at('car', 0, 4, 0, 0))).toBeNull();
  });
  it('measures closing speed head on', () => {
    expect(closingSpeed(at('bike', 0, 0, 0, 10), at('bike', 0, 5, Math.PI, 10)).closing).toBeCloseTo(20);
  });
});

describe('shoving', () => {
  it('a car rear-ending a stopped car pushes it on and slows right down', () => {
    const a = at('car', 0, 0, 0, 20), b = at('car', 0, 4.4, 0, 0);
    const k = shoveImpulse(a, b);
    expect(k).not.toBeNull();
    expect(k.vz).toBeGreaterThan(10); // b goes on faster than a, so they part
    expect(k.avz).toBeLessThan(k.vz);
    expect(Math.abs(k.spin)).toBeLessThan(0.1); // square on: no spin
  });
  it('a T-bone at the front sends the car skidding sideways and spinning', () => {
    const a = at('car', 0, 0, 0, 15), b = at('car', 1.2, 3.1, Math.PI / 2, 0);
    const k = shoveImpulse(a, b);
    expect(k).not.toBeNull();
    expect(k.vz).toBeGreaterThan(5);
    expect(Math.abs(k.spin)).toBeGreaterThan(0.3);
  });
  it('cars only touching, or pulling apart, are not shoved', () => {
    expect(shoveImpulse(at('car', 0, 0, 0, 0), at('car', 0, 4.4, 0, 0))).toBeNull();
    expect(shoveImpulse(at('car', 0, 0, 0, -5), at('car', 0, 4.4, 0, 0))).toBeNull();
    expect(shoveImpulse(at('car', 0, 0, 0, 20), at('car', 0, 9, 0, 0))).toBeNull(); // not touching at all
  });
  it('bikes are knocked flying rather than shoved, and a bike cannot shove a car', () => {
    expect(shoveImpulse(at('car', 0, 0, 0, 20), at('bike', 0, 2.4, 0, 0))).toBeNull();
    expect(shoveImpulse(at('bike', 0, 0, 0, 30), at('car', 0, 2.9, 0, 0))).toBeNull();
  });
  it('reads a skidding car by its sliding velocity', () => {
    expect(velocity(Object.assign(at('car', 0, 0, 0, 10), { kvx: 3, kvz: -1 }))).toEqual({ x: 3, z: -1 });
  });
});

describe('wrecks thrown by blasts', () => {
  it('throws a wreck away from the blast and up, harder the closer it is', () => {
    const near = blastThrow(2, 0, 7, 1), far = blastThrow(6, 0, 7, 1);
    expect(near.vx).toBeGreaterThan(far.vx);
    expect(far.vx).toBeGreaterThan(0);
    expect(near.vz).toBeCloseTo(0);
    expect(near.up).toBeGreaterThan(far.up);
  });
  it('throws a car less far than a bike', () => {
    expect(blastThrow(3, 0, 7, KINDS.car.ram.mass).vx).toBeLessThan(blastThrow(3, 0, 7, KINDS.bike.ram.mass).vx);
  });
  it('leaves alone what is out of reach, and the vehicle going up at the centre', () => {
    expect(blastThrow(8, 0, 7, 1)).toBeNull();
    expect(blastThrow(0, 0, 7, 1)).toBeNull();
  });
});

describe('riding over cars', () => {
  it('a bike nosing into a parked car rides up over it', () => {
    const b = at('bike', 0, 0, 0, 8), c = at('car', 0, 3.1, 0, 0);
    expect(rideOver(b, c)).toBeCloseTo(8);
  });
  it('a bike hitting a car hard crashes into it instead', () => {
    expect(rideOver(at('bike', 0, 0, 0, 20), at('car', 0, 3.1, 0, 0))).toBeNull();
  });
  it('a bike catching up with a car going the same way rides over it, but not one coming head-on', () => {
    expect(rideOver(at('bike', 0, 0, 0, 20), at('car', 0, 3.1, 0, 14))).not.toBeNull();
    expect(rideOver(at('bike', 0, 0, 0, 8), at('car', 0, 3.1, Math.PI, 8))).toBeNull();
  });
  it('a bike rides over a wreck, but not a car in the air, and not while barely rolling', () => {
    expect(rideOver(at('bike', 0, 0, 0, 8), Object.assign(at('car', 0, 3.1, 0, 0), { dead: true }))).not.toBeNull();
    expect(rideOver(at('bike', 0, 0, 0, 8), Object.assign(at('car', 0, 3.1, 0, 0), { air: 1 }))).toBeNull();
    expect(rideOver(at('bike', 0, 0, 0, 1), at('car', 0, 3.1, 0, 0))).toBeNull();
  });
  it('only bikes ride over, and only over cars that are in reach', () => {
    expect(rideOver(at('car', 0, 0, 0, 8), at('car', 0, 4.4, 0, 0))).toBeNull();
    expect(rideOver(at('bike', 0, 0, 0, 8), at('bike', 0, 1.5, 0, 0))).toBeNull();
    expect(rideOver(at('bike', 0, 0, 0, 8), at('car', 0, 6, 0, 0))).toBeNull();
  });
  it('a car is low at the bumpers, highest at the roof, and nothing off its body', () => {
    const c = at('car', 0, 0, 0, 0), top = z => KINDS.car.topAt(c, 0, z);
    expect(top(2.1)).toBeLessThan(0.9);
    expect(top(0)).toBeGreaterThan(1.4);
    expect(top(1.5)).toBeGreaterThan(top(2.1));
    expect(top(-1.5)).toBeLessThan(top(0));
    expect(KINDS.car.topAt(c, 0.98, 0)).toBeLessThan(top(0));
    expect(top(2.5)).toBe(-Infinity);
  });
});
