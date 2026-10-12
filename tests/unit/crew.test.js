// Multiplayer crew: the people each game shares (net/protocol.js), the crew's one wanted level, and who the law goes after
// (game/crew.js).
import { describe, expect, it } from 'vitest';
import { P } from '../../public/js/core/state.js';
import { SAFE_R, crew, nearestOf, safeSpot, spawnSpot } from '../../public/js/game/crew.js';
import { NPC_CHUNK, chunks, due, heatNews, packFire, packNpc, packState, packSwing, unpackFire, unpackNpc, unpackSwing } from '../../public/js/net/protocol.js';
import { NPC_TYPES, lookFrom } from '../../public/js/npcs/types.js';

describe('the people each game shares', () => {
  const cop = { nid: 7, type: 'cop', seed: 12345, x: 1.234, y: 0, z: -9.876, yaw: 1.23456, moveSpeed: 4.8, alive: true, aiming: true, panic: false, twoHand: false, c: { gunId: 'pistol' }, aimPitch: 0.1 };

  it('packs a person small and gets them back', () => {
    const a = packNpc(cop);
    expect(a).toEqual([7, 'cop', 12345, 1.23, 0, -9.88, 1.235, 4.8, 3, 'pistol', 0.1]);
    expect(JSON.stringify(a).length).toBeLessThan(70);
    expect(unpackNpc(a)).toEqual({ i: 7, type: 'cop', seed: 12345, s: { w: 1, x: 1.23, y: 0, z: -9.88, yaw: 1.235, ms: 4.8, al: 1, a: 1, pn: 0, th: 0, dn: 0, g: 'pistol', p: 0.1 } });
    expect(unpackNpc(packNpc({ ...cop, alive: false })).s).toMatchObject({ al: 0, g: null });
    expect(unpackNpc(packNpc({ ...cop, downT: 1.2 })).s).toMatchObject({ al: 1, dn: 1 }); // knocked down by a melee blow
    expect(unpackNpc(['x'])).toBeNull();
    expect(unpackNpc([1, 'cop', 1, 'a', 0, 0, 0, 0, 1, 0, 0])).toBeNull();
  });

  it('sends a melee swing and a molotov fire small, and turns away what makes no sense', () => {
    const sw = packSwing('punch', 0.4251, 2);
    expect(sw).toEqual({ t: 'swing', a: 'punch', d: 0.43, k: 2 });
    expect(unpackSwing(sw)).toEqual({ anim: 'punch', dur: 0.43, step: 2 });
    expect(unpackSwing({ a: 'swing', d: 99, k: 7 })).toEqual({ anim: 'swing', dur: 3, step: 2 });
    for (const bad of [{ a: 'dance', d: 0.4 }, { a: 'toString', d: 0.4 }, { a: 'chop' }, null]) expect(unpackSwing(bad)).toBeNull();
    const f = packFire({ x: 1.234, y: 0.051, z: -5.678 });
    expect(f).toEqual({ t: 'fire', x: 1.23, y: 0.05, z: -5.68 });
    expect(unpackFire(f)).toEqual({ x: 1.23, y: 0.05, z: -5.68 });
    expect(unpackFire({ x: 1, y: 'up', z: 2 })).toBeNull();
  });

  it('splits a crowd into messages that fit the room', () => {
    const crowd = Array.from({ length: 60 }, (_, i) => packNpc({ ...cop, nid: i }));
    const parts = chunks(crowd, NPC_CHUNK);
    expect(parts.map(p => p.length)).toEqual([24, 24, 12]);
    for (const p of parts) expect(JSON.stringify({ t: 'npcs', n: p, id: 'abcdefgh' }).length).toBeLessThan(2048);
  });

  it('dresses a person the same on every screen', () => {
    for (const type of ['civilian', 'cop', 'stepper', 'alien']) expect(lookFrom(NPC_TYPES[type], 99)).toEqual(lookFrom(NPC_TYPES[type], 99));
    const looks = new Set([1, 2, 3, 4, 5, 6].map(s => JSON.stringify(lookFrom(NPC_TYPES.civilian, s))));
    expect(looks.size).toBeGreaterThan(3);
    const r = Math.random; lookFrom(NPC_TYPES.civilian, 5); expect(Math.random).toBe(r); // (the real one is put back)
  });
});

