// Multiplayer: one city for the crew. Who runs the traffic, the chopper, the tank and the UFO (net/world-protocol.js),
// what goes over the wire for them, and the game side that makes it work: hunters going after the nearest of the crew,
// only the host spawning, and a crewmate's kill paying them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { G, P, inv } from '../../public/js/core/state.js';
import { crew, crewDist, shareOut } from '../../public/js/game/crew.js';
import { credit, reward } from '../../public/js/game/pickups.js';
import { POPULATION } from '../../public/js/game/population.js';
import { sample } from '../../public/js/net/protocol.js';
import { SHARE_R, electHost, nearAny, packHeli, packTank, packUfo, packVehicle, unpackThing, yields } from '../../public/js/net/world-protocol.js';
import { removeHeli, spawnHeli } from '../../public/js/vehicles/heli.js';
import { removeTank, spawnTank } from '../../public/js/vehicles/tank.js';
import { removeUfo, spawnUfo } from '../../public/js/vehicles/ufo.js';

const solo = { others: crew.others, online: crew.online, me: crew.me, runsWorld: crew.runsWorld, hit: crew.hit };
afterEach(() => { Object.assign(crew, solo); credit.to = null; credit.pay = null; });

describe('who runs the crew\'s world', () => {
  const p = (id, up, ok = true) => ({ id, up, ok });
  it('is whoever already does, while they still can', () => {
    expect(electHost([p('b', 10), p('a', 300)], 'b')).toBe('b'); // a newer host stays: no handing back and forth
    expect(electHost([p('b', 10, false), p('a', 300), p('c', 400, false)], 'b')).toBe('a'); // tabbed away: the next goes
  });
  it('otherwise the one in the room longest who can, the id breaking a tie', () => {
    expect(electHost([p('a', 30), p('b', 300), p('c', 200)], null)).toBe('b');
    expect(electHost([p('z', 50), p('y', 50)], null)).toBe('y');
    expect(electHost([p('a', 30, false), p('b', 300, false)], null)).toBeNull();
  });
  it('two hosts at once: the newer one stands down', () => {
    expect(yields({ id: 'a', up: 10 }, { id: 'b', up: 300 })).toBe(true);
    expect(yields({ id: 'b', up: 300 }, { id: 'a', up: 10 })).toBe(false);
  });
});

describe('the world on the wire', () => {
  const driver = { type: 'motorist', seed: 99, alive: true };
  it('packs a traffic car and gets it back, speed as `sp` so sample() blends it as a number', () => {
    const v = { wk: 'abc.1', model: { id: 'sedan' }, x: 1.234, y: 0, z: -5.678, yaw: 1.23456, v: 12.345, steer: 0.1, burnT: 0, dead: false, driver };
    const a = packVehicle(v);
    expect(a).toEqual(['v', 'abc.1', 'sedan', 1.23, 0, -5.68, 1.235, 12.35, 0.1, 3, 'motorist', 99]);
    expect(JSON.stringify(a).length).toBeLessThan(80);
    const th = unpackThing(a);
    expect(th).toMatchObject({ kind: 'v', key: 'abc.1', model: 'sedan', s: { w: 1, x: 1.23, z: -5.68, sp: 12.35, dr: 1, da: 1, burn: 0, dead: 0, dt: 'motorist', seed: 99 } });
    const later = { ...th.s, x: 3.23, sp: 14.35 };
    const s = sample([{ at: 0, s: th.s }, { at: 1, s: later }], 0.5);
    expect(s.x).toBeCloseTo(2.23); expect(s.sp).toBe(14.35); expect(s.v).toBeUndefined();
    const wreck = unpackThing(packVehicle({ ...v, driver: null, dead: true, burnT: 0 })).s;
    expect(wreck).toMatchObject({ dr: 0, dead: 1, dt: null });
    expect(unpackThing(packVehicle({ ...v, burnT: 5, crashFire: true })).s).toMatchObject({ burn: 1, crash: 1 });
  });
  it('packs the chopper, the tank and the UFO', () => {
    const h = { wk: 'k.2', x: 1, y: 30, z: 2, yaw: 0.5, falling: false, downed: false, beam: { visible: true }, burst: 4, spin: 1, lx: 5, lz: 6, tgt: { x: 5, y: 0, z: 6 }, hp: 900 };
    expect(unpackThing(packHeli(h))).toEqual({ kind: 'h', key: 'k.2', s: { w: 1, x: 1, y: 30, z: 2, yaw: 0.5, fall: 0, down: 0, lit: 1, fire: 1, spin: 1, lx: 5, lz: 6, tx: 5, ty: 1, tz: 6, hp: 900 } });
    const t = { wk: 'k.3', x: 10, z: 20, yaw: 0, turretYaw: 1, pitch: 0.1, v: 5, dead: false, leaving: true, shots: 3, hp: 1200 };
    expect(unpackThing(packTank(t)).s).toMatchObject({ x: 10, z: 20, ty: 1, p: 0.1, sp: 5, dead: 0, leave: 1, shots: 3, hp: 1200 });
    const u = { wk: 'k.4', x: 1, y: 24, z: 2, falling: true, beamT: 0, bx: 0, bz: 0, hp: 0 };
    expect(unpackThing(packUfo(u)).s).toMatchObject({ y: 24, fall: 1, beam: 0 });
  });
  it('drops anything malformed', () => {
    for (const bad of [null, 'x', ['v'], ['v', 7, 'sedan'], ['v', 'k', 'sedan', 'a', 0, 0, 0, 0, 0, 0, 0, 0], ['h', 'k', 1, 2], ['q', 'k', 1, 2, 3], ['t', 'x'.repeat(40), 1, 1, 1, 1, 1, 1, 1, 1, 1]]) expect(unpackThing(bad)).toBeNull();
  });
  it('only sends what is near someone in the crew', () => {
    expect(nearAny(0, 0, [{ x: SHARE_R - 1, z: 0 }])).toBe(true);
    expect(nearAny(0, 0, [{ x: SHARE_R + 1, z: 0 }, { x: 0, z: -SHARE_R - 1 }])).toBe(false);
  });
});

