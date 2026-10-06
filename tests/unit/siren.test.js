import { afterEach, describe, expect, it } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { addEntity, removeEntity } from '../../public/js/entities/registry.js';
import { sirenVolume } from '../../public/js/game/wanted.js';

const added = [];
const car = (police, x = 0, z = 20) => added.push(addEntity({ kind: 'vehicle', model: { police }, x, z, dead: false })) && added.at(-1);

afterEach(() => { for (const e of added.splice(0)) removeEntity(e); G.wanted = 0; });

describe('police siren', () => {
  it('stays silent on the first star until a police car shows up', () => {
    P.x = 0; P.z = 0; G.wanted = 1;
    car(false);
    expect(sirenVolume()).toBe(0);
    car(true);
    expect(sirenVolume()).toBeGreaterThan(0);
  });
  it('follows the nearest police car', () => {
    P.x = 0; P.z = 0; G.wanted = 2;
    const far = car(true, 0, 90);
    const quiet = sirenVolume();
    car(true, 0, 10);
    expect(sirenVolume()).toBeGreaterThan(quiet);
    far.dead = true;
    expect(sirenVolume()).toBeGreaterThan(quiet);
  });
  it('goes quiet once the cars are wrecked or the heat is gone', () => {
    P.x = 0; P.z = 0; G.wanted = 1;
    const c = car(true);
    c.dead = true;
    expect(sirenVolume()).toBe(0);
    c.dead = false; G.wanted = 0;
    expect(sirenVolume()).toBe(0);
  });
});
