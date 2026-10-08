import { afterEach, describe, expect, it, vi } from 'vitest';
import { G, P, stats } from '../../public/js/core/state.js';
import { WBY, wStat } from '../../public/js/data/weapons.js';
import { SIX_STAR_AFTER, WANTED } from '../../public/js/data/wanted.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { holdFive } from '../../public/js/game/wanted.js';
import { NPC_TYPES } from '../../public/js/npcs/types.js';
import { CRASH_BLAST as HELI_BLAST } from '../../public/js/vehicles/heli.js';
import { TANK_BLAST } from '../../public/js/vehicles/tank.js';
import { CRASH_BLAST, CREW_MAX, DISC_HH, DISC_R, UFO_HP, rayEllipsoid, removeUfo, spawnUfo } from '../../public/js/vehicles/ufo.js';

vi.mock('../../public/js/game/pickups.js', () => ({ reward() {} }));

function ufo() {
  removeUfo(null); P.x = 0; P.z = 0; P.y = 0; P.alive = true; P.hp = 100; P.vehicle = null; G.wanted = 6;
  return spawnUfo();
}
const clearAliens = () => { for (const n of all('npc')) removeEntity(n); };
afterEach(() => { removeUfo(null); clearAliens(); G.wanted = 0; G.fiveT = 0; });

describe('secret sixth star', () => {
  it('comes after five straight minutes at five stars', () => {
    G.wanted = 5; G.fiveT = 0;
    for (let t = 0; t < SIX_STAR_AFTER - 1; t++) holdFive(1);
    expect(G.wanted).toBe(5);
    holdFive(1);
    expect(G.wanted).toBe(6);
    expect(stats.best).toBe(6);
    expect(SIX_STAR_AFTER).toBe(300);
  });
  it('starts the count over when the fifth star is lost', () => {
    G.wanted = 5; G.fiveT = 0;
    holdFive(SIX_STAR_AFTER - 10);
    G.wanted = 4; holdFive(1);
    expect(G.fiveT).toBe(0);
    G.wanted = 5; holdFive(20);
    expect(G.wanted).toBe(5);
  });
  it('only sends the UFO at six stars', () => {
    expect(WANTED[6].ufo).toBe(true);
    expect(WANTED.slice(1, 6).some(L => L.ufo)).toBe(false);
  });
});

describe('UFO', () => {
  it('is hit by a shot through its disc and missed beside it', () => {
    const o = new THREE.Vector3(-30, 10, 0), d = new THREE.Vector3(1, 0, 0);
    expect(rayEllipsoid(o, d, 0, 10, 0, DISC_R, DISC_HH)).toBeCloseTo(30 - DISC_R);
    expect(rayEllipsoid(o, d, 0, 10 + DISC_HH + 0.2, 0, DISC_R, DISC_HH)).toBe(Infinity);
    expect(rayEllipsoid(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0, 10, 0, DISC_R, DISC_HH)).toBeCloseTo(10 - DISC_HH);
  });
  it('takes about six direct rockets to bring down', () => {
    const u = ufo(), dmg = wStat(WBY.rpg, 0).dmg;
    let n = 0;
    while (!u.falling && n < 20) { u.onRocket(dmg); u.blast(u.x, u.y, u.z, 10, dmg, true); n++; }
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(6);
    expect(UFO_HP).toBeGreaterThan(2000);
  });
  it('crashes bigger than the tank goes up', () => {
    expect(CRASH_BLAST.r).toBeGreaterThan(TANK_BLAST.r);
    expect(CRASH_BLAST.dmg).toBeGreaterThan(TANK_BLAST.dmg);
    expect(HELI_BLAST.r).toBeLessThan(CRASH_BLAST.r);
  });
  it('beams down aliens over the player, up to a full crew', () => {
    const u = ufo();
    Object.assign(u, { x: 20, z: 0, y: 24, ang: 0 });
    const aliens = () => all('npc').filter(n => n.type === 'alien');
    let landed = false;
    for (let i = 0; i < 60 * 120; i++) {
      G.time += 1 / 60; u.update(1 / 60);
      for (const n of aliens()) { n.update(1 / 60); if (n.y === 0 && n.behaviour === 'hunt') landed = true; }
    }
    expect(aliens().length).toBeGreaterThan(0);
    expect(aliens().length).toBeLessThanOrEqual(CREW_MAX);
    expect(landed).toBe(true);
  });
  it('flies off when the sixth star fades', () => {
    const u = ufo(); G.wanted = 5;
    for (let i = 0; i < 60 * 10 && G.ufo; i++) u.update(1 / 60);
    expect(G.ufo).toBe(null);
  });
});

describe('aliens', () => {
  it('carry laser rifles, and drop them', () => {
    const a = NPC_TYPES.alien;
    expect(a.gun).toBe('laser');
    expect(WBY.laser.laser).toBe(true);
    expect(a.weaponDrops.laser).toBeGreaterThan(0);
    expect(a.leaveBelow).toBe(6);
  });
  it('the laser rifle is never sold and keeps the thrown weapons on 8 and 9', async () => {
    const { GUNS } = await import('../../public/js/data/weapons.js');
    expect(WBY.laser.dropOnly).toBe(true);
    expect(GUNS.map(w => w.id).slice(7)).toEqual(['grenade', 'molotov', 'laser']);
  });
});
