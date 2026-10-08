// A crash fire burns long enough for the fire brigade to come and put it out.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { WBY } from '../../public/js/data/weapons.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { NPC_TYPES } from '../../public/js/npcs/types.js';
import { SHOP_TYPES } from '../../public/js/shops/types.js';
import { TRUCK, TRUCK_BLAST, spawnTruck, stopShort, takeTruck } from '../../public/js/vehicles/firetruck.js';
import { CRASH_FIRE, KINDS, crashDriver, driveByPlayer, spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { explosion } from '../../public/js/combat/combat.js';
import { hurtPlayer } from '../../public/js/game/player.js';

// getting in needs the page (the HUD); here it only takes the seat
vi.mock('../../public/js/game/player.js', async orig => ({ ...await orig(), enterVehicle(v) { P.vehicle = v; v.driver = P; v.mode = 'player'; } }));
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

describe('driving the fire truck', () => {
  it('is the same size as the one on call and goes up as big', () => {
    const K = KINDS.truck;
    expect([K.body.hw, K.body.hl]).toEqual([TRUCK.hw, TRUCK.hl]);
    expect(K.blast.r).toBe(TRUCK_BLAST.r);
    expect(K.ram.mass).toBeGreaterThan(KINDS.car.ram.mass);
  });
  it('a crash dents the truck but leaves its driver unhurt, unlike a car', () => {
    G.state = 'play'; P.alive = true; P.armor = 0;
    const page = globalThis.document; globalThis.document = { getElementById: () => ({ style: {} }) }; // the hurt vignette
    for (const [model, hurt] of [['firetruck', false], ['sedan', true]]) {
      const v = spawnVehicle(model, 0, 40, 0); P.vehicle = v; P.hp = 100;
      crashDriver(v, 20);
      expect(P.hp < 100).toBe(hurt);
      P.vehicle = null; v.damage(999, false, true);
    }
    globalThis.document = page;
  });
  it('shots and blasts that would hurt its driver hit the truck instead; a car driver still gets hurt', () => {
    G.state = 'play'; P.alive = true; P.armor = 0;
    const page = globalThis.document; globalThis.document = { getElementById: () => ({ style: {} }) };
    for (const [model, hurt] of [['firetruck', false], ['sedan', true]]) {
      const v = spawnVehicle(model, 0, 40, 0); P.vehicle = v; P.x = v.x; P.z = v.z; P.y = 0; P.hp = 100;
      let hp = v.hp; hurtPlayer(12, 'torso');
      expect(P.hp < 100).toBe(hurt);
      if (!hurt) expect(v.hp).toBe(hp - 12);
      P.hp = 100; hp = v.hp; explosion(v.x + 3, 0.5, v.z, 8, 60, false);
      expect(P.hp < 100).toBe(hurt);
      expect(v.hp).toBeLessThan(hp);
      P.vehicle = null; v.damage(999, false, true);
    }
    globalThis.document = page;
  });
  it('the player can take one parked at a fire: they drive off in it and the crew runs', () => {
    const c = parked(); c.damage(999, false, true);
    const [t] = all('firetruck');
    for (let s = 0; s < 40 && t.state === 'respond'; s += 0.5) run(0.5);
    run(1);
    expect(t.state).toBe('work');
    const door = KINDS.truck.exitAt(t); P.x = door.x; P.z = door.z; P.y = 0;
    const it = t.interaction(P); expect(it).toBeTruthy(); expect(it.keys).toContain('ride');
    const heat = G.heat;
    const v = takeTruck(t);
    expect(t.removed).toBe(true); expect(all('firetruck')).toHaveLength(0);
    expect(v.model.id).toBe('firetruck'); expect(P.vehicle).toBe(v); expect(v.driver).toBe(P);
    expect(v.siren).toBe(false); expect(G.heat).toBeGreaterThan(heat);
    expect(all('npc').filter(n => n.type === 'fireman' && n.alive).every(n => !n.truck && n.state === 'flee')).toBe(true);
    P.vehicle = null;
  });
  it('can not be taken while it races to a fire', () => {
    const c = parked(); const t = spawnTruck(-3, -60, c);
    t.v = 12; const door = KINDS.truck.exitAt(t); P.x = door.x; P.z = door.z;
    expect(t.interaction(P)).toBeNull();
  });
  it('shoves a car out of its way instead of stopping dead', () => {
    clear(); P.alive = true; G.state = 'play';
    const v = spawnVehicle('firetruck', -3, 0, 0), car = spawnVehicle('sedan', -3, 6.4, 0);
    P.vehicle = v; v.driver = P; v.mode = 'player'; v.v = 12;
    driveByPlayer(v, 1 / 60);
    expect(Math.hypot(car.kvx || 0, car.kvz || 0)).toBeGreaterThan(5);
    expect(v.v).toBeGreaterThan(8);
    P.vehicle = null; v.driver = null;
  });
});

describe('fire axe', () => {
  it('every fireman drops one, and nobody sells it', () => {
    expect(NPC_TYPES.fireman.weaponDrops.fireaxe).toBe(1);
    expect(WBY.fireaxe.melee).toBe(true);
    expect(SHOP_TYPES.gunshop.catalogue.map(i => i.id)).not.toContain('fireaxe');
  });
});
