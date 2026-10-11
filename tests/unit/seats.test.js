// Passenger seats for riding together in multiplayer (vehicles/seats.js)
import { describe, expect, it } from 'vitest';
import { SEATS, seatOffset, seatsOf } from '../../public/js/vehicles/seats.js';

describe('passenger seats', () => {
  it('four in a car, a truck or a chopper, two on a bike or a step', () => {
    expect(SEATS).toEqual({ car: 4, truck: 4, heli: 4, bike: 2, step: 2 });
    expect(seatsOf({ model: { kind: 'truck' } })).toBe(4);
    expect(seatsOf({ model: { kind: 'tank' } })).toBe(1);
  });
  it('mirrors the driver across a car, then a row back', () => {
    const p = { x: 0.4, y: 0.3, z: 0.1 };
    expect(seatOffset('car', p, 1)).toEqual({ x: -0.4, y: 0.3, z: 0.1 });
    expect(seatOffset('car', p, 2)).toEqual({ x: 0.4, y: 0.3, z: 0.1 - 0.95 });
    expect(seatOffset('car', p, 3)).toEqual({ x: -0.4, y: 0.3, z: 0.1 - 0.95 });
    expect(seatOffset('heli', { x: 0, y: 1, z: 0 }, 1).x).toBe(-0.45); // a pilot in the middle: the others either side
  });
  it('puts the second rider behind the first on a bike or a step', () => {
    const p = { x: 0, y: 0.9, z: 0.2 };
    expect(seatOffset('bike', p, 1)).toEqual({ x: 0, y: 0.96, z: 0.2 - 0.5 });
    expect(seatOffset('step', p, 1).z).toBeLessThan(p.z);
  });
});
