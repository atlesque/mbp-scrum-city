// Carjacking a bike: the rider is shoved off the side away from the player and goes down on the road.
import { describe, expect, it } from 'vitest';
import { KINDS } from '../../public/js/vehicles/vehicle.js';

const rider = () => ({ x: 0, z: 0, yaw: 0, place() {} });

describe('shoving a rider off a bike', () => {
  const K = KINDS.bike;
  it('both kinds can be carjacked', () => {
    expect(KINDS.car.jack).toMatch(/driver/);
    expect(K.jack).toMatch(/rider/);
  });
  it('throws the rider to the far side from the player, facing them, knocked down', () => {
    const b = { x: 10, z: 5, yaw: 0 }; // heading +z, its right side is +x
    for (const px of [12, 8]) {
      const a = rider(); K.shoveOff(b, a, { x: px, z: 5 });
      const away = Math.sign(b.x - px);
      expect(Math.sign(a.x - b.x)).toBe(away);
      expect(Math.sign(a.svx)).toBe(away);
      expect(a.svz).toBeCloseTo(0);
      expect(a.downT).toBeGreaterThan(0);
      expect(Math.sin(a.yaw)).toBeCloseTo(-away); // facing back toward the player
    }
  });
});
