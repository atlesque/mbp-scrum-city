import { describe, expect, it } from 'vitest';
import { GUNS, WBY, loseFound, wStat } from '../../public/js/data/weapons.js';
import { pickUpWeapon, takeWeapon } from '../../public/js/game/pickups.js';
import { NPC_TYPES } from '../../public/js/npcs/types.js';
import { ITEM_TYPES } from '../../public/js/shops/items.js';
import { SHOP_TYPES } from '../../public/js/shops/types.js';
import { THROW, bounce, throwVelocity } from '../../public/js/combat/throwables.js';

const fresh = () => ({ money: 0, owned: { fist: true, pistol: true }, lvl: { pistol: 0 }, mag: { pistol: 12 }, ammo: {}, found: {}, cur: 'pistol' });

describe('enemy weapon drops', () => {
  it('army drop grenades, feds molotovs, police nightsticks and the boss always his minigun', () => {
    expect(NPC_TYPES.army.weaponDrops.grenade).toBeGreaterThan(0);
    expect(NPC_TYPES.fbi.weaponDrops.molotov).toBeGreaterThan(0);
    expect(NPC_TYPES.cop.weaponDrops.nightstick).toBeGreaterThan(0);
    expect(NPC_TYPES.cop.weaponDrops.nightstick).toBeLessThan(1);
    expect(NPC_TYPES.jugg.weaponDrops.minigun).toBe(1);
    for (const t of Object.values(NPC_TYPES)) for (const id of Object.keys(t.weaponDrops || {})) expect(WBY[id], id).toBeTruthy();
  });
  it('grenades and molotovs sit on keys 8 and 9 and are not sold', () => {
    expect(GUNS.findIndex(w => w.id === 'grenade') + 1).toBe(8);
    expect(GUNS.findIndex(w => w.id === 'molotov') + 1).toBe(9);
    const cat = SHOP_TYPES.gunshop.catalogue.map(i => i.id);
    expect(cat).not.toContain('grenade'); expect(cat).not.toContain('molotov');
  });
  it('a dropped gun comes loaded with a pack, and gives just the pack when already owned', () => {
    const inv = fresh();
    expect(pickUpWeapon(inv, 'minigun')).toBe('Minigun');
    expect(inv.owned.minigun).toBe(true); expect(inv.found.minigun).toBe(true);
    expect(inv.mag.minigun).toBe(wStat(WBY.minigun, 0).mag); expect(inv.ammo.minigun).toBe(WBY.minigun.ammoPack);
    expect(pickUpWeapon(inv, 'minigun')).toMatch(/ammo/);
    expect(inv.ammo.minigun).toBe(2 * WBY.minigun.ammoPack);
  });
  it('thrown weapons stack, and a melee weapon already owned stays on the street', () => {
    const inv = fresh();
    pickUpWeapon(inv, 'grenade'); pickUpWeapon(inv, 'grenade');
    expect(inv.ammo.grenade).toBe(2 * WBY.grenade.ammoPack);
    expect(pickUpWeapon(inv, 'nightstick')).toBe('Nightstick');
    expect(pickUpWeapon(inv, 'nightstick')).toBeNull();
  });
});

describe('found weapons are lost on death', () => {
  it('takes back picked-up weapons and keeps bought ones', () => {
    const inv = fresh();
    inv.owned.smg = true; inv.ammo.smg = 60; // bought
    takeWeapon(inv, 'bat'); pickUpWeapon(inv, 'minigun'); pickUpWeapon(inv, 'molotov'); pickUpWeapon(inv, 'smg');
    const lost = loseFound(inv);
    expect(lost.sort()).toEqual(['bat', 'minigun', 'molotov']);
    expect(Object.keys(inv.owned).sort()).toEqual(['fist', 'pistol', 'smg']);
    expect(inv.ammo.smg).toBe(60 + WBY.smg.ammoPack); // ammo picked up for a bought gun stays
    expect(inv.ammo.minigun).toBe(0); expect(inv.found).toEqual({});
  });
  it('buying a picked-up weapon at the shop keeps it', () => {
    const inv = { ...fresh(), money: 20000 };
    pickUpWeapon(inv, 'minigun');
    const ctx = { inv, player: {}, pay(p) { if (inv.money < p) return false; inv.money -= p; return true; }, equip(id) { inv.cur = id; } };
    expect(ITEM_TYPES.weapon.act({ type: 'weapon', id: 'minigun' }, 'up', ctx)).toBe(false); // buy it first
    expect(ITEM_TYPES.weapon.render({ type: 'weapon', id: 'minigun' }, ctx, 0)).toContain('Buy to keep');
    expect(ITEM_TYPES.weapon.act({ type: 'weapon', id: 'minigun' }, 'buy', ctx)).toBe(true);
    expect(inv.money).toBe(20000 - WBY.minigun.price);
    expect(loseFound(inv)).toEqual([]);
    expect(inv.owned.minigun).toBe(true);
  });
});

describe('throwing', () => {
  it('lobs further when aimed higher, up to about 45 degrees', () => {
    const range = p => { const v = throwVelocity(0, p); return 2 * v.y * Math.hypot(v.x, v.z) / -THROW.gravity; };
    expect(range(0)).toBeGreaterThan(8);
    expect(range(0.4)).toBeGreaterThan(range(0));
    expect(throwVelocity(Math.PI / 2, 0).x).toBeGreaterThan(0);
  });
  it('bounces off the ground losing most of its speed', () => {
    const b = bounce({ x: 4, y: -10, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(b.y).toBeCloseTo(10 * THROW.bounce);
    expect(b.x).toBeGreaterThan(0); expect(b.x).toBeLessThan(4);
  });
});
