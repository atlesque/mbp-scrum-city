import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GB, box } from '../../public/js/render/geometry.js';
import { ALL_IMPACT_FILES, IMPACTS, SURFACES, impactFiles } from '../../public/js/data/impacts.js';
import { SHOTS } from '../../public/js/data/shots.js';
import { GROUND_SURFACE, PROP_SURFACE, surfaceOf } from '../../public/js/combat/surface.js';
import { HEAR } from '../../public/js/core/spatial.js';
import { groundKind } from '../../public/js/world/city.js';
import { addCollider } from '../../public/js/world/collision.js';
import { PROPS, prop, propOnRay } from '../../public/js/world/props.js';

const sfx = name => new URL(`../../public/sfx/${name}.mp3`, import.meta.url);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

describe('bullet impact sounds', () => {
  it('covers brick, sand, wood, water, metal and flesh', () => {
    expect(SURFACES.sort()).toEqual(['brick', 'flesh', 'metal', 'sand', 'water', 'wood']);
  });
  it('has a file for every take', () => {
    for (const s of SURFACES) for (const f of impactFiles(s)) expect(existsSync(sfx(f)), `${f}.mp3 is missing`).toBe(true);
    expect(ALL_IMPACT_FILES.length).toBe(Object.values(IMPACTS).reduce((n, s) => n + s.takes, 0));
    expect(impactFiles('glass')).toEqual([]);
  });
  it('stays well under the gunshots, and carries less far', () => {
    const quietestGun = Math.min(...Object.values(SHOTS).map(s => s.vol));
    for (const [s, i] of Object.entries(IMPACTS)) expect(i.vol, s).toBeLessThan(quietestGun * 0.6);
    expect(HEAR.impact.max).toBeLessThan(HEAR.shot.max);
  });
});

describe('what a bullet lands on', () => {
  it('reads the ground: the sea, the beach, a park, the street', () => {
    expect(groundKind(260, 0)).toBe('water');
    expect(groundKind(230, 40)).toBe('sand');
    expect(groundKind(206, 0)).toBe('paved'); // the promenade along the beach
    expect(groundKind(0, 0)).toBe('paved');
    expect(Object.values(GROUND_SURFACE).every(s => IMPACTS[s])).toBe(true);
  });
  it('maps every hit to a surface with recordings', () => {
    const p = V(0, 0, 0);
    expect(surfaceOf({ kind: 'wall', p })).toBe('brick');
    expect(surfaceOf({ kind: 'ground', p: V(270, 0, 5) })).toBe('water');
    expect(surfaceOf({ kind: 'ground', p: V(225, 0, 5) })).toBe('sand');
    expect(surfaceOf({ kind: 'ground', p })).toBe('brick');
    expect(surfaceOf({ kind: 'entity', entity: { kind: 'npc' }, p })).toBe('flesh');
    expect(surfaceOf({ kind: 'entity', entity: { kind: 'vehicle' }, p })).toBe('metal');
    expect(surfaceOf({ kind: 'entity', entity: { kind: 'vehicle' }, occupant: true, p })).toBe('flesh');
    expect(surfaceOf({ kind: 'entity', entity: { kind: 'heli' }, p })).toBe('metal');
    expect(surfaceOf({ kind: 'prop', prop: { kind: 'palm' }, p })).toBe('wood');
    expect(surfaceOf({ kind: 'prop', prop: { kind: 'lamp' }, p })).toBe('metal');
    for (const k of Object.keys(PROPS)) expect(IMPACTS[PROP_SURFACE[k]], k).toBeTruthy();
  });
});

describe('bullets and props', () => {
  const gb = new GB();
  const palm = prop('palm', 400, 400, [gb], () => { box(gb, 0.6, 8, 0.6, 400, 4, 400, '#7a5c40'); return addCollider(399.7, 400.3, 399.7, 400.3, 8, false); }, { h: 8 });
  const d = V(1, 0, 0);
  it('stops at a palm trunk in the way', () => {
    const h = propOnRay(V(390, 1.5, 400), d, 50);
    expect(h && h.prop).toBe(palm);
    expect(h.t).toBeCloseTo(9.7);
  });
  it('flies past one that is out of reach, beside the path or over it', () => {
    expect(propOnRay(V(390, 1.5, 400), d, 5)).toBe(null);
    expect(propOnRay(V(390, 1.5, 402), d, 50)).toBe(null);
    expect(propOnRay(V(390, 9, 400), d, 50)).toBe(null);
  });
  it('ignores a broken one', () => {
    palm.broken = true;
    expect(propOnRay(V(390, 1.5, 400), d, 50)).toBe(null);
    palm.broken = false;
  });
});
