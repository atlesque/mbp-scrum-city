import { describe, expect, it } from 'vitest';
import { LANDMARK_MODELS, landmarkModel } from '../../public/js/world/landmark-models/index.js';
import { triangles } from '../../public/js/world/landmark-models/kit.js';

describe('landmark models', () => {
  for (const type of Object.keys(LANDMARK_MODELS)) it(`${type} fits its block and the triangle budget`, () => {
    const g = landmarkModel(type), box = new THREE.Box3().setFromObject(g);
    // 1 unit = 1 m, origin at the footprint centre on the ground, inside the 32 x 32 m lot (bay windows and cornices may overhang the pavement a little)
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
    for (const v of [box.min.x, box.min.z]) expect(v).toBeGreaterThanOrEqual(-17);
    for (const v of [box.max.x, box.max.z]) expect(v).toBeLessThanOrEqual(17);
    expect(triangles(g)).toBeLessThan(12000); // CI renders on a software GPU
    expect(g.children.map(m => m.material.name)).toContain('lit'); // windows that glow after dark
  });
});
