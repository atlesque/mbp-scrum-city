// The repair tool: bought or taken off a car's driver, it fixes vehicles on a charge that drains and refills like the jetpack.
import { afterEach, describe, expect, it } from 'vitest';
import { on } from '../../public/js/core/events.js';
import { PRESETS } from '../../public/js/core/keymap.js';
import { REPAIR, WBY, loseFound } from '../../public/js/data/weapons.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { pickUpWeapon } from '../../public/js/game/pickups.js';
import { findTarget, toolStep } from '../../public/js/game/repair.js';
import { leaveBehind } from '../../public/js/game/rewards.js';
import { weaponKey } from '../../public/js/game/wheel.js';
import { NPC_TYPES } from '../../public/js/npcs/types.js';
import { spawnNpc } from '../../public/js/npcs/npc.js';
import { ITEM_TYPES } from '../../public/js/shops/items.js';
import { SHOP_TYPES } from '../../public/js/shops/types.js';
import { TRUCK, spawnTruck } from '../../public/js/vehicles/firetruck.js';
import { CRASH_FIRE, spawnVehicle } from '../../public/js/vehicles/vehicle.js';

afterEach(() => { for (const e of all()) removeEntity(e); });

describe('the repair tool as a weapon', () => {
  it('is sold at the gun shop, has its own key and is no gun', () => {
    const w = WBY.repair;
    expect(w.tool).toBe(true); expect(w.dropOnly).toBeFalsy(); expect(w.price).toBeGreaterThan(0);
    expect(SHOP_TYPES.gunshop.catalogue.some(i => i.type === 'weapon' && i.id === 'repair')).toBe(true);
    expect(PRESETS.qwerty.tool).toBe('KeyT'); expect(PRESETS.azerty.tool).toBe('KeyT');
    expect(weaponKey('repair', 'Q', 'T')).toBe('T');
    expect(weaponKey('laser', 'Q', 'T')).toBe('0');
  });
  it('buys and equips, with no upgrades or ammo to buy', () => {
    const inv = { money: WBY.repair.price + 5000, owned: { pistol: true }, lvl: {}, ammo: {}, mag: {}, found: {}, cur: 'pistol' };
    const ctx = { inv, player: { hp: 100, armor: 0 }, pay(n) { if (inv.money < n) return false; inv.money -= n; return true; }, equip(id) { inv.cur = id; } };
    const item = { type: 'weapon', id: 'repair' };
    expect(ITEM_TYPES.weapon.act(item, 'buy', ctx)).toBe(true);
    expect(inv.owned.repair).toBe(true); expect(inv.cur).toBe('repair'); expect(inv.money).toBe(5000);
    expect(ITEM_TYPES.weapon.act(item, 'up', ctx)).toBe(false);
    expect(ITEM_TYPES.weapon.act(item, 'ammo', ctx)).toBe(false);
    expect(inv.money).toBe(5000);
    const card = ITEM_TYPES.weapon.render(item, ctx, 0);
    expect(card).toContain('OWNED'); expect(card).not.toContain('Upgrade');
  });
  it('picked up is found, so getting wasted takes it; a second one stays on the road', () => {
    const inv = { owned: { pistol: true }, lvl: {}, ammo: {}, mag: {}, found: {} };
    expect(pickUpWeapon(inv, 'repair')).toBe('Repair Tool');
    expect(inv.found.repair).toBe(true);
    expect(pickUpWeapon(inv, 'repair')).toBeNull();
    expect(loseFound(inv)).toEqual(['repair']);
    expect(inv.owned.repair).toBeUndefined();
  });
});

describe('the charge', () => {
  const target = (works = true) => ({ e: { repair: () => works } });
  it('drains while welding and fills back up once the trigger is let go', () => {
    const t = { charge: REPAIR.charge };
    expect(toolStep(t, true, target(), 1)).toBe(true);
    expect(t.charge).toBeCloseTo(REPAIR.charge - 1);
    toolStep(t, false, target(), 1);
    expect(t.charge).toBeCloseTo(REPAIR.charge - 1 + REPAIR.refill);
    toolStep(t, false, null, 100);
    expect(t.charge).toBe(REPAIR.charge);
  });
  it('runs dry, and an empty tool held on a vehicle does nothing until let go', () => {
    const t = { charge: REPAIR.charge };
    for (let i = 0; i < REPAIR.charge * 10 + 1; i++) toolStep(t, true, target(), 0.1);
    expect(t.charge).toBe(0);
    expect(toolStep(t, true, target(), 0.1)).toBe(false);
    expect(t.charge).toBe(0);
  });
  it('holding it at nothing, or at a vehicle that needs nothing, neither drains nor refills', () => {
    const t = { charge: 3 };
    expect(toolStep(t, true, null, 1)).toBe(false); expect(t.charge).toBe(3);
    expect(toolStep(t, true, target(false), 1)).toBe(false); expect(t.charge).toBe(3);
  });
});

