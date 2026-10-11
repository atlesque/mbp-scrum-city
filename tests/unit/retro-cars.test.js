import { describe, expect, it, vi } from 'vitest';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { VEHICLE_MODELS, pickTrafficModel } from '../../public/js/vehicles/models/index.js';
import { makeCharacter } from '../../public/js/characters/character.js';
import { repaintCar } from '../../public/js/game/city-services.js';
const IDS = ['comet', 'stallion', 'estate', 'taxi'];
describe('80s car variety', () => {
  for (const id of IDS) it(`${id} is drivable, repairable, resprayable and in the traffic pool`, () => {
    const v = spawnVehicle(id, 0, 0, 0);
    expect(v.model.traffic.weight).toBeGreaterThan(0);
    const mesh = v.mesh; expect(mesh.wheels).toHaveLength(4); expect(mesh.seat).toBeTruthy();
    expect(mesh.m.geometry.boundingSphere.radius).toBeGreaterThan(1);
    const c = makeCharacter({ skin: '#eab48f', shirt: '#2fb8c9', pants: '#f4f0e6' });
    v.K.seat(v, c); expect(c.root.parent).toBe(mesh.seat);
    mesh.grp.updateMatrixWorld(true);
    const head = new THREE.Box3().setFromObject(c.head, true);
    expect(head.max.y).toBeLessThan(1.56); expect(head.min.y).toBeGreaterThan(0.9);
    v.hp = 20; v.repair(10); expect(v.hp).toBe(v.model.hp);
    const old = mesh.m.geometry; repaintCar(v); expect(mesh.m.geometry).not.toBe(old);
    v.K.unseat(v, c); expect(c.root.parent).not.toBe(mesh.seat);
  });
  it('keeps the new models distinct in silhouette and handling', () => {
    const shapes = IDS.map(id => VEHICLE_MODELS[id].mesh().m.geometry.attributes.position.array.join(','));
    expect(new Set(shapes).size).toBe(4);
    expect(VEHICLE_MODELS.comet.handling.top).toBeGreaterThan(VEHICLE_MODELS.estate.handling.top);
    const pool = Object.values(VEHICLE_MODELS).filter(m => m.kind === 'car' && m.traffic?.weight > 0);
    const total = pool.reduce((sum, m) => sum + m.traffic.weight, 0), random = vi.spyOn(Math, 'random');
    try {
      let before = 0;
      for (const m of pool) { random.mockReturnValue((before + m.traffic.weight / 2) / total); expect(pickTrafficModel('car').id).toBe(m.id); before += m.traffic.weight; }
    } finally { random.mockRestore(); }
  });
});
