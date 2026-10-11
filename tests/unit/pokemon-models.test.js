import { expect, it } from 'vitest';
import { makePokemon, disposeModel } from '../../public/js/pokemon/models.js';
import { SPECIES } from '../../public/js/pokemon/team.js';
it('builds all 35 blocky models with finite vertices and distinct evolutionary forms', () => {
  const sizes = {};
  for (const [id, def] of Object.entries(SPECIES)) {
    const root = makePokemon(id), mesh = root.children[0];
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(root.scale.x);
    expect([...mesh.geometry.attributes.position.array].every(Number.isFinite), id).toBe(true);
    expect(size.y, id).toBeCloseTo(def.height, 4);
    sizes[id] = size.length();
    disposeModel(root);
  }
  for (const [id, def] of Object.entries(SPECIES)) if (def.evolvesTo) expect(sizes[def.evolvesTo], id).not.toBe(sizes[id]);
});

it('keeps small companions below knee height and large evolutions near adult height', () => {
  expect(SPECIES.pikachu.height).toBe(0.4);
  expect(SPECIES.rattata.height).toBe(0.3);
  expect(SPECIES.charizard.height).toBe(1.7);
  expect(SPECIES.venusaur.height).toBe(2);
  expect(SPECIES.pidgeot.height).toBe(1.5);
});
