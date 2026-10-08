// Wheelies: hold the wheelie key on the gas and the front comes up and stays; boost too long and it loops over.
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../public/js/vehicles/vehicle.js';
import { wheelie } from '../../public/js/vehicles/kinds/bike.js';
import { PRESETS } from '../../public/js/core/keymap.js';

const W = KINDS.bike.wheelie, DT = 1 / 60;
const bike = (v = 15) => ({ v, pop: 0, popW: 0, model: { spec: { wb: 1.52 } } });
const run = (b, c, s) => { for (let t = 0; t < s; t += DT) { wheelie(b, DT, c); if (b.looped) break; } return b; };

describe('wheelies', () => {
  it('has a key in both presets', () => {
    expect(PRESETS.qwerty.wheelie).toBe('KeyC');
    expect(PRESETS.azerty.wheelie).toBe('KeyC');
  });
  it('holding the key on the gas lifts the front and holds it near the ride angle', () => {
    const b = run(bike(), { wheelie: true, throttle: true }, 0.2);
    expect(b.pop).toBeGreaterThan(W.pop * 0.9);
    run(b, { wheelie: true, throttle: true }, 6);
    expect(b.pop).toBeGreaterThan(W.ride - 0.05); expect(b.pop).toBeLessThan(W.max);
    expect(b.looped).toBeFalsy();
  });
  it('needs some speed and the gas', () => {
    expect(run(bike(2), { wheelie: true, throttle: true }, 1).pop).toBe(0);
    expect(run(bike(), { wheelie: true }, 1).pop).toBe(0);
  });
  it('lets go: the front drops and lands with a thump', () => {
    const b = run(bike(), { wheelie: true, throttle: true }, 2);
    run(b, { throttle: true }, 1);
    expect(b.pop).toBe(0); expect(b.landV).toBeGreaterThan(3);
  });
  it('the back brake brings it down', () => {
    const b = run(bike(), { wheelie: true, throttle: true }, 2);
    run(b, { wheelie: true, throttle: true, handbrake: true }, 0.5);
    expect(b.pop).toBe(0);
  });
  it('boosting too long loops it over', () => {
    const b = run(bike(), { wheelie: true, throttle: true, boost: true }, 3);
    expect(b.looped).toBe(true);
  });
  it('cuts the steering while the front is up', () => {
    const K = KINDS.bike, mk = pop => ({ ...bike(15), x: 0, z: 0, yaw: 0, steer: 0, yawRate: 0, pop, H: { ...K.handling } });
    const c = { throttle: true, steer: 1 }, low = mk(0), up = mk(W.ride);
    for (let i = 0; i < 30; i++) { K.drive(low, DT, c); K.drive(up, DT, { ...c, wheelie: true }); }
    expect(Math.abs(up.yaw)).toBeLessThan(Math.abs(low.yaw) * 0.7);
  });
});
