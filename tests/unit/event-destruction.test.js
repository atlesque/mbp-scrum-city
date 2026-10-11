import { afterEach, expect, it } from 'vitest';
import { GB, box } from '../../public/js/render/geometry.js';
import { P } from '../../public/js/core/state.js';
import { ROOFS, SURFACES, plainRoof } from '../../public/js/world/rooftops.js';
import { eventBuildings, recordEventBuilding, bindEventBuildings, damageBuildings, updateBuildings } from '../../public/js/world/event-destruction.js';
import { addEntity, removeEntity } from '../../public/js/entities/registry.js';
let occupant;
afterEach(() => { eventBuildings.length = ROOFS.length = SURFACES.length = 0; if (occupant) removeEntity(occupant); });
function building(protectedRoof = false, storefront = false) {
  const bounds = { x0: 10, x1: 20, z0: 10, z1: 20, h: 30 }, collider = { ...bounds };
  const gb = new GB(); box(gb, 10, 30, 10, 15, 15, 15, '#ffffff');
  const mesh = new THREE.Mesh(gb.geometry());
  const surface = plainRoof(bounds, 30.6); SURFACES.push(surface);
  if (protectedRoof) ROOFS.push(surface);
  recordEventBuilding([gb], [0], bounds, collider, []); bindEventBuildings([[gb, mesh]], storefront ? [bounds] : []);
  return { mesh, surface, collider };
}
it('collapses geometry and collision together, then restores the exact original mesh away from the player', () => {
  const { mesh, surface, collider } = building();
  const original = mesh.geometry.attributes.position.array.slice();
  damageBuildings(5, 15, 10);
  expect(eventBuildings[0].broken).toBe(true); expect(collider.h).toBeLessThan(2); expect(surface.floor).toBeLessThan(2);
  P.x = 15; P.z = 15; updateBuildings(80); expect(eventBuildings[0].broken).toBe(true);
  P.x = -150; P.z = -150; occupant = addEntity({ kind: 'vehicle', x: 15, z: 15 });
  updateBuildings(1); expect(eventBuildings[0].broken).toBe(true);
  removeEntity(occupant); updateBuildings(1);
  expect(collider.h).toBe(30); expect(surface.floor).toBe(30.6);
  expect(mesh.geometry.attributes.position.array).toEqual(original);
});
it('preserves buildings with accessible roof escape routes', () => {
  const { collider } = building(true); damageBuildings(15, 15, 100);
  expect(eventBuildings[0].broken).toBe(false); expect(collider.h).toBe(30);
});

it('preserves repurposed club and Pokemon Center buildings even without a roof door', () => {
  const { collider } = building(false, true); damageBuildings(15, 15, 100);
  expect(eventBuildings[0].broken).toBe(false); expect(collider.h).toBe(30);
});
