import { expect, it, vi } from 'vitest';
vi.mock('../../public/js/render/textures.js', () => ({
  makeCanvas: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ width: 0, addColorStop() {} }) }) }),
  windowTextures: () => [null, null, []], shirtMat: () => new THREE.MeshBasicMaterial(),
  neonTexture: () => null, crossTexture: () => null, glyphSprite: () => new THREE.Object3D(),
}));
import { buildWorld } from '../../public/js/world/city.js';
import { spawnSecretJet, SECRET_JET } from '../../public/js/world/secret-jet.js';
import { G, P } from '../../public/js/core/state.js';
import { scene } from '../../public/js/render/scene.js';
import { all } from '../../public/js/entities/registry.js';

it('keeps the parked fighter visible and boardable in the built city until approached', () => {
  buildWorld();
  Object.assign(G, { state: 'play', wanted: 0 });
  Object.assign(P, { x: 230, z: -40, y: 0, alive: true, vehicle: null });
  const jet = spawnSecretJet();
  for (let i = 0; i < 3000; i++) jet.update(0.1);
  expect(jet.shouldDespawn()).toBe(false);
  expect(jet.dead).toBe(false);
  expect(jet.x).toBeCloseTo(SECRET_JET.x);
  expect(jet.z).toBeCloseTo(SECRET_JET.z);
  expect(jet.mesh.grp.parent).toBe(scene);
  expect(jet.mesh.grp.visible).toBe(true);
  expect(jet.mesh.grp.position.toArray().every(Number.isFinite)).toBe(true);
  Object.assign(P, { x: jet.x + 2.5, z: jet.z });
  expect(jet.interaction(P)).not.toBeNull();
  expect(all('vehicle')).toContain(jet);
});
