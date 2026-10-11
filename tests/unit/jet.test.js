import { beforeEach, expect, it } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { colliders, HASH, tallBoxes, addCollider } from '../../public/js/world/collision.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { VEHICLE_MODELS, PARKED_CARS } from '../../public/js/vehicles/models/index.js';
import { jetStep } from '../../public/js/vehicles/kinds/jet.js';
import { spawnSecretJet, SECRET_JET } from '../../public/js/world/secret-jet.js';

beforeEach(() => {
  for (const e of all()) removeEntity(e);
  colliders.length = tallBoxes.length = 0; HASH.clear();
  Object.assign(G, { state: 'play', wanted: 0 }); Object.assign(P, { x: 0, z: 0, y: 0, vehicle: null });
});
it('places one hidden fighter outside normal traffic and parking rotation', () => {
  const v = spawnSecretJet(); expect(spawnSecretJet()).toBe(v);
  expect(all('vehicle').filter(v => v.model.id === 'jet')).toHaveLength(1);
  expect(v.x).toBe(SECRET_JET.x); expect(v.home).toBe(true);
  expect(VEHICLE_MODELS.jet.traffic.weight).toBe(0); expect(PARKED_CARS).not.toContain('jet');
  expect(v.mesh.grp.children.length).toBeGreaterThan(2);
});
it('needs runway speed to lift off, flies faster than a chopper and can land', () => {
  const v = spawnVehicle('jet', 230, 170, Math.PI);
  const c = { fwd: 1, side: 0, up: true, down: false, yaw: Math.PI, boost: false };
  jetStep(v, 0.1, c); expect(v.y).toBe(v.floor); expect(v.landed).toBe(true);
  for (let i = 0; i < 50; i++) jetStep(v, 0.1, c);
  expect(v.y).toBeGreaterThan(10); expect(v.v).toBeGreaterThan(24); expect(v.landed).toBe(false);
  Object.assign(v, { x: 230, z: 0, y: 0.2, vy: -1, speed: 5 });
  jetStep(v, 0.1, { ...c, fwd: -1, up: false, down: true });
  expect(v.landed).toBe(true); expect(v.y).toBe(v.floor);
});
it('provides aircraft weapons and a safe exit', () => {
  const v = spawnVehicle('jet', 230, 0, 0);
  expect(typeof v.K.guns).toBe('function'); expect(v.K.shieldsDriver).toBe(true);
  Object.assign(v, { y: 25, speed: 40, landed: false });
  expect(v.K.airborne(v)).toBe(true);
  const exit = v.K.exitAt(v); expect(Math.hypot(exit.x - v.x, exit.z - v.z)).toBeGreaterThan(2);
});

it('collides with tall buildings and loses speed and hull strength', () => {
  const v = spawnVehicle('jet', 0, 0, 0);
  addCollider(-8, 8, 3, 8, 40, true);
  Object.assign(v, { y: 20, speed: 40, landed: false });
  const hp = v.hp;
  jetStep(v, 0.1, { fwd: 1, side: 0, yaw: 0 });
  expect(v.speed).toBe(0); expect(v.hp).toBeLessThan(hp);
});
