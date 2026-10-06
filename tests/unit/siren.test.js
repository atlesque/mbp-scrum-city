import { afterEach, describe, expect, it } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { addEntity, removeEntity } from '../../public/js/entities/registry.js';
import { sirenMix } from '../../public/js/game/wanted.js';

const added = [];
const car = (police, x = 0, z = 20) => added.push(addEntity({ kind: 'vehicle', model: { police }, x, z, dead: false })) && added.at(-1);

afterEach(() => { for (const e of added.splice(0)) removeEntity(e); G.wanted = 0; });

describe('police siren', () => {
  it('stays silent on the first star until a police car shows up', () => {
    P.x = 0; P.z = 0; G.wanted = 1;
    car(false);
    expect(sirenMix().v).toBe(0);
    car(true);
    expect(sirenMix().v).toBeGreaterThan(0);
  });
  it('follows the nearest police car', () => {
    P.x = 0; P.z = 0; G.wanted = 2;
    const far = car(true, 0, 90);
    const quiet = sirenMix().v;
    car(true, 0, 10);
    expect(sirenMix().v).toBeGreaterThan(quiet);
    far.dead = true;
    expect(sirenMix().v).toBeGreaterThan(quiet);
  });
  it('goes quiet once the cars are wrecked or the heat is gone', () => {
    P.x = 0; P.z = 0; G.wanted = 1;
    const c = car(true);
    c.dead = true;
    expect(sirenMix().v).toBe(0);
    c.dead = false; G.wanted = 0;
    expect(sirenMix().v).toBe(0);
  });
});