describe('finding what to fix', () => {
  it('takes the vehicle in front and in reach, not one behind, too far, or up on a roof', () => {
    const c = spawnVehicle('sedan', 0, 4, 0), p = { x: 0, z: 0, y: 0 };
    expect(findTarget(p, 0, all())?.e).toBe(c); // facing +z, at the car's tail
    expect(findTarget(p, Math.PI, all())).toBeNull(); // facing away
    expect(findTarget({ x: 0, z: -4, y: 0 }, 0, all())).toBeNull(); // out of reach
    expect(findTarget({ x: 0, z: 0, y: 8 }, 0, all())).toBeNull(); // on a roof above
  });
  it('picks the nearest of two, and never a wreck', () => {
    const near = spawnVehicle('sedan', 2.3, 3.2, 0), far = spawnVehicle('sedan', 2.3, 3.5, 0);
    const p = { x: 0, z: 0, y: 0 };
    expect(findTarget(p, 0.5, all())?.e).toBe(near);
    near.dead = true;
    expect(near.health()).toBeNull();
    expect(findTarget(p, 0.5, all())?.e).toBe(far);
  });
});

describe('fixing a vehicle', () => {
  it('brings any vehicle back to full in 1 / REPAIR.rate seconds, and then has nothing to do', () => {
    for (const model of ['sedan', 'gs', 'estep', 'heli', 'firetruck']) {
      const v = spawnVehicle(model, 0, 0, 0), max = v.model.hp;
      v.hp = 1;
      let s = 0; while (v.repair(0.1)) s += 0.1;
      expect(v.hp, model).toBe(max);
      expect(s, model).toBeCloseTo(1 / REPAIR.rate, 0);
      expect(v.repair(0.1)).toBe(false);
    }
  });
  it('puts out a vehicle on fire first, holding the flames back meanwhile, and leaves it smoking', () => {
    const v = spawnVehicle('sedan', 0, 0, 0); let doused = null;
    const off = on('vehicle:doused', e => { doused = e.vehicle; });
    v.damage(v.hp + 1, false, true);
    expect(v.burnT).toBeGreaterThan(0);
    const fuse = v.burnT;
    expect(v.repair(REPAIR.douse / 2)).toBe(true);
    v.update(0.1);
    expect(v.burnT).toBe(fuse); // the torch holds the fire like a hose
    v.repair(REPAIR.douse / 2);
    expect(v.burnT).toBe(0); expect(v.hp).toBe(CRASH_FIRE.hp); expect(doused).toBe(v);
    expect(v.repair(1)).toBe(true); expect(v.hp).toBeGreaterThan(CRASH_FIRE.hp);
    off();
  });
  it('a wreck stays a wreck', () => {
    const v = spawnVehicle('sedan', 0, 0, 0); v.dead = true; v.hp = -5;
    expect(v.repair(5)).toBe(false); expect(v.hp).toBe(-5);
  });
  it('fixes the fire brigade\'s truck too', () => {
    const fire = spawnVehicle('sedan', 0, -60, 0), t = spawnTruck(-3, -60, fire);
    t.hp = 100;
    expect(t.health()).toMatchObject({ hp: 100, max: TRUCK.hp });
    expect(t.repair(1)).toBe(true); expect(t.hp).toBeCloseTo(100 + TRUCK.hp * REPAIR.rate);
  });
});

describe('drivers dropping it', () => {
  it('car drivers may drop it when taken down, or leave it when pulled out', () => {
    expect(NPC_TYPES.motorist.weaponDrops.repair).toBeGreaterThan(0);
    const a = spawnNpc('motorist', 5, 5);
    const left = leaveBehind(a, () => 0);
    expect(left).toHaveLength(1); expect(left[0].id).toBe('repair');
    expect(leaveBehind(a, () => 0.99)).toHaveLength(0);
    expect(leaveBehind(spawnNpc('biker', 0, 0), () => 0)).toHaveLength(0);
  });
  it('pulling a driver out of a car is what sets it off', () => {
    const c = spawnVehicle('sedan', 0, 0, 0, 'traffic'), a = spawnNpc('motorist', 0, 0); c.seatDriver(a);
    const was = Math.random; Math.random = () => 0;
    try { c.scareDriver({ x: 3, z: 0 }); } finally { Math.random = was; }
    expect(all('pickup').some(p => p.id === 'repair')).toBe(true);
  });
});
