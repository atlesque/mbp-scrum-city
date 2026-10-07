// A crash fire burns long enough for the fire brigade to come and put it out.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { WBY } from '../../public/js/data/weapons.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { NPC_TYPES } from '../../public/js/npcs/types.js';
import { SHOP_TYPES } from '../../public/js/shops/types.js';
import { TRUCK, stopShort } from '../../public/js/vehicles/firetruck.js';
import { CRASH_FIRE, spawnVehicle } from '../../public/js/vehicles/vehicle.js';

vi.mock('../../public/js/game/pickups.js', () => ({ reward() {}, dropCash() {}, dropItem() {}, dropWeapon() {} }));

const clear = () => { for (const e of all()) if (e.kind === 'vehicle' || e.kind === 'firetruck' || e.kind === 'npc') removeEntity(e); };
afterEach(clear);
// a parked sedan in the right-hand lane of the road at x = 0, far from the player
function parked(z = 25) { clear(); P.x = 0; P.z = -150; P.alive = true; P.vehicle = null; G.state = 'play'; return spawnVehicle('sedan', -3, z, 0); }
function run(seconds, dt = 0.05) {
  for (let s = 0; s < seconds; s += dt) { G.time += dt; for (const e of all()) if (e.update && !e.removed) e.update(dt); }
}

describe('crash fires', () => {
  it('a crash sets a car burning long; gunfire still sets it off quickly', () => {
    const shot = parked(); shot.damage(999, true);
    expect(shot.burnT).toBeLessThan(2); expect(shot.crashFire).toBe(false);
    const c = parked(); c.damage(999, false, true);
    expect(c.crashFire).toBe(true); expect(c.burnT).toBeGreaterThanOrEqual(40);
  });
  it('shooting a burning wreck brings the bang closer, a rocket all the way', () => {
    const c = parked(); c.damage(999, false, true);
    const before = c.burnT; c.onShot({ p: new THREE.Vector3(c.x, 1, c.z) }, WBY.pistol.dmg, null);
    expect(c.burnT).toBeLessThan(before - 5);
    c.onRocket(); expect(c.burnT).toBeLessThan(2);
  });
  it('more crashing does not', () => {
    const c = parked(); c.damage(999, false, true);
    const before = c.burnT; c.damage(40, false, true); expect(c.burnT).toBe(before);
  });
  it('a hose holds the fire back and puts it out, leaving the car standing', () => {
    const c = parked(); c.damage(999, false, true);
    const before = c.burnT;
    for (let s = 0; s < CRASH_FIRE.need - 0.5; s += 0.1) { G.time += 0.1; c.douse(0.1); c.update(0.1); }
    expect(c.burnT).toBeCloseTo(before, 5);
    for (let s = 0; s < 1; s += 0.1) { G.time += 0.1; c.douse(0.1); c.update(0.1); }
    expect(c.burnT).toBe(0); expect(c.dead).toBe(false); expect(c.hp).toBe(CRASH_FIRE.hp);
  });
});

describe('fire truck', () => {
  it('parks short of a fire up its road, and ignores one on another road', () => {
    expect(stopShort(-3, -50, 0, 1, -3, 25)).toBeCloseTo(75 - TRUCK.stop);
    expect(stopShort(-3, -50, 0, 1, 40, 25)).toBeNull(); // over on the next road
    expect(stopShort(-3, 30, 0, 1, -3, 25)).toBe(0); // already there
  });
  it('comes to a crash fire, puts it out and drives off again', () => {
    const c = parked(); c.damage(999, false, true);
    const [t] = all('firetruck');
    expect(t).toBeTruthy(); expect(t.siren).toBe(true);
    const start = Math.hypot(t.x - c.x, t.z - c.z); expect(start).toBeGreaterThan(50);
    let arrived = 0;
    for (let s = 0; s < 40 && t.state === 'respond'; s += 0.5) { run(0.5); arrived = s; }
    expect(t.state).toBe('work');
    expect(Math.hypot(t.x - c.x, t.z - c.z)).toBeLessThan(TRUCK.stop + 4);
    const crew = all('npc').filter(n => n.type === 'fireman');
    expect(crew).toHaveLength(TRUCK.crew);
    for (let s = 0; s < 30 && c.burnT > 0; s += 0.5) run(0.5);
    expect(c.dead).toBe(false); expect(c.burnT).toBe(0);
    expect(arrived).toBeLessThan(40);
    for (let s = 0; s < 30 && t.state === 'work'; s += 0.5) run(0.5);
    expect(t.state).toBe('leave');
    expect(all('npc').filter(n => n.type === 'fireman' && n.alive)).toHaveLength(0);
  });
  it('sends one truck per fire', () => {
    const a = parked(); spawnVehicle('sedan', -3, 32, 0).damage(999, false, true); a.damage(999, false, true);
    expect(all('firetruck')).toHaveLength(1);
  });
});

describe('fire axe', () => {
  it('every fireman drops one, and nobody sells it', () => {
    expect(NPC_TYPES.fireman.weaponDrops.fireaxe).toBe(1);
    expect(WBY.fireaxe.melee).toBe(true);
    expect(SHOP_TYPES.gunshop.catalogue.map(i => i.id)).not.toContain('fireaxe');
  });
});
