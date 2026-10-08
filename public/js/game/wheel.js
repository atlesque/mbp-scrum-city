import { GUNS, MELEE, WBY } from '../data/weapons.js';

// ================= WEAPON WHEEL =================
// Hold the melee key (Q) and the wheel opens: ten slices, clockwise from the top. The melee weapons share one slice
// and so do the thrown ones; pointing past such a slice opens its outer ring, one segment per weapon owned in it.
// The mouse moves a cursor around the centre (x right, y down, 1 = the wheel's rim); where it points picks the slot.
// Drawing lives in ui/wheel.js, this file is the layout and the picking, so it can be tested without a page.
// The guns follow in number-key order, the thrown ones sharing a slice where the first of them sits.
export const WHEEL_SLOTS = [{ id: 'melee', items: MELEE.map(w => w.id) }];
for (const w of GUNS) {
  const lastSlot = WHEEL_SLOTS[WHEEL_SLOTS.length - 1];
  if (w.thrown && lastSlot.id === 'thrown') lastSlot.items.push(w.id);
  else WHEEL_SLOTS.push({ id: w.thrown ? 'thrown' : w.id, items: [w.id] });
}
export const SLOT_ARC = Math.PI * 2 / WHEEL_SLOTS.length;
export const RING_ARC = 0.36; // radians per weapon in an outer ring
export const DEAD = 0.2;      // inside this the cursor points at nothing
export const OUTER = 0.78;    // past this, over a group, it points into the outer ring

// angle of a point, clockwise from straight up, in 0..2π
export const angleOf = (x, y) => (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
export const slotAngle = i => i * SLOT_ARC;
export const slotAt = a => Math.round(a / SLOT_ARC) % WHEEL_SLOTS.length;
// signed difference between two angles, -π..π
const diff = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export const ownedIn = (i, owned) => WHEEL_SLOTS[i].items.filter(id => owned[id]);
// the outer ring of slot i: the weapons owned in it and where the ring starts, or null when there's nothing to choose
export function ringOf(i, owned) {
  const items = ownedIn(i, owned);
  if (WHEEL_SLOTS[i].items.length < 2 || items.length < 2) return null;
  return { items, start: slotAngle(i) - items.length * RING_ARC / 2 };
}
// what a slot gives when pointed at without choosing in its ring: the weapon in hand if it's in there,
// else the melee weapon used last, else the first one owned
export function defaultItem(i, owned, cur, last) {
  const items = ownedIn(i, owned);
  if (items.includes(cur)) return cur;
  if (items.includes(last)) return last;
  return items[0] || null;
}

// Where the cursor (x, y) points, given what it pointed at before (prev: { slot, item }).
// Returns { slot, item, ring }: ring is true while the pick comes from an outer ring.
export function pickAt(x, y, owned, prev, cur, last) {
  const r = Math.hypot(x, y);
  if (r < DEAD) return { slot: -1, item: null, ring: false };
  const a = angleOf(x, y);
  // out in the ring of the group already pointed at, the angle picks a weapon in it (past either end, the end one)
  if (r > OUTER && prev && prev.slot >= 0) {
    const g = ringOf(prev.slot, owned);
    if (g && Math.abs(diff(a, slotAngle(prev.slot))) < g.items.length * RING_ARC / 2 + 0.15) {
      const k = Math.max(0, Math.min(g.items.length - 1, Math.floor(diff(a, g.start) / RING_ARC)));
      return { slot: prev.slot, item: g.items[k], ring: true };
    }
  }
  const slot = slotAt(a);
  const keep = prev && prev.slot === slot && prev.item && owned[prev.item];
  return { slot, item: keep ? prev.item : defaultItem(slot, owned, cur, last), ring: false };
}
// the mouse wheel steps through the group pointed at
export function stepRing(pick, owned, dir) {
  if (!pick || pick.slot < 0) return pick;
  const items = ownedIn(pick.slot, owned); if (items.length < 2) return pick;
  const i = items.indexOf(pick.item);
  return { ...pick, item: items[(i + dir + items.length) % items.length] };
}
// the key that picks a slot straight away: the wheel key for melee, the number keys for the rest
export function slotKeys(i, meleeKey) {
  const s = WHEEL_SLOTS[i];
  if (s.id === 'melee') return meleeKey;
  return s.items.map(id => String((GUNS.indexOf(WBY[id]) + 1) % 10)).join(' ');
}
