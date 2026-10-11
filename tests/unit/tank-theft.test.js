import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeCharacter } from '../../public/js/characters/character.js';
import { G, P, I, cam } from '../../public/js/core/state.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { exitVehicle } from '../../public/js/game/player.js';
import { spawnTank, takeTank, TANK_HP } from '../../public/js/vehicles/tank.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { colliders, HASH, tallBoxes } from '../../public/js/world/collision.js';

afterEach(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
  vi.stubGlobal('document', { getElementById: () => ({ style: {} }) });
  for (const e of all()) removeEntity(e);
  colliders.length = tallBoxes.length = 0; HASH.clear();
  Object.assign(G, { state: 'play', wanted: 5, time: 0 });
  Object.assign(P, { c: makeCharacter({ skin: '#d8ad80', shirt: '#fff', pants: '#345', hair: '#321' }), x: 0, z: 0, y: 0, alive: true, hp: 100, vehicle: null, club: null, roof: null });
});
it('takes a slow tank, preserves damage and turret, stops the AI, then allows re-entry', () => {
  const t = spawnTank(); Object.assign(t, { x: 0, z: 0, v: 0, hp: TANK_HP / 2, turretYaw: 1 });
  P.x = 2.5; P.z = 0;
  expect(t.interaction(P)?.keys).toContain('ride');
  const v = takeTank(t);
  expect(t.removed).toBe(true); expect(G.tank).toBeNull();
  expect(P.vehicle).toBe(v); expect(v.hp).toBe(TANK_HP / 2); expect(v.turretYaw).toBe(1);
  exitVehicle(false); expect(P.vehicle).toBeNull(); expect(v.interaction(P)).not.toBeNull();
});
it('refuses dead, moving, distant or already stolen tanks', () => {
  const t = spawnTank(); t.x = 0; t.z = 0; P.x = 2.5;
  t.v = 7; expect(t.interaction(P)).toBeNull(); expect(takeTank(t)).toBeNull();
  t.v = 0; P.x = 30; expect(takeTank(t)).toBeNull();
  P.x = 2.5; t.dead = true; expect(takeTank(t)).toBeNull();
});
it('pivots on its tracks and fires its cannon with a reload instead of the hand weapon', () => {
  const v = spawnVehicle('tank', 0, 0, 0); v.driver = P; P.vehicle = v;
  v.K.drive(v, 1, { steer: 1 }); expect(v.yaw).not.toBe(0);
  I.mouseL = true; cam.yaw = v.turretYaw = 0; cam.pitch = 0; v.cannonT = 0;
  v.K.guns(v, 0.1); expect(v.cannonT).toBeGreaterThan(3);
  const reload = v.cannonT; v.K.guns(v, 0.1); expect(v.cannonT).toBeCloseTo(reload - 0.1);
  I.mouseL = false;
});

it('keeps its armor when stolen, resisting gunfire and surviving a rocket', () => {
  const v = spawnVehicle('tank', 0, 0, 0), hp = v.hp;
  v.onShot({ p: new THREE.Vector3(0, 1, 0) }, 40, null);
  expect(v.hp).toBeCloseTo(hp - 4);
  v.onRocket(200); expect(v.hp).toBeCloseTo(hp - 124);
  expect(v.burnT || 0).toBe(0); expect(v.dead).toBe(false);
});
