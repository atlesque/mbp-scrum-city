// Every police car out hunting you is its own siren, played from that car.
import { afterEach, describe, expect, it } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { addEntity, removeEntity } from '../../public/js/entities/registry.js';
import { rotorSources, sirenSources } from '../../public/js/game/wanted.js';
import { lightsOn, toggleSiren } from '../../public/js/vehicles/vehicle.js';

const added = [];
const add = e => (added.push(addEntity(e)), added.at(-1));
const car = (police, x = 0, z = 20) => add({ kind: 'vehicle', model: { police }, x, z, dead: false });

afterEach(() => { for (const e of added.splice(0)) removeEntity(e); G.wanted = 0; G.state = 'loading'; P.vehicle = null; });

describe('police siren', () => {
  it('stays silent on the first star until a police car shows up', () => {
    P.x = 0; P.z = 0; G.wanted = 1; G.state = 'play';
    car(false);
    expect(sirenSources()).toEqual([]);
    car(true);
    expect(sirenSources()).toHaveLength(1);
  });
  it('plays one siren per police car, each from where that car is', () => {
    P.x = 0; P.z = 0; G.wanted = 2; G.state = 'play';
    const a = car(true, 30, 0), b = car(true, -10, 40);
    const s = sirenSources();
    expect(s.map(x => x.key)).toEqual([a, b]);
    expect(s.map(x => [x.x, x.z])).toEqual([[30, 0], [-10, 40]]);
    expect(s[0].y).toBeGreaterThan(0);
  });
  it('goes quiet once the cars are wrecked, the heat is gone or the game is paused', () => {
    P.x = 0; P.z = 0; G.wanted = 1; G.state = 'play';
    const c = car(true);
    c.dead = true;
    expect(sirenSources()).toEqual([]);
    c.dead = false; G.state = 'paused';
    expect(sirenSources()).toEqual([]);
    G.state = 'play'; G.wanted = 0;
    expect(sirenSources()).toEqual([]);
  });
});

describe('siren switch', () => {
  const drive = (model) => { const c = add({ kind: 'vehicle', model, x: 0, z: 0, dead: false }); P.vehicle = c; return c; };
  it('turns a police car\'s siren and lights on and off at the wheel, with or without stars', () => {
    P.x = 0; P.z = 0; G.wanted = 0; G.state = 'play';
    const c = drive({ police: true, siren: true });
    expect(toggleSiren()).toBe(true);
    expect(sirenSources().map(s => s.key)).toEqual([c]); expect(lightsOn(c)).toBe(true);
    G.wanted = 3; toggleSiren();
    expect(sirenSources()).toEqual([]); expect(lightsOn(c)).toBe(false);
  });
  it('keeps going after the player gets out, and plays up on the fire truck\'s roof', () => {
    P.x = 0; P.z = 0; G.state = 'play';
    const t = drive({ siren: true, sirenY: 3 });
    expect(lightsOn(t)).toBe(false); expect(sirenSources()).toEqual([]);
    toggleSiren(); P.vehicle = null;
    const [s] = sirenSources();
    expect(s.key).toBe(t); expect(s.y).toBeGreaterThan(2.5);
  });
  it('does nothing in a car without one, or on foot', () => {
    G.state = 'play';
    drive({}); expect(toggleSiren()).toBe(false);
    P.vehicle = null; expect(toggleSiren()).toBe(false);
  });
});

describe('chopper rotor', () => {
  it('plays from the chopper, up in the air', () => {
    G.state = 'play';
    const h = add({ kind: 'heli', x: 12, y: 30, z: -8 });
    const [r] = rotorSources();
    expect(r.key).toBe(h);
    expect([r.x, r.z]).toEqual([12, -8]);
    expect(r.y).toBeGreaterThan(29);
  });
});
