import { describe, expect, it } from 'vitest';
import { DRINK, LAYOUT, buyDrink, clubInteractions } from '../../public/js/game/club.js';
import { G, P, inv } from '../../public/js/core/state.js';
import { BAR, CLUB_AT, CLUB_CLOSED_AT, MOVES, POLES, ROOM, ROUTINE, SEATS, STAGE, clubLayout, collideClub, onClubFace, pickClubSite, routineAt } from '../../public/js/world/club.js';
import { surfaceAt } from '../../public/js/world/rooftops.js';

const building = (x0, z0, o = {}) => ({ x0, x1: x0 + 14, z0, z1: z0 + 14, h: 12, face: 'n', col: '#fff', trim: '#fff', parapet: {}, ...o });

describe('the club in the city', () => {
  it('moves into the nearest deco building that has no roof door, with its door out on the street face', () => {
    const roofDoor = building(0, 0), near = building(40, 0), far = building(200, 0), plain = building(20, 0, { parapet: null });
    const s = pickClubSite([roofDoor, plain, near, far], [roofDoor], { x: 0, z: 0 });
    expect(s.x0).toBe(40);
    expect(s.door).toEqual({ x: 47, z: 0 });
    expect(s.street.z).toBeLessThan(0); // out on the pavement
    expect(pickClubSite([plain], [], { x: 0, z: 0 }).x0).toBe(20); // no deco building left: any will do
  });
  it('takes down the building\'s own sign on that face, and only there', () => {
    const s = pickClubSite([building(0, 0)], [], { x: 0, z: 0 });
    expect(onClubFace({ x: 7, z: -0.35 }, s)).toBe(true);
    expect(onClubFace({ x: 7, z: 14.35 }, s)).toBe(false); // the back of the building
    expect(onClubFace({ x: 30, z: -0.35 }, s)).toBe(false); // next door
  });
});

describe('inside the club', () => {
  const L = clubLayout(), free = (x, z) => { const o = { x, z }; return !collideClub(o, 0.38, 0, L); };
  it('lets the player in facing the stage, right by the door back out', () => {
    expect(free(L.arrive.x, L.arrive.z)).toBe(true);
    expect(L.arrive.yaw).toBeCloseTo(Math.PI); // towards -z, where the stage is
    const near = []; Object.assign(P, { x: L.arrive.x, z: L.arrive.z, y: 0 }); G.stairs = false;
    clubInteractions(P, near);
    expect(near.map(i => i.prompt).join()).toMatch(/back out/);
  });
  it('keeps the player off the stage and out from behind the bar, even jumping', () => {
    const o = { x: CLUB_AT.x - 5, z: CLUB_AT.z + STAGE.z1 - 0.5 }; collideClub(o, 0.38, 1.5, L);
    expect(o.z).toBeGreaterThan(CLUB_AT.z + STAGE.z1); // pushed back off the front of the stage
    const b = { x: CLUB_AT.x + BAR.x0 - 1, z: CLUB_AT.z }; // walking at the counter
    for (let i = 0; i < 40; i++) { b.x += 0.1; collideClub(b, 0.38, 1.2, L); }
    expect(b.x).toBeLessThan(CLUB_AT.x + BAR.x0);
    expect(surfaceAt(CLUB_AT.x, CLUB_AT.z - 7, 3, [L]).floor).toBe(0); // and nothing to land on up there
  });
  it('stops the player at the walls', () => {
    const o = { x: CLUB_AT.x + ROOM.x1 + 3, z: CLUB_AT.z }; collideClub(o, 0.38, 0, L);
    expect(o.x).toBeLessThanOrEqual(CLUB_AT.x + ROOM.x1 - 0.38);
  });
  it('serves a drink along the front of the bar, which heals for its price', () => {
    const near = []; Object.assign(P, { x: L.barFront.x, z: CLUB_AT.z + 1, y: 0 });
    clubInteractions(P, near);
    expect(near.some(i => /Fizz/.test(i.prompt))).toBe(true);
    inv.money = 100; P.hp = 50;
    expect(buyDrink()).toBe(true);
    expect(inv.money).toBe(100 - DRINK.price); expect(P.hp).toBe(50 + DRINK.hp);
    inv.money = 5; P.hp = 50;
    expect(buyDrink()).toBe(false);
    expect(inv.money).toBe(5); expect(P.hp).toBe(50);
    P.hp = 95; inv.money = 100; buyDrink(); expect(P.hp).toBe(100);
  });
  it('has a free spot in front of the bar between the stools, and a chair under everyone who sits', () => {
    const z = (SEATS.filter(s => s.stool)[0].z + SEATS.filter(s => s.stool)[1].z) / 2;
    expect(free(L.barFront.x + 0.3, CLUB_AT.z + z)).toBe(true);
    for (const s of SEATS) expect(Math.abs(s.x) < ROOM.x1 && Math.abs(s.z) < ROOM.z1).toBe(true);
  });
  it('closes its door at the same heat as the gun shops', () => expect(CLUB_CLOSED_AT).toBe(4));
  it('puts every pole on the stage', () => {
    for (const p of POLES) expect(surfaceAt(CLUB_AT.x + p.x, CLUB_AT.z + p.z, 0, [LAYOUT]).floor).toBe(0); // walled off, never stood on
    for (const p of POLES) expect(p.z < -1.4).toBe(true);
  });
});

describe('a pole routine', () => {
  it('runs through every move and flows from each into the next, round the loop too', () => {
    const seen = new Set();
    let last = routineAt(0);
    for (let i = 1; i <= 2000; i++) {
      const m = routineAt(i / 2000); seen.add(m.move);
      const jump = Math.hypot(Math.sin(m.a) * m.r - Math.sin(last.a) * last.r, Math.cos(m.a) * m.r - Math.cos(last.a) * last.r);
      expect(jump).toBeLessThan(0.05); expect(Math.abs(m.lift - last.lift)).toBeLessThan(0.05);
      last = m;
    }
    expect([...seen].sort()).toEqual(MOVES.map(m => m[0]).sort());
    expect(ROUTINE).toBeGreaterThan(8);
  });
  it('keeps the feet on the stage except going up the pole', () => {
    for (let i = 0; i < 100; i++) { const m = routineAt(i / 100); if (m.move === 'walk' || m.move === 'lean') expect(m.lift).toBe(0); expect(m.lift).toBeLessThanOrEqual(1.2); }
  });
});
