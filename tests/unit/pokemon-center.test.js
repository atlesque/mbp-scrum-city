import { expect, it } from 'vitest';
import { pickCenterSite } from '../../public/js/world/pokemon-center.js';
const building = (x, face = 'n') => ({ x0: x, x1: x + 14, z0: 20, z1: 34, h: 12, face });
it('chooses randomly among ordinary buildings, excluding rooftop entrances and the club', () => {
  const a = building(0), b = building(50), c = building(100), d = building(150, 'e');
  const sites = [a, b, c, d];
  const first = pickCenterSite(sites, [a], b, () => 0);
  const last = pickCenterSite(sites, [a], b, () => 0.999);
  expect(first.x0).toBe(c.x0);
  expect(last.x0).toBe(d.x0);
  expect(last.street.x).toBeGreaterThan(d.x1);
  expect(last.street.z).toBe((d.z0 + d.z1) / 2);
});
it('keeps the random selection stable across reloads and handles no suitable site', () => {
  const sites = [building(0), building(50)];
  expect(pickCenterSite(sites, [], null)).toEqual(pickCenterSite(sites, [], null));
  expect(pickCenterSite([], [], null)).toBeNull();
});
