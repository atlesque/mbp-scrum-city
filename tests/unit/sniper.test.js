import { describe, expect, it } from 'vitest';
import { ZONE_DAMAGE } from '../../public/js/combat/hitzones.js';
import { SCOPE_ZOOM, boltOut, nextScope, scopeFov, toggleScope } from '../../public/js/combat/scope.js';
import { G, P, inv } from '../../public/js/core/state.js';
import { WBY, wStat } from '../../public/js/data/weapons.js';
import { NPC_TYPES } from '../../public/js/npcs/types.js';
import { SHOP_TYPES } from '../../public/js/shops/types.js';

const sniper = WBY.sniper;
const shot = zone => wStat(sniper, 0).dmg * ZONE_DAMAGE[zone];

describe('the sniper rifle', () => {
  it('is sold at the gun shop', () => {
    expect(SHOP_TYPES.gunshop.catalogue.some(i => i.type === 'weapon' && i.id === 'sniper')).toBe(true);
  });
  it('drops anyone up to a soldier with one headshot, and a cop with one body shot', () => {
    for (const t of ['civilian', 'cop', 'swat', 'fbi', 'army']) expect(shot('head')).toBeGreaterThanOrEqual(NPC_TYPES[t].hp);
    expect(shot('torso')).toBeGreaterThanOrEqual(NPC_TYPES.cop.hp);
  });
  it('is a slow bolt-action, wild from the hip and pin-point through the scope', () => {
    expect(sniper.auto).toBe(false);
    expect(sniper.rate).toBeGreaterThan(1);
    expect(sniper.scopeSpread).toBeLessThan(sniper.spread / 20);
  });
});

describe('the scope', () => {
  it('steps through two zoom levels and back out', () => {
    expect(SCOPE_ZOOM.length).toBe(3);
    expect([0, 1, 2].map(nextScope)).toEqual([1, 2, 0]);
    expect(scopeFov(72, 0)).toBe(72);
    expect(scopeFov(72, 2)).toBeLessThan(scopeFov(72, 1));
  });
  it('zooms only with a scoped gun in hand, on foot', () => {
    Object.assign(G, { state: 'play', scope: 0, rescope: 0, reloadT: 0 }); P.alive = true; P.vehicle = null;
    inv.cur = 'pistol'; toggleScope(); expect(G.scope).toBe(0);
    inv.cur = 'sniper'; toggleScope(); expect(G.scope).toBe(1);
    toggleScope(); expect(G.scope).toBe(2);
    P.vehicle = {}; toggleScope(); expect(G.scope).toBe(2); P.vehicle = null;
    toggleScope(); expect(G.scope).toBe(0);
    inv.cur = 'pistol';
  });
  it('drops out for the bolt after a shot and remembers the zoom', () => {
    Object.assign(G, { scope: 2, rescope: 0 });
    boltOut();
    expect(G.scope).toBe(0); expect(G.rescope).toBe(2);
  });
});
