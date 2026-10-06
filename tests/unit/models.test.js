import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { describe, expect, it, vi } from 'vitest';
import { colliders } from '../../public/js/world/collision.js';
import { LANDMARK_TYPES, buildLandmark, loadLandmarkModels } from '../../public/js/world/landmarks.js';
import { glowMaterials, placeModel, prepareModel, setModelNight, turnBox } from '../../public/js/world/models.js';

async function testBuilding() {
  const buf = await readFile(new URL('../../public/models/test-building.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  return prepareModel(gltf.scene, mergeGeometries);
}
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4);

describe('glb building models', () => {
  it('merges the meshes into one per material, in the city look', async () => {
    const m = await testBuilding(), mats = m.group.children.map(o => o.material);
    expect(mats.map(x => x.name).sort()).toEqual(['Awning', 'Door', 'Roof', 'Walls', 'Windows_lit']);
    expect(mats.every(x => x.isMeshLambertMaterial)).toBe(true);
    expect(m.triangles).toBeLessThan(500);
    // colours come back as authored (sRGB), not darkened by glTF's linear storage
    expect('#' + mats.find(x => x.name === 'Walls').color.getHexString()).toBe('#f2b8a0');
    const awning = m.group.children.find(o => o.material.name === 'Awning');
    expect(awning.material.vertexColors).toBe(true);
    const c = awning.geometry.attributes.color, hexes = new Set();
    for (let i = 0; i < c.count; i++) hexes.add('#' + new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHexString());
    expect([...hexes].sort()).toEqual(['#ff6fae', '#fff6ee']);
  });
  it('takes collision from the collider box and leaves it out of the drawn model', async () => {
    const m = await testBuilding();
    expect(m.colliders).toHaveLength(1);
    expect(near(m.colliders[0], [-6, 6, -5, 5, 7.5])).toBe(true);
    expect(m.group.children.some(o => o.material.name === 'Collider')).toBe(false);
  });
  it('falls back to the bounding box without a collider', () => {
    const root = new THREE.Group(), a = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 2), new THREE.MeshStandardMaterial());
    a.position.set(1, 5, 0); root.add(a);
    const m = prepareModel(root, mergeGeometries);
    expect(near(m.colliders[0], [-1, 3, -1, 1, 10])).toBe(true);
  });
  it('lights the emissive windows at night', async () => {
    const m = await testBuilding(), win = m.group.children.find(o => o.material.name === 'Windows_lit').material;
    expect(glowMaterials.has(win)).toBe(true);
    expect(glowMaterials.has(m.group.children.find(o => o.material.name === 'Walls').material)).toBe(false);
    setModelNight(0); const day = win.emissiveIntensity; setModelNight(1);
    expect(win.emissiveIntensity).toBeGreaterThan(day * 3);
  });
  it('turns the +Z front to face the street', () => {
    // a box sticking out the front (+Z) of the model ends up on the street side of the block
    const front = [-1, 1, 4, 6];
    expect(turnBox(front, 100, 100, 'n')).toEqual([99, 101, 94, 96]);
    expect(turnBox(front, 100, 100, 's')).toEqual([99, 101, 104, 106]);
    expect(turnBox(front, 100, 100, 'e')).toEqual([104, 106, 99, 101]);
    expect(turnBox(front, 100, 100, 'w')).toEqual([94, 96, 99, 101]);
  });
  it('places a model with its colliders', async () => {
    const m = await testBuilding(), before = colliders.length;
    const o = placeModel(m, -75, -25, 'e');
    expect(colliders.length).toBe(before + 1);
    const c = colliders.at(-1);
    expect(near([c.x0, c.x1, c.z0, c.z1, c.h], [-80, -70, -31, -19, 7.5])).toBe(true);
    expect(o.children[0].geometry).toBe(m.group.children[0].geometry); // shared, not copied
  });
  it('falls back to the hand-built landmark when the file is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = { block: [2, 3], type: 'vac', face: 'e', model: 'not-there.glb' }, spy = vi.spyOn(LANDMARK_TYPES, 'vac');
    await loadLandmarkModels([s]);
    const noop = () => {};
    buildLandmark({ walls: { v: noop }, plain: { v: noop }, neon: { v: noop }, sign: noop }, s, -75, -25);
    expect(spy).toHaveBeenCalled();
  });
});
