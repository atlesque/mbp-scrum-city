import { describe, expect, it } from 'vitest';
import { collideRoof, makeRoof, pickRoofs } from '../../public/js/world/rooftops.js';

const building = (x0, z0, h = 14, face = 'n') => ({ x0, x1: x0 + 14, z0, z1: z0 + 14, h, face, col: '#fff', trim: '#fff' });

describe('rooftop doors', () => {
  it('puts the street door outside the face the building fronts, and the roof above the slab', () => {
    const r = makeRoof(building(0, 0, 14, 'n'));
    expect(r.door).toEqual({ x: 7, z: 0 });
    expect(r.street.z).toBeLessThan(0); // out on the sidewalk
    expect(r.floor).toBeCloseTo(14.64);
    const e = makeRoof(building(0, 0, 14, 'e'));
    expect(e.street.x).toBeGreaterThan(14);
  });
  it('spreads the doors across the map, starting next to the spawn', () => {
    const spots = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) spots.push(building(-175 + i * 50 - 7, -175 + j * 50 - 7));
    spots.push(building(0, 0, 40), building(50, 0, 6)); // too tall, too low
    const roofs = pickRoofs(spots, 8, { x: -25, z: 25 });
    expect(roofs).toHaveLength(8);
    expect(Math.hypot(roofs[0].street.x + 25, roofs[0].street.z - 25)).toBeLessThan(40);
    for (const r of roofs) expect(r.h).toBe(14);
    for (const a of roofs) for (const b of roofs) if (a !== b) expect(Math.hypot(a.cx - b.cx, a.cz - b.cz)).toBeGreaterThan(90);
  });
  it('keeps the player inside the railings and out of the stair hut', () => {
    const r = makeRoof(building(0, 0));
    const o = { x: -5, z: 30 }; collideRoof(o, 0.38, r);
    expect(o.x).toBeGreaterThanOrEqual(r.walk.x0 + 0.38); expect(o.z).toBeLessThanOrEqual(r.walk.z1 - 0.38);
    const h = { x: r.hut.c.x, z: r.hut.c.z }; collideRoof(h, 0.38, r);
    const inHut = h.x > r.hut.x0 - 0.37 && h.x < r.hut.x1 + 0.37 && h.z > r.hut.z0 - 0.37 && h.z < r.hut.z1 + 0.37;
    expect(inHut).toBe(false);
    // where the player lands coming up is free
    const p = { ...r.hutOut }; expect(collideRoof(p, 0.38, r)).toBe(false);
  });
});
