import { describe, expect, it } from 'vitest';
import { HIT_AT, MELEE_ANIMS, READY, startSwing, swingPose, tickSwing } from '../../public/js/characters/swing.js';
import { MELEE_MODEL_IDS, meleeModel } from '../../public/js/characters/melee-models.js';
import { GUNS, MELEE, WBY, WEAPONS, loadAll, wStat } from '../../public/js/data/weapons.js';
import { blowOf, inArc, meleeHeat, nextMelee } from '../../public/js/combat/melee.js';
import { takeWeapon } from '../../public/js/game/pickups.js';
import { ITEM_TYPES } from '../../public/js/shops/items.js';
import { SHOP_TYPES } from '../../public/js/shops/types.js';

describe('melee weapons', () => {
  it('fists plus the Vice City street set, ahead of six guns on keys 1-6', () => {
    expect(MELEE.map(w => w.id)).toEqual(['fist', 'knuckles', 'knife', 'nightstick', 'golf', 'bat', 'machete', 'katana', 'fireaxe', 'chainsaw']);
    expect(GUNS.map(w => w.id).slice(0, 6)).toEqual(['pistol', 'smg', 'shotgun', 'rifle', 'minigun', 'rpg']);
    expect(WEAPONS.length).toBe(MELEE.length + GUNS.length);
  });
  it('each has a swing, a reach and an arc, and a model unless it is the fists', () => {
    for (const w of MELEE) {
      expect(MELEE_ANIMS[w.anim], w.id).toBeDefined();
      expect(READY[w.anim], w.id).toBeDefined();
      expect(w.reach).toBeGreaterThan(1); expect(w.reach).toBeLessThan(2.5);
      expect(w.arc).toBeGreaterThan(0.3); expect(w.hits).toBeGreaterThanOrEqual(1);
      if (w.id !== 'fist') expect(MELEE_MODEL_IDS, w.id).toContain(w.id);
    }
    for (const id of MELEE_MODEL_IDS) {
      const m = meleeModel(id);
      expect(m.geo.attributes.position.count, id).toBeGreaterThan(0);
      expect(m.muzzle.z, id + ' tip points ahead of the hand').toBeGreaterThanOrEqual(0);
    }
    expect(meleeModel('fist')).toBeNull();
  });
  it('heavier weapons hit harder, and the katana outdoes the bat outdoes the fists', () => {
    const dps = id => wStat(WBY[id], 0).dmg / WBY[id].rate;
    expect(dps('katana')).toBeGreaterThan(dps('bat'));
    expect(dps('bat')).toBeGreaterThan(dps('fist'));
    expect(dps('chainsaw')).toBeGreaterThan(dps('katana'));
    // a katana to the head takes down a cop in one blow; a fist to the body does not
    expect(wStat(WBY.katana, 0).dmg * 2.5).toBeGreaterThan(70);
    expect(wStat(WBY.fist, 0).dmg).toBeLessThan(40);
  });
  it('need no ammo, so respawn and reload leave them alone', () => {
    const inv = { owned: { fist: true, bat: true, pistol: true }, lvl: {}, mag: {}, ammo: {} };
    loadAll(inv);
    expect(inv.mag).toEqual({ pistol: 12 });
  });
});

