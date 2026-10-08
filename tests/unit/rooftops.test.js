import { describe, expect, it } from 'vitest';
import { JET, jetStep, refuel } from '../../public/js/game/jetpack.js';
import { landDamage } from '../../public/js/game/player.js';
import { colliders } from '../../public/js/world/collision.js';
import { LANDMARK_SITES, buildLandmark } from '../../public/js/world/landmarks.js';
import { ceilingAt, collideRoof, collideRoofs, doorRoof, landmarkRoofs, makeRoof, pickRoofs, plainRoof, surfaceAt } from '../../public/js/world/rooftops.js';

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
  it('stops a walker at the railings and out of the stair hut, but not someone jumping over them', () => {
    const r = makeRoof(building(0, 0));
    const o = { x: 0.45, z: 7 }; collideRoof(o, 0.38, r);
    expect(o.x).toBeGreaterThanOrEqual(0.5); // pushed back inside the rail
    const j = { x: 0.45, z: 7 }; collideRoof(j, 0.38, r, r.floor + 1.3);
    expect(j.x).toBe(0.45); // feet over the top rail: free to go over
    const h = { x: r.hut.c.x, z: r.hut.c.z }; collideRoof(h, 0.38, r);
    const inHut = h.x > r.hut.x0 - 0.37 && h.x < r.hut.x1 + 0.37 && h.z > r.hut.z0 - 0.37 && h.z < r.hut.z1 + 0.37;
    expect(inHut).toBe(false);
    // where the player lands coming up, and the sniper rifle, are free
    const p = { ...r.hutOut }; expect(collideRoof(p, 0.38, r)).toBe(false);
    expect(r.gun).toBe('sniper');
    const g = { ...r.gunAt }; expect(collideRoof(g, 0.38, r)).toBe(false);
  });
});

describe('standing on roofs', () => {
  const r = makeRoof(building(0, 0)), low = plainRoof({ x0: 15, x1: 29, z0: 0, z1: 14 }, 9.6), list = [r, low];
  it('finds the top under the feet: the street, a roof, or an air-con unit on it', () => {
    const { x, z } = r.gunAt; // open roof, clear of the hut
    expect(surfaceAt(x, z, 0, list)).toEqual({ floor: 0, roof: null }); // in the street, a roof 14 m up is out of reach
    expect(surfaceAt(x, z, r.floor, list)).toEqual({ floor: r.floor, roof: r });
    expect(surfaceAt(x, z, 40, list).floor).toBe(r.floor); // falling onto it
    expect(surfaceAt(r.hut.c.x, r.hut.c.z, 40, list).floor).toBeCloseTo(r.blocks[0].y1 + 0.06); // or onto the hut
    expect(surfaceAt(20, 7, r.floor, list)).toEqual({ floor: 9.6, roof: low }); // off the edge: the lower roof next door
    const ac = r.ac[0], ax = (ac.x0 + ac.x1) / 2, az = (ac.z0 + ac.z1) / 2;
    expect(surfaceAt(ax, az, r.floor, list).floor).toBe(r.floor); // too high to step up onto from the roof
    expect(surfaceAt(ax, az, r.floor + 0.8, list).floor).toBeCloseTo(ac.y1 + 0.06); // jumped up onto it
  });
  it('lets the feet stand on a railing once they are over it, and push off it when they are not', () => {
    const top = r.rails[0].y1; // the front railing, along x at z 0.03..0.13
    expect(surfaceAt(7, 0.08, top + 0.3, list)).toEqual({ floor: top, roof: r }); // came down on it
    expect(surfaceAt(7, 0.3, top + 0.3, list).floor).toBe(top); // not quite over the thin bar: the feet still find it
    expect(surfaceAt(7, 0.6, top + 0.3, list).floor).toBe(r.floor); // clearly inside: down onto the roof
    expect(surfaceAt(7, 0.08, r.floor, list).floor).toBe(r.floor); // walking on the roof, it is no step up
    const o = { x: 7, z: 0.08 }; collideRoof(o, 0.38, r, top);
    expect(o).toEqual({ x: 7, z: 0.08 }); // standing on it, it does not push
  });
  it('only lets things in the way of the feet stop them', () => {
    const o = { x: 0.45, z: 7 }; collideRoofs(o, 0.38, 0, list);
    expect(o.x).toBe(0.45); // in the street the roof's railings are far overhead
  });
  it('hurts a hard landing, more the further the fall', () => {
    const v = h => -Math.sqrt(2 * 18 * h); // landing speed after a drop of h metres
    expect(landDamage(v(1.6))).toBe(0); // a jump
    expect(landDamage(v(5))).toBe(0);
    expect(landDamage(v(10))).toBeGreaterThan(10);
    expect(landDamage(v(30))).toBeLessThan(100);
    expect(landDamage(v(50))).toBeGreaterThan(100);
  });
});

