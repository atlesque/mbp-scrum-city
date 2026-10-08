import { describe, expect, it } from 'vitest';
import { G, P, stats } from '../../public/js/core/state.js';
import { HINT_FOR, countPlayTime, hintShown } from '../../public/js/game/hint.js';

describe('controls hint', () => {
  it('shows for the first 10 minutes of play, then only when paused', () => {
    stats.played = 0; G.state = 'play'; P.vehicle = null;
    expect(hintShown()).toBe(true);
    for (let t = 0; t < HINT_FOR - 1; t += 0.05) countPlayTime(0.05);
    expect(hintShown()).toBe(true);
    for (let i = 0; i < 40; i++) countPlayTime(0.05);
    expect(stats.played).toBe(HINT_FOR); // stops counting, so the save stops changing
    expect(hintShown()).toBe(false);
    G.state = 'paused';
    expect(hintShown()).toBe(true);
  });
  it('makes way for the speedo while riding, except in the pause menu', () => {
    stats.played = 0; G.state = 'play'; P.vehicle = {};
    expect(hintShown()).toBe(false);
    G.state = 'paused';
    expect(hintShown()).toBe(true);
    P.vehicle = null;
  });
  it('counts from zero for saves made before play time was kept', () => {
    delete stats.played; G.state = 'play';
    expect(hintShown()).toBe(true);
    countPlayTime(1);
    expect(stats.played).toBe(1);
  });
});
