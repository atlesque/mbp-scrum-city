import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELOAD_ANIMS, reloadPose } from '../../public/js/characters/reload.js';
import { RELOADS, reloadOf } from '../../public/js/data/reloads.js';
import { WEAPONS } from '../../public/js/data/weapons.js';

const sfx = name => new URL(`../../public/sfx/${name}.mp3`, import.meta.url);

describe('reloads', () => {
  it('gives every gun a reload move and a sound file', () => {
    for (const w of WEAPONS.filter(w => w.mag)) {
      expect(RELOADS[w.id], `${w.id} has no line in RELOADS`).toBeTruthy();
      expect(RELOAD_ANIMS[RELOADS[w.id].anim], `${w.id}: unknown move`).toBeTruthy();
      expect(existsSync(sfx(RELOADS[w.id].sound)), `${w.id}: missing sound file`).toBe(true);
    }
  });
  it('only names guns that exist', () => {
    for (const id of Object.keys(RELOADS)) expect(WEAPONS.some(w => w.id === id), id).toBe(true);
  });
  it('keeps each move in time order from 0 to 1', () => {
    for (const [name, keys] of Object.entries(RELOAD_ANIMS)) {
      expect(keys[0][0], name).toBe(0); expect(keys.at(-1)[0], name).toBe(1);
      for (let i = 1; i < keys.length; i++) expect(keys[i][0], name).toBeGreaterThan(keys[i - 1][0]);
      for (const k of keys) expect(k.length, name).toBe(6);
    }
  });
  it('hits each keyframe and blends between them', () => {
    const k = RELOAD_ANIMS.mag;
    expect(reloadPose('mag', k[2][0]).lx).toBeCloseTo(k[2][3]);
    const mid = reloadPose('mag', (k[2][0] + k[3][0]) / 2).lx;
    expect(mid).toBeGreaterThan(Math.min(k[2][3], k[3][3])); expect(mid).toBeLessThan(Math.max(k[2][3], k[3][3]));
  });
  it('falls back to the magazine move and the synthesized click for a gun without a line', () => {
    expect(reloadOf('nope')).toEqual({ anim: 'mag', sound: null });
  });
});
