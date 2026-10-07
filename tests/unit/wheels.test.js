// Spinning wheels (vehicles/wheels.js): every vehicle names its wheels, and they turn by how far it rolled.
import { describe, expect, it } from 'vitest';
import { VEHICLE_MODELS } from '../../public/js/vehicles/models/index.js';
import { KINDS } from '../../public/js/vehicles/vehicle.js';
import { rolling, spinWheels, wheelAt } from '../../public/js/vehicles/wheels.js';

describe('spinning wheels', () => {
  for (const [id, m] of Object.entries(VEHICLE_MODELS)) it(`${id} names its wheels`, () => {
    const mesh = KINDS[m.kind].build({ model: { ...m, decal: () => new THREE.MeshBasicMaterial() } }); // decals need a canvas
    expect(mesh.wheels.length).toBe({ bike: 2, car: 4, truck: 6 }[m.kind]);
    for (const w of mesh.wheels) {
      expect(w.userData.r).toBeGreaterThan(0.2);
      expect(w.userData.r).toBeLessThan(m.kind === 'truck' ? 0.6 : 0.5);
      // sits on the ground, its axle at its radius
      const p = w.getWorldPosition(new THREE.Vector3());
      if (m.kind !== 'bike') expect(Math.abs(p.y - w.userData.r)).toBeLessThan(0.02);
    }
  });
  it('turns a wheel one radian per radius rolled, backwards in reverse', () => {
    const w = wheelAt(new THREE.BufferGeometry(), null, 0, 0.3, 0, 0.3);
    spinWheels([w], 0.3); expect(w.rotation.x).toBeCloseTo(1);
    spinWheels([w], -0.6); expect(w.rotation.x).toBeCloseTo(-1);
  });
  it('rolls with the speed along the vehicle, not while wrecked or airborne', () => {
    expect(rolling({ v: 12, yaw: 0 })).toBe(12);
    expect(rolling({ v: -3, yaw: 0 })).toBe(-3);
    expect(rolling({ v: 0, yaw: Math.PI / 2, kvx: 5, kvz: 0 })).toBeCloseTo(5); // shoved along its length
    expect(rolling({ v: 0, yaw: 0, kvx: 5, kvz: 0 })).toBeCloseTo(0); // shoved sideways: the tyres skid
    expect(rolling({ v: 10, yaw: 0, dead: true })).toBe(0);
    expect(rolling({ v: 10, yaw: 0, air: 0.5 })).toBe(0);
  });
});
