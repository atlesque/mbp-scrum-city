import { describe, expect, it } from 'vitest';
import { GUNS, MELEE, WEAPONS } from '../../public/js/data/weapons.js';
import { DEAD, OUTER, RING_ARC, WHEEL_SLOTS, pickAt, ringOf, slotAngle, slotAt, slotKeys, stepRing } from '../../public/js/game/wheel.js';
import { ICONS } from '../../public/js/ui/weapon-icons.js';

// a cursor at radius r pointing at angle a (clockwise from up), in the wheel's screen coordinates
const toward = (a, r) => [r * Math.sin(a), -r * Math.cos(a)];
const owned = { fist: true, knuckles: true, bat: true, katana: true, pistol: true, rifle: true, grenade: true, molotov: true };
const slot = id => WHEEL_SLOTS.findIndex(s => s.id === id);

describe('weapon wheel layout', () => {
  it('has one slice for melee, one for the thrown weapons and one per gun, melee at the top', () => {
    expect(WHEEL_SLOTS.map(s => s.id)).toEqual(['melee', 'pistol', 'smg', 'shotgun', 'rifle', 'minigun', 'rpg', 'sniper', 'thrown', 'laser']);
    expect(WHEEL_SLOTS[0].items).toEqual(MELEE.map(w => w.id));
    expect(WHEEL_SLOTS.flatMap(s => s.items).sort()).toEqual(WEAPONS.map(w => w.id).sort());
  });
  it('labels each slice with the key that picks it', () => {
    expect(slotKeys(0, 'Q')).toBe('Q');
    expect(slotKeys(slot('pistol'), 'Q')).toBe('1');
    expect(slotKeys(slot('thrown'), 'Q')).toBe('8 9');
    expect(slotKeys(slot('laser'), 'Q')).toBe(String(GUNS.length % 10));
  });
  it('has an icon for every weapon', () => {
    for (const w of WEAPONS) expect(ICONS[w.id], w.id).toBeTruthy();
  });
});

describe('pointing at the wheel', () => {
  it('points at nothing near the centre, and at the slice the mouse is toward further out', () => {
    expect(pickAt(0.05, 0.05, owned, null, 'pistol').slot).toBe(-1);
    for (let i = 0; i < WHEEL_SLOTS.length; i++) expect(slotAt(slotAngle(i) + 0.1)).toBe(i);
    const p = pickAt(...toward(slotAngle(slot('rifle')), 0.5), owned, null, 'pistol');
    expect(p).toEqual({ slot: slot('rifle'), item: 'rifle', ring: false });
  });
  it('gives nothing for a gun not owned yet', () => {
    expect(pickAt(...toward(slotAngle(slot('rpg')), 0.5), owned, null, 'pistol').item).toBeNull();
  });
  it('the melee slice gives the melee weapon used last, or fists', () => {
    expect(pickAt(...toward(0, 0.5), owned, null, 'pistol', 'bat').item).toBe('bat');
    expect(pickAt(...toward(0, 0.5), owned, null, 'pistol', 'chainsaw').item).toBe('fist');
    expect(pickAt(...toward(0, 0.5), owned, null, 'katana', 'bat').item).toBe('katana');
  });
  it('the outer ring holds only the owned weapons of a group, and its angle picks one', () => {
    const g = ringOf(0, owned);
    expect(g.items).toEqual(['fist', 'knuckles', 'bat', 'katana']);
    expect(ringOf(slot('pistol'), owned)).toBeNull();
    expect(ringOf(0, { fist: true, pistol: true })).toBeNull();
    const prev = pickAt(...toward(0, 0.5), owned, null, 'pistol');
    g.items.forEach((id, k) => {
      const p = pickAt(...toward(g.start + (k + 0.5) * RING_ARC, OUTER + 0.1), owned, prev, 'pistol');
      expect(p).toEqual({ slot: 0, item: id, ring: true });
    });
  });
  it('the ring only opens from its own slice: going out over a gun picks the gun', () => {
    const prev = pickAt(...toward(slotAngle(slot('rifle')), 0.5), owned, null, 'pistol');
    expect(pickAt(...toward(slotAngle(slot('rifle')), 1), owned, prev, 'pistol').item).toBe('rifle');
  });
  it('a ring pick stays while the cursor comes back over the slice, and scrolling steps through the group', () => {
    const g = ringOf(slot('thrown'), owned);
    const inRing = pickAt(...toward(g.start + 1.5 * RING_ARC, 0.9), owned, pickAt(...toward(slotAngle(slot('thrown')), 0.5), owned, null, 'pistol'), 'pistol');
    expect(inRing.item).toBe('molotov');
    expect(pickAt(...toward(slotAngle(slot('thrown')), 0.5), owned, inRing, 'pistol').item).toBe('molotov');
    expect(stepRing(inRing, owned, 1).item).toBe('grenade');
    expect(stepRing({ slot: 0, item: 'katana' }, owned, 1).item).toBe('fist');
    expect(stepRing({ slot: 0, item: 'fist' }, owned, -1).item).toBe('katana');
  });
  it('keeps the dead zone and the ring inside the rim', () => {
    expect(DEAD).toBeLessThan(OUTER); expect(OUTER).toBeLessThan(1);
  });
});
