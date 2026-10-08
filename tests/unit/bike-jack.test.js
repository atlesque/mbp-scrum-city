// Carjacking a bike: the rider is shoved off the side away from the player and goes down on the road.
import { describe, expect, it } from 'vitest';
import { KINDS, spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { SHOVE, THROWN } from '../../public/js/vehicles/kinds/bike.js';
import { spawnNpc } from '../../public/js/npcs/npc.js';

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

describe('a melee blow on a civilian at the wheel', () => {
  const at = (model, x, z, yaw, v) => { const veh = spawnVehicle(model, x, z, yaw, 'traffic'); veh.v = v; return veh; };
  it('gets a driver out of the car to run, leaving it parked', () => {
    const c = at('sedan', 0, 0, 0, 0), a = spawnNpc('motorist', 0, 0); c.seatDriver(a);
    expect(c.scareDriver({ x: 3, z: 0 })).toBe(a);
    expect(c.driver).toBeNull(); expect(a.vehicle).toBeNull();
    expect(a.state).toBe('flee'); expect(c.mode).toBe('parked');
  });
  it('throws a rider off a moving bike harder than a carjack shove, carrying some speed, and down for longer', () => {
    const b = at('gs', 0, 0, 0, 12), a = spawnNpc('biker', 0, 0); b.seatDriver(a);
    expect(b.scareDriver({ x: 2, z: 0 })).toBe(a);
    expect(b.fallen).toBe(true); expect(a.state).toBe('flee');
    expect(a.svx).toBeCloseTo(-THROWN.v); expect(a.svz).toBeGreaterThan(0);
    expect(THROWN.v).toBeGreaterThan(SHOVE.v); expect(a.downT).toBe(THROWN.down);
  });
  it('leaves nobody but civilians and an empty seat alone', () => {
    const c = at('sedan', 0, 0, 0, 0);
    expect(c.scareDriver({ x: 3, z: 0 })).toBeNull();
    const cop = spawnNpc('motorist', 0, 0); cop.faction = 'law'; c.seatDriver(cop);
    expect(c.scareDriver({ x: 3, z: 0 })).toBeNull(); expect(c.driver).toBe(cop);
  });
});
