import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_SHOT_FILES, SHOTS, shotFiles } from '../../public/js/data/shots.js';
import { WEAPONS } from '../../public/js/data/weapons.js';

const sfx = name => new URL(`../../public/sfx/${name}.mp3`, import.meta.url);

describe('gunshots', () => {
  it('gives every gun and the tank cannon a recorded shot', () => {
    for (const w of WEAPONS.filter(w => !w.melee && !w.thrown)) expect(SHOTS[w.id], `${w.id} has no line in SHOTS`).toBeTruthy();
    expect(SHOTS.cannon).toBeTruthy();
  });
  it('has a file for every take', () => {
    for (const [id, s] of Object.entries(SHOTS)) {
      expect(s.takes, id).toBeGreaterThan(0); expect(s.vol, id).toBeGreaterThan(0);
      for (const f of shotFiles(id)) expect(existsSync(sfx(f)), `${f}.mp3 is missing`).toBe(true);
    }
    expect(ALL_SHOT_FILES.length).toBe(Object.values(SHOTS).reduce((n, s) => n + s.takes, 0));
  });
  it('names no takes for a gun without recordings', () => {
    expect(shotFiles('nope')).toEqual([]);
  });
});