describe('jetpack', () => {
  it('climbs on fuel, then lets the wearer down gently', () => {
    const jet = { fuel: JET.fuel };
    let vy = 0; for (let i = 0; i < 60; i++) vy = jetStep(jet, vy, true, 1 / 60, 18);
    expect(vy).toBeGreaterThan(0); expect(vy).toBeLessThanOrEqual(JET.climb);
    expect(jet.fuel).toBeCloseTo(JET.fuel - 1);
    for (let i = 0; i < 300; i++) vy = jetStep(jet, vy, false, 1 / 60, 18);
    expect(vy).toBe(-JET.sink); expect(landDamage(vy)).toBe(0);
    jet.fuel = 0; vy = jetStep(jet, 0, true, 1 / 60, 18);
    expect(vy).toBeLessThan(0); // empty: no climb
    refuel(jet, 100); expect(jet.fuel).toBe(JET.fuel);
  });
});

describe('landmark roofs', () => {
  landmarkRoofs.length = 0;
  const g = { sign() {} };
  LANDMARK_SITES.forEach((s, i) => buildLandmark(g, s, -75 + i * 50, 75));
  const doors = landmarkRoofs.filter(L => L.door).map(doorRoof);
  const solid = (x, z) => colliders.some(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
  it('gives each of the three a roof with a door, a sniper rifle or the rocket launcher, and the jetpack on the Belpaire', () => {
    expect(doors).toHaveLength(3);
    expect(doors.map(d => d.gun).sort()).toEqual(['rpg', 'sniper', 'sniper']);
    expect(doors.filter(d => d.jetpackAt)).toHaveLength(1);
    expect(Math.max(...doors.map(d => d.floor))).toBeGreaterThan(100); // the Belpaire's
  });
  const belpaire = doors.find(d => d.jetpackAt), parts = landmarkRoofs.flatMap(L => L.blocks || []);
  const pergola = belpaire.blocks.reduce((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) > (a.x1 - a.x0) * (a.z1 - a.z0) ? b : a);
  it('puts the Belpaire pergola over the roof garden: walk under it, stand on it, bump your head on it, not through its posts', () => {
    const x = (pergola.x0 + pergola.x1) / 2, z = (pergola.z0 + pergola.z1) / 2, list = [belpaire];
    expect(pergola.y0).toBeGreaterThan(belpaire.floor + 5);
    const o = { x: belpaire.hutOut.x, z: belpaire.hutOut.z }; expect(collideRoof(o, 0.38, belpaire)).toBe(false); // under it
    expect(surfaceAt(x, z, pergola.y1 + 1, list).floor).toBeCloseTo(pergola.y1 + 0.06); // landed on the slats
    expect(ceilingAt(x, z, belpaire.floor, list)).toBe(pergola.y0);
    expect(ceilingAt(x, z, pergola.y1 + 0.06, list)).toBe(Infinity); // on top: nothing overhead
    const posts = belpaire.blocks.filter(b => b.x1 - b.x0 < 0.5 && b.z1 - b.z0 < 0.5 && b.y1 >= pergola.y0);
    expect(posts.length).toBeGreaterThanOrEqual(12);
    const p = posts[0], q = { x: p.x0 - 0.2, z: (p.z0 + p.z1) / 2 }; // a post, from the rail beside it
    expect(collideRoofs(q, 0.38, belpaire.floor + 1.15, list)).toBe(true);
  });
  it('lets the feet stand on what the landmarks have on their roofs: the Teirlinck plant room, the VAC plant and balustrade', () => {
    const roofOf = b => landmarkRoofs.find(L => L.blocks?.includes(b)), others = parts.filter(b => roofOf(b) !== roofOf(pergola));
    expect(others).toHaveLength(3);
    for (const b of others) {
      const L = roofOf(b), x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
      expect(b.y0).toBeLessThanOrEqual(L.floor + 1); // stands on its roof
      expect(surfaceAt(x, z, b.y1 + 0.5, [plainRoof(L.area, L.floor, L.blocks)]).floor).toBeCloseTo(b.y1 + 0.06);
    }
    // the VAC courtyard's glass balustrade: thin, so it stops the walker rather than lifting the whole roof to its top
    const glass = others.find(b => b.y1 - b.y0 < 1.2 && Math.min(b.x1 - b.x0, b.z1 - b.z0) < 0.3), L = roofOf(glass);
    expect(glass.y0).toBeCloseTo(L.floor - 0.06);
  });
  it('puts the street doors in the wall facing the street, and everything on the roof clear of the hut and what else stands there', () => {
    for (const d of doors) {
      expect(solid(d.street.x, d.street.z)).toBe(false);
      expect(solid(d.door.x - d.fn[0] * 0.3, d.door.z - d.fn[1] * 0.3)).toBe(true); // just behind the door is the building
      for (const p of [d.hutOut, d.gunAt, d.jetpackAt].filter(Boolean)) {
        const o = { ...p }; expect(collideRoof(o, 0.38, d)).toBe(false);
        expect(p.x > d.walk.x0 && p.x < d.walk.x1 && p.z > d.walk.z0 && p.z < d.walk.z1).toBe(true);
      }
    }
  });
});
