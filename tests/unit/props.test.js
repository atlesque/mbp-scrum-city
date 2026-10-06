import { describe, expect, it } from 'vitest';
import { GB, box } from '../../public/js/render/geometry.js';
import { colliders, addCollider, isFree } from '../../public/js/world/collision.js';
import { PROPS, TOPPLE_FLAT, bindProps, blastProps, blasted, burstStart, burstStep, prop, props, smashProps, smashes, toppleStart, toppleStep } from '../../public/js/world/props.js';

const run = (step, s) => { let t = 0; while (step(s, 1 / 60) && t < 20) t += 1 / 60; return t; };

describe('breakable props', () => {
  it('palms take a real hit to go down, umbrellas almost none', () => {
    expect(smashes(PROPS.palm, 5)).toBe(false);
    expect(smashes(PROPS.palm, 12)).toBe(true);
    expect(smashes(PROPS.lamp, 6)).toBe(true);
    expect(smashes(PROPS.umbrella, 2)).toBe(true);
    expect(PROPS.palm.slow).toBeLessThan(PROPS.lamp.slow);
    expect(PROPS.lamp.slow).toBeLessThan(PROPS.umbrella.slow);
  });
  it('a blast reaches further for an umbrella than for a hut', () => {
    expect(blasted(PROPS.umbrella, 9, 10)).toBe(true);
    expect(blasted(PROPS.hut, 9, 10)).toBe(false);
    expect(blasted(PROPS.palm, 5, 10)).toBe(true);
  });
  it('a pushed-over palm falls over and comes to rest flat', () => {
    const t = toppleStart(10, 6, 1, 0);
    const time = run(toppleStep, t);
    expect(t.rest).toBe(true);
    expect(t.a).toBeCloseTo(TOPPLE_FLAT);
    expect(time).toBeGreaterThan(0.4); expect(time).toBeLessThan(6);
  });
  it('flying pieces land and settle on the ground', () => {
    const b = burstStart(0, 3, 0, 0.3, 1, 0, 12);
    run(burstStep, b);
    expect(b.rest).toBe(true);
    expect(b.y).toBeCloseTo(0.3);
    expect(b.x).toBeGreaterThan(1);
  });
});

describe('breaking a prop in the world', () => {
  const gb = new GB();
  box(gb, 1, 1, 1, 50, 0.5, 50, '#ffffff'); // something else in the same mesh
  const p = prop('lamp', 60, 60, [gb], () => { box(gb, 0.16, 6, 0.16, 60, 3, 60, '#333333'); return addCollider(59.9, 60.1, 59.9, 60.1, 6, false); }, { h: 6, lamp: { x: 60, z: 60 } });
  const mesh = new THREE.Mesh(gb.geometry(), new THREE.MeshBasicMaterial());
  bindProps([[gb, mesh]]);

  it('a slow car is stopped by it, a fast one knocks it over', () => {
    expect(props).toContain(p);
    expect(isFree(60, 60)).toBe(false);
    expect(smashProps(58, 60, 1, 0, 2, 0, 1.15, 1)).toHaveLength(0);
    expect(p.broken).toBe(false);
    const hits = smashProps(58, 60, 1, 0, 15, 0, 1.15, 1);
    expect(hits.map(h => h.p)).toEqual([p]);
    expect(p.broken).toBe(true);
    expect(p.lamp.dead).toBe(true);
    // its collider is gone, so nothing stops at it any more
    expect(colliders).not.toContain(p.collider);
    expect(isFree(60, 60)).toBe(true);
    // its vertices are folded away under the ground; the rest of the mesh is untouched
    const pos = mesh.geometry.attributes.position;
    for (let i = p.pieces[0].s; i < p.pieces[0].e; i++) expect(pos.getY(i)).toBe(-5);
    expect(pos.getY(0)).toBeGreaterThanOrEqual(0);
    expect(p.debris).toHaveLength(1);
  });
  it('a car driving past alongside, or away from it, leaves it standing', () => {
    const q = prop('palm', 80, 80, [gb], () => null, { h: 9 });
    q.pieces = [];
    expect(smashProps(80, 85, 0, 1, 0, 20, 1.15, 1)).toHaveLength(0); // heading away
    expect(smashProps(78, 80, 0, 1, 0, 20, 1.15, 1)).toHaveLength(0); // passing alongside
    blastProps(80, 1, 95, 10); expect(q.broken).toBe(false);
    blastProps(82, 1, 80, 10); expect(q.broken).toBe(true);
  });
});
