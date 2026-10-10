// E-steps (vehicles/kinds/step.js, models/estep.js): a slow, light, silent ride that keeps to the kerb in traffic.
import { describe, expect, it } from 'vitest';
import { NPC_TYPES } from '../../public/js/npcs/types.js';
import { arcadeDrive, keepOnGrid } from '../../public/js/vehicles/drive.js';
import { knockImpulse, rideOver } from '../../public/js/vehicles/knock.js';
import { VEHICLE_MODELS } from '../../public/js/vehicles/models/index.js';
import { laneFor } from '../../public/js/vehicles/traffic.js';
import { KINDS, gunIt } from '../../public/js/vehicles/vehicle.js';

const K = KINDS.step;
const at = (kind, x, z, yaw, v) => ({ K: KINDS[kind], x, z, yaw, v, dead: false });
const kmh = v => v * 3.6;

describe('e-steps', () => {
  it('come as two models of the step kind, electric, with a rider type to go with them', () => {
    const steps = Object.values(VEHICLE_MODELS).filter(m => m.kind === 'step' && m.traffic.weight > 0); // the pimped one: pimpstep.test.js
    expect(steps.map(m => m.id)).toEqual(['estep', 'sharestep']);
    for (const m of steps) { expect(m.electric).toBe(true); expect(kmh(m.traffic.speed[1])).toBeLessThanOrEqual(25); }
    expect(NPC_TYPES.stepper.behaviour).toBe('ride');
  });
  it('top out at 25 km/h, 30 in sport mode', () => {
    for (const boost of [false, true]) {
      const v = { H: { ...K.handling }, x: 0, z: 0, yaw: 0, v: 0, steer: 0 };
      for (let i = 0; i < 600; i++) arcadeDrive(v, 1 / 30, { throttle: true, boost, steer: 0 }, 0.92);
      expect(kmh(v.v)).toBeGreaterThan(boost ? 28 : 23);
      expect(kmh(v.v)).toBeLessThan(boost ? 30.5 : 25.5);
    }
  });
  it('a shot-at stepper speeds up only as far as the step goes', () => {
    const s = { H: { ...K.handling }, top: 6 }; gunIt(s); expect(s.top).toBe(K.handling.boostTop);
    const b = { H: { ...KINDS.bike.handling }, top: 15 }; gunIt(b); expect(b.top).toBe(24);
  });
  it('ride by the kerb, clear of the cars', () => {
    expect(laneFor(0, 0, 1, K.lane).x).toBe(-5);
    expect(laneFor(0, 1, 0, K.lane).z).toBe(5);
    expect(Math.abs(K.lane - 3)).toBeGreaterThan(KINDS.car.laneHalf); // a car in its lane doesn't block one
    // and turn onto the ring road into the kerb-side lane too
    const v = { K, x: 50 - K.lane, z: 196, dirX: 0, dirZ: 1, v: 6, edgeT: -1 }; keepOnGrid(v, 0.1);
    expect(Math.abs(v.z - 200)).toBe(K.lane);
  });
  it('anything bigger sends one flying, and it can\'t ride up over a car', () => {
    expect(knockImpulse(at('car', 0, 0, 0, 8), at('step', 0, 2.4, 0, 0))).not.toBeNull();
    expect(knockImpulse(at('bike', 0, 0, 0, 6), at('step', 0, 1.2, 0, 0))).not.toBeNull();
    expect(knockImpulse(at('step', 0, 0, 0, 7), at('bike', 0, 1.2, 0, 0))).toBeNull();
    expect(rideOver(at('step', 0, 0, 0, 5), at('car', 0, 2.4, 0, 0))).toBeNull();
  });
  it('the rider stands on the deck and can be shoved off like a biker', () => {
    expect(K.jack).toMatch(/rider/);
    const mesh = K.build({ model: VEHICLE_MODELS.estep });
    expect(mesh.seat.position.y).toBeGreaterThan(0.1); expect(mesh.seat.position.y).toBeLessThan(0.2);
    expect(K.wheelie).toBeUndefined();
    expect(K.ambientEngine).toBe(false);
  });
});
