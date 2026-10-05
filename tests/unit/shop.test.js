import { describe, expect, it } from 'vitest';
import { WBY, WEAPONS } from '../../public/js/data/weapons.js';
import { ITEM_TYPES, MAX_LEVEL, upgradeCost } from '../../public/js/shops/items.js';
import { SHOP_TYPES } from '../../public/js/shops/types.js';

function makeCtx(money) {
  const inv = { money, owned: { pistol: true }, lvl: { pistol: 0 }, ammo: {}, mag: {}, cur: 'pistol' };
  const player = { hp: 40, armor: 0 };
  return { inv, player, equipped: null, pay(n) { if (inv.money < n) return false; inv.money -= n; return true; }, equip(id) { this.equipped = id; inv.cur = id; } };
}
const paid = WEAPONS.find(w => !w.infinite && w.price > 0);

describe('shop items', () => {
  it('buying a weapon takes the money, gives ammo and equips it', () => {
    const ctx = makeCtx(paid.price);
    expect(ITEM_TYPES.weapon.act({ type: 'weapon', id: paid.id }, 'buy', ctx)).toBe(true);
    expect(ctx.inv.money).toBe(0);
    expect(ctx.inv.owned[paid.id]).toBe(true);
    expect(ctx.inv.ammo[paid.id]).toBe(paid.ammoPack);
    expect(ctx.equipped).toBe(paid.id);
  });
  it('refuses what the player cannot afford', () => {
    const ctx = makeCtx(paid.price - 1);
    expect(ITEM_TYPES.weapon.act({ type: 'weapon', id: paid.id }, 'buy', ctx)).toBe(false);
    expect(ctx.inv.owned[paid.id]).toBeUndefined();
  });
  it('upgrades stop at the max level', () => {
    const ctx = makeCtx(1e9), w = WBY.pistol;
    for (let l = 0; l < MAX_LEVEL; l++) expect(ITEM_TYPES.weapon.act({ type: 'weapon', id: 'pistol' }, 'up', ctx)).toBe(true);
    expect(ctx.inv.lvl.pistol).toBe(MAX_LEVEL);
    expect(ITEM_TYPES.weapon.act({ type: 'weapon', id: 'pistol' }, 'up', ctx)).toBe(false);
    expect(ctx.inv.money).toBe(1e9 - [0, 1, 2].reduce((s, l) => s + upgradeCost(w, l), 0));
  });
  it('heal and armor top the player up', () => {
    const ctx = makeCtx(1000);
    expect(ITEM_TYPES.heal.act({ type: 'heal', price: 250 }, 'buy', ctx)).toBe(true);
    expect(ITEM_TYPES.armor.act({ type: 'armor', price: 400 }, 'buy', ctx)).toBe(true);
    expect(ctx.player).toEqual({ hp: 100, armor: 100 });
    expect(ctx.inv.money).toBe(350);
    expect(ITEM_TYPES.heal.act({ type: 'heal', price: 250 }, 'buy', ctx)).toBe(false);
  });
  it('every catalogue item renders a card', () => {
    const ctx = makeCtx(500);
    for (const def of Object.values(SHOP_TYPES)) def.catalogue.forEach((item, i) => {
      expect(ITEM_TYPES[item.type], `${item.type} in ${def.name}`).toBeDefined();
      expect(ITEM_TYPES[item.type].render(item, ctx, i)).toContain('class="card');
    });
  });
});
