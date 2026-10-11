import { beforeEach, expect, it } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { colliders, HASH, tallBoxes } from '../../public/js/world/collision.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { spawnRoadblock, updateRoadblocks } from '../../public/js/game/roadblocks.js';

beforeEach(() => {
  for (const e of all()) removeEntity(e);
  colliders.length = tallBoxes.length = 0; HASH.clear();
  Object.assign(G, { state: 'play', wanted: 4 });
  Object.assign(P, { x: 0, z: 0, y: 0, yaw: 0, alive: true, club: null, roof: null, vehicle: null });
});
it('deploys ahead at higher wanted levels, caps the count and clears with the heat', () => {
  G.wanted = 2; updateRoadblocks(30); expect(all('roadblock')).toHaveLength(0);
  G.wanted = 3; updateRoadblocks(30); expect(all('roadblock')).toHaveLength(1);
  expect(all('roadblock')[0].z).toBeGreaterThan(30);
  expect(all('roadblock')[0].spikes).toBe(false);
  G.wanted = 4; for (let i = 0; i < 10; i++) updateRoadblocks(30);
  expect(all('roadblock').length).toBeLessThanOrEqual(2);
  G.wanted = 0; updateRoadblocks(0.1);
  expect(all('roadblock')).toHaveLength(0); expect(colliders).toHaveLength(0);
});
it('punctures civilian tyres on a fast crossing and restores handling after repair', () => {
  const r = spawnRoadblock(0, 50, 0, true), v = spawnVehicle('sedan', 0, 39, 0);
  const top = v.H.top; v.v = 30; r.update(0.1); v.z = 55; r.update(0.1);
  expect(v.tiresFlat).toBe(true); expect(v.H.top).toBeLessThan(top);
  const slow = v.H.top; r.update(0.1); expect(v.H.top).toBe(slow);
  v.repair(20); expect(v.tiresFlat).toBe(false); expect(v.H.top).toBe(top);
});
it('does not puncture airborne vehicles or tank tracks and releases collision on destruction', () => {
  const r = spawnRoadblock(0, 50, 0, true), v = spawnVehicle('sedan', 0, 44, 0);
  v.air = 2; r.update(0.1); expect(v.tiresFlat).toBeUndefined();
  const t = spawnVehicle('tank', 0, 44, 0); r.update(0.1); expect(t.tiresFlat).toBeUndefined();
  expect(colliders.length).toBeGreaterThan(0); r.damage(1000);
  expect(r.removed).toBe(true); expect(colliders).toHaveLength(0);
});

it('lets a fast car break a barricade at a cost, while tank tracks crush it', () => {
  const r = spawnRoadblock(0, 50, 0, true), v = spawnVehicle('sedan', 3.8, 49, 0), hp = v.hp;
  v.v = 20; r.ram(v);
  expect(r.removed).toBe(true); expect(v.hp).toBeLessThan(hp); expect(v.v).toBe(10);
  const second = spawnRoadblock(0, 50, 0, true), t = spawnVehicle('tank', 3.8, 46, 0);
  t.v = 6; t.K.drive(t, 0.1, { throttle: true });
  expect(second.removed).toBe(true); expect(t.hp).toBe(t.model.hp);
});
it('clears expired roadblocks and never deploys while paused or indoors', () => {
  const r = spawnRoadblock(0, 50, 0, false); r.update(56);
  expect(r.removed).toBe(true); expect(colliders).toHaveLength(0);
  G.state = 'pause'; updateRoadblocks(100); expect(all('roadblock')).toHaveLength(0);
  G.state = 'play'; P.club = {}; updateRoadblocks(100); expect(all('roadblock')).toHaveLength(0);
});
