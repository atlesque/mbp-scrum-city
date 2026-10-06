import { WEAPONS } from '../data/weapons.js';

// Every kind of shop. To add one, add an entry here and place it in SHOP_SITES (world/city.js).
//   name, tagline, calm      menu title, and the subtitle shown when no cops are around
//   footer                   small print under the menu
//   closedAtWanted           wanted level at which the shutters come down (omit to never close)
//   marker                   radar glyph and colour, also used for the ring at the door
//   storefront               colours and sign for the building world/city.js puts up
//   catalogue                what it sells; each item's `type` is an entry in ITEM_TYPES (shops/items.js)
export const SHOP_TYPES = {
  gunshop: {
    name: 'Bullet Bros. Guns', tagline: 'Est. 1979', calm: 'No questions asked',
    footer: 'Upgrades raise damage, magazine size and fire rate, plus blast radius for rockets. Progress saves in this browser.',
    closedAtWanted: 4,
    marker: { glyph: '$', color: '#ff4fa3' },
    storefront: { wall: '#ffd0e5', roof: '#2b1b3d', neon: '#ff2fa8', awning: '#ff4fa3', sign: { text: 'Bullet Bros. Guns', color: '#ff3fae', font: '"Yellowtail", cursive' } },
    catalogue: [
      ...WEAPONS.map(w => ({ type: 'weapon', id: w.id })),
      { type: 'heal', name: 'Street medic', blurb: 'A bandage, a bottle of something, and a pat on the back.', price: 250 },
      { type: 'armor', name: 'Kevlar vest', blurb: "Soaks up most of each bullet until it's shredded.", price: 400 },
    ],
  },
};
