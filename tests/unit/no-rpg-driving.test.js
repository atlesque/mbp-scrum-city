import { describe, expect, it } from 'vitest';
import { firesFrom, WBY } from '../../public/js/data/weapons.js';

describe('rocket launcher in vehicles', () => {
  const car = { kind: 'car' };
  it('will not fire from a vehicle', () => expect(firesFrom(WBY.rpg, car)).toBe(false));
  it('fires on foot', () => expect(firesFrom(WBY.rpg, null)).toBe(true));
  it('leaves the other guns free for drive-bys', () => {
    for (const id of ['pistol', 'smg', 'shotgun', 'rifle', 'minigun', 'sniper']) if (WBY[id]) expect(firesFrom(WBY[id], car)).toBe(true);
  });
});
