import { seeded } from '../core/util.js';
import { box } from '../render/geometry.js';
import { SHOP_TYPES } from '../shops/types.js';
import { clubSite, onClubFace } from './club.js';

export const CENTER = { site: null };
const sameBuilding = (a, b) => b && a.x0 === b.x0 && a.x1 === b.x1 && a.z0 === b.z0;
// A separate random stream keeps both the chosen address and the rest of the city stable on reload.
export function pickCenterSite(spots, roofs, club, random = seeded(86603)) {
  const candidates = spots.filter(b => b.h >= 8 && b.h <= 26 && b.x1 - b.x0 >= 10 && b.z1 - b.z0 >= 10
    && !roofs.some(r => sameBuilding(b, r)) && !sameBuilding(b, club));
  return candidates.length ? clubSite(candidates[Math.floor(random() * candidates.length)]) : null;
}
export function buildPokemonCenter({ plain, neon, sign }, spots, roofs, club, signs) {
  const s = CENTER.site = pickCenterSite(spots, roofs, club);
  if (!s) return null;
  for (let i = signs.length - 1; i >= 0; i--) if (onClubFace(signs[i], s)) signs.splice(i, 1);
  const sf = SHOP_TYPES.pokemoncenter.storefront, { fn, door } = s;
  const part = (width, height, depth, out, y, color) => box(plain, fn[0] ? depth : width, height, fn[0] ? width : depth, door.x + fn[0] * out, y, door.z + fn[1] * out, color);
  part(s.fw * 0.85, 2.5, 0.5, 0.5, 4.5, sf.wall);
  part(s.fw * 0.9, 0.35, 2.4, 1.1, 3.1, sf.awning);
  part(2.4, 2.6, 0.16, 0.65, 1.3, '#302d40');
  part(1.9, 2.3, 0.16, 0.76, 1.2, '#a8e7ed');
  part(2, 1, 0.3, 0.65, 7.2, sf.roof);
  part(2, 1, 0.3, 0.65, 6.2, '#fff5e7');
  part(2, 0.18, 0.4, 0.73, 6.7, '#302d40');
  part(0.5, 0.5, 0.5, 0.82, 6.7, '#fff5e7');
  box(plain, s.x1 - s.x0 + 0.6, 0.62, s.z1 - s.z0 + 0.6, s.cx, s.h + 0.3, s.cz, sf.roof);
  sign({ text: sf.sign.text, x: door.x + fn[0] * 0.8, y: 4.6, z: door.z + fn[1] * 0.8, ry: s.yaw, w: Math.min(s.fw * 0.8, 11), color: sf.sign.color, font: sf.sign.font });
  // Keep the interaction outside the new fascia and the building's original awning.
  s.street = { x: door.x + fn[0] * 1.6, z: door.z + fn[1] * 1.6 };
  return s;
}