describe('swings', () => {
  it('reach someone in front, not behind or to the side', () => {
    expect(inArc(0, 0, 0, 0, 1.2, 1.3, 0.7)).toBeCloseTo(1.2);
    expect(inArc(0, 0, 0, 0, -1, 1.3, 0.7)).toBeNull();
    expect(inArc(0, 0, 0, 1.2, 0, 1.3, 0.7)).toBeNull();
    expect(inArc(0, 0, 0, 0, 2.5, 1.3, 0.7)).toBeNull();
    expect(inArc(0, 0, Math.PI / 2, 1.5, 0, 2, 0.5)).toBeCloseTo(1.5);
    expect(inArc(0, 0, 0, 0.1, -0.1, 1.3, 0.7)).not.toBeNull(); // standing on top of them
  });
  it('every third punch is a kick that hits harder and knocks people down', () => {
    const w = WBY.fist, st = wStat(w, 0);
    expect(blowOf(w, st, 0).kick).toBe(false);
    const k = blowOf(w, st, 2);
    expect(k.kick && k.down).toBe(true);
    expect(k.dmg).toBeGreaterThan(st.dmg);
    expect(blowOf(WBY.bat, wStat(WBY.bat, 0), 0).down).toBe(true);
    expect(blowOf(WBY.knife, wStat(WBY.knife, 0), 0).down).toBe(false);
  });
  it('land once, at the hit moment, and end', () => {
    const a = {}, hits = [];
    startSwing(a, 'swing', 0.7);
    for (let i = 0; i < 20; i++) tickSwing(a, 0.05, s => hits.push(s.t));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeCloseTo(0.7 * HIT_AT.swing[0], 1);
    expect(a.swing).toBeNull();
  });
  it('poses move the arm through the windup and the strike', () => {
    const windup = swingPose('swing', 0.35), strike = swingPose('swing', 0.5);
    expect(windup.r[2]).toBeLessThan(0); expect(strike.r[2]).toBeGreaterThan(0); // round from the right, across to the left
    expect(windup.tw).toBeLessThan(strike.tw);
    expect(swingPose('punch', 0.4, 2).leg).toBeLessThan(-1); // the kick
    expect(swingPose('punch', 0.35, 1).l[0]).toBeLessThan(-1.5); // the left jab
    for (const anim of Object.keys(MELEE_ANIMS)) for (let k = 0; k <= 1; k += 0.1) for (const v of swingPose(anim, k).r) expect(Number.isFinite(v)).toBe(true);
  });
  it('make the police come running, harder for hitting one of them', () => {
    expect(meleeHeat({ faction: 'law' }, false)).toBeGreaterThanOrEqual(1);
    expect(meleeHeat({ faction: 'civilian' }, true)).toBeGreaterThanOrEqual(1);
    expect(meleeHeat({ faction: 'civilian' }, false)).toBeGreaterThan(0);
  });
});

describe('getting melee weapons', () => {
  it('Q goes from a gun to fists and on through the melee weapons you own', () => {
    const owned = { fist: true, bat: true, katana: true, pistol: true };
    expect(nextMelee('pistol', owned, undefined)).toBe('fist');
    expect(nextMelee('pistol', owned, 'katana')).toBe('katana');
    expect(nextMelee('fist', owned)).toBe('bat');
    expect(nextMelee('katana', owned)).toBe('fist');
  });
  it('a street pickup hands over a weapon once', () => {
    const inv = { owned: { fist: true }, lvl: {}, mag: {}, ammo: {} };
    expect(takeWeapon(inv, 'bat')).toBe(true);
    expect(inv.owned.bat).toBe(true);
    expect(takeWeapon(inv, 'bat')).toBe(false);
  });
  it('the gun shop sells them (not the fists) without ammo', () => {
    const cat = SHOP_TYPES.gunshop.catalogue.map(i => i.id);
    expect(cat).not.toContain('fist');
    for (const w of MELEE.filter(w => !w.builtin && !w.dropOnly)) expect(cat).toContain(w.id);
    expect(cat).not.toContain('fireaxe'); // firemen drop it, nobody sells it
    const inv = { money: 5000, owned: { fist: true }, lvl: {}, mag: {}, ammo: {}, cur: 'fist' };
    const ctx = { inv, player: { hp: 100, armor: 0 }, pay(n) { if (inv.money < n) return false; inv.money -= n; return true; }, equip(id) { inv.cur = id; } };
    const html = ITEM_TYPES.weapon.render({ type: 'weapon', id: 'bat' }, ctx, 0);
    expect(html).toContain('Reach'); expect(html).not.toContain('ammo');
    expect(ITEM_TYPES.weapon.act({ type: 'weapon', id: 'bat' }, 'buy', ctx)).toBe(true);
    expect(inv.owned.bat && inv.cur === 'bat').toBe(true);
    expect(inv.ammo.bat).toBeUndefined();
    expect(ITEM_TYPES.weapon.render({ type: 'weapon', id: 'bat' }, ctx, 0)).not.toContain('data-a="ammo"');
  });
});