describe('the crew\'s heat', () => {
  it('sends heat this game added, and a level its own rules set', () => {
    expect(heatNews({ heat: 10, wanted: 2 }, { heat: 15, wanted: 2 }, false)).toEqual([{ t: 'heat', v: 5 }]);
    expect(heatNews({ heat: 20, wanted: 2 }, { heat: 30, wanted: 3 }, false)).toEqual([{ t: 'heat', v: 10 }, { t: 'wanted', l: 3, h: 30 }]);
    expect(heatNews({ heat: 30, wanted: 3 }, { heat: 10, wanted: 2 }, false)).toEqual([{ t: 'wanted', l: 2, h: 10 }]); // a star faded
    expect(heatNews({ heat: 110, wanted: 5 }, { heat: 110, wanted: 6 }, false)).toEqual([{ t: 'wanted', l: 6, h: 110 }]); // the sixth
    expect(heatNews({ heat: 10, wanted: 2 }, { heat: 10, wanted: 2 }, false)).toEqual([]);
    // back from the hospital: that's not the crew losing its heat
    expect(heatNews({ heat: 60, wanted: 4 }, { heat: 0, wanted: 0 }, true)).toEqual([]);
  });

  it('tells the others at once when the level changes or the law spots the player', () => {
    const s = { ...packState({ ...P, alive: true, c: { gunId: 'fist' } }, true), wl: 2, sn: 0 };
    expect(due({ ...s, wl: 3 }, s, 0.1)).toBe(true);
    expect(due({ ...s, sn: 1 }, s, 0.1)).toBe(true);
    expect(due({ ...s }, s, 0.3)).toBe(false);
  });
});

describe('who the law goes after', () => {
  it('the nearest of the crew still standing', () => {
    const saved = { x: P.x, z: P.z, alive: P.alive }, others = crew.others;
    try {
      Object.assign(P, { x: 0, z: 0, alive: true });
      const bo = { id: 'bo', x: 50, y: 0, z: 0, alive: true }, cy = { id: 'cy', x: 10, y: 0, z: 0, alive: false };
      crew.others = () => [bo, cy];
      expect(nearestOf(40, 0)).toBe(bo);
      expect(nearestOf(5, 0)).toBe(P); // cy is down
      P.alive = false; expect(nearestOf(5, 0)).toBe(bo);
      crew.others = () => []; expect(nearestOf(5, 0)).toBe(P);
    } finally { Object.assign(P, saved); crew.others = others; }
  });
});

describe('where a player comes into the city in multiplayer', () => {
  const spots = [{ x: 0, z: 0, yaw: 1 }, { x: 100, z: 0, yaw: 1 }, { x: 300, z: 0, yaw: 1 }];
  it('takes the usual spot when no law is near it', () => {
    expect(safeSpot(spots, [{ x: 0, z: SAFE_R + 1 }])).toBe(spots[0]);
  });
  it('moves on to the next spot with nobody hunting near it', () => {
    expect(safeSpot(spots, [{ x: 10, z: 0 }])).toBe(spots[1]);
    expect(safeSpot(spots, [{ x: 10, z: 0 }, { x: 110, z: 5 }])).toBe(spots[2]);
  });
  it('picks the one with the law furthest off when every spot has some near', () => {
    expect(safeSpot(spots, [{ x: 5, z: 0 }, { x: 140, z: 0 }, { x: 290, z: 0 }])).toBe(spots[1]);
  });
  it('always the usual spot in single player', () => {
    const home = { x: 1, z: 2, yaw: 3 };
    expect(spawnSpot(home, spots)).toBe(home);
  });
});