describe('the game side of a shared world', () => {
  it('keys what the crew shares once, by who made it', () => {
    crew.me = () => 'abc';
    const e = shareOut({}), k = e.wk;
    expect(k).toMatch(/^abc\./);
    expect(shareOut(e).wk).toBe(k);
    expect(shareOut({}).wk).not.toBe(k);
  });
  it('spawns traffic only in the game that runs the world', () => {
    const world = POPULATION.filter(r => r.world).map(r => r.id);
    expect(world).toEqual(['traffic', 'bikers', 'steppers', 'stepking']);
    expect(POPULATION.find(r => r.id === 'civilians').world).toBeFalsy(); // (people stay each game's own: net/ghosts.js)
  });
  it('keeps traffic near any of the crew', () => {
    P.x = 0; P.z = 0;
    crew.others = () => [{ x: 300, z: 0, alive: false }];
    expect(crewDist(290, 0)).toBe(10);
  });
  it('sends the chopper, the tank and the UFO after the nearest of the crew', () => {
    const mate = { id: 'bo', x: 120, y: 0, z: 0, alive: true };
    P.x = 0; P.z = 0; P.y = 0; P.alive = true; G.wanted = 6;
    crew.others = () => [mate];
    removeHeli(); const h = spawnHeli(); h.x = 110; h.z = 20; h.y = 30; h.update(0.05);
    expect(h.tgt).toBe(mate);
    removeTank(); const t = spawnTank(); t.x = 100; t.z = 0; t.update(0.05);
    expect(t.tgt).toBe(mate);
    removeUfo(); const u = spawnUfo(); u.x = 125; u.z = 5; u.update(0.05);
    expect(u.tgt).toBe(mate);
    crew.others = () => [];
    h.update(0.05); expect(h.tgt).toBe(P);
    removeHeli(); removeTank(); removeUfo(); G.wanted = 0;
  });
  it('the chopper\'s minigun hits a crewmate through their own game', () => {
    const mate = { id: 'bo', x: 20, y: 0, z: 0, alive: true }, hits = [];
    P.x = 500; P.z = 500; G.wanted = 4;
    crew.others = () => [mate]; crew.hit = (r, d) => hits.push([r.id, d]);
    removeHeli(); const h = spawnHeli(); h.x = 20; h.z = 26; h.y = 28;
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);
    h.los = true; h.losT = 9; h.burst = 1; h.burstT = 0; h.update(0.05);
    rnd.mockRestore();
    expect(hits).toEqual([['bo', 5]]);
    removeHeli(); G.wanted = 0;
  });
  it('pays a crewmate for the kill they made on the host\'s side', () => {
    const paid = [], money = inv.money;
    credit.pay = (to, v, label) => paid.push([to, v, label]);
    credit.to = 'bo'; reward(0, 0, 2000, 'Chopper down'); credit.to = null;
    expect(paid).toEqual([['bo', 2000, 'Chopper down']]);
    expect(inv.money).toBe(money);
  });
});
