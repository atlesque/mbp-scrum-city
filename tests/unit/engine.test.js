// The bike engine should be quiet and only audible close by.
import { describe, expect, it } from 'vitest';
import { ENGINE_RANGE, engineFalloff } from '../../public/js/vehicles/engine.js';

describe('engine sound falloff', () => {
  it('is full volume on top of the bike and silent at the range', () => {
    expect(engineFalloff(0)).toBe(1);
    expect(engineFalloff(ENGINE_RANGE)).toBe(0);
    expect(engineFalloff(ENGINE_RANGE + 10)).toBe(0);
  });
  it('drops off steeply with distance', () => {
    expect(engineFalloff(ENGINE_RANGE / 4)).toBeLessThan(0.5);
    expect(engineFalloff(ENGINE_RANGE / 2)).toBeLessThan(0.2);
  });
});

describe('passing bike engines', async () => {
  const { G, P } = await import('../../public/js/core/state.js');
  const { addEntity, removeEntity } = await import('../../public/js/entities/registry.js');
  const { engineSources } = await import('../../public/js/vehicles/engine.js');
  it('play from every ridden bike in traffic, not from the player\'s own ride', () => {
    G.state = 'play';
    const bike = (x, z) => addEntity({ kind: 'vehicle', K: { ambientEngine: true }, model: {}, driver: {}, x, z, v: 10, dead: false });
    const a = bike(5, 0), b = bike(-5, 3), mine = bike(0, 0);
    P.vehicle = mine;
    const s = engineSources();
    expect(s.map(e => e.key)).toEqual([a, b]);
    expect(s[0].rpm).toBeGreaterThan(2000);
    P.vehicle = null; G.state = 'loading';
    for (const e of [a, b, mine]) removeEntity(e);
  });
});

describe('electric cars', async () => {
  const { evMix, evSources, HUM_TOP, HUM_FADE } = await import('../../public/js/vehicles/engine.js');
  const { VEHICLE_MODELS } = await import('../../public/js/vehicles/models/index.js');
  const ms = kmh => kmh / 3.6;
  it('hum below 30 km/h and fall silent at it', () => {
    expect(evMix(0).hum).toBeGreaterThan(0);
    expect(evMix(ms(15)).hum).toBe(1);
    expect(evMix(ms((HUM_FADE + HUM_TOP) / 2)).hum).toBeCloseTo(0.5);
    expect(evMix(ms(HUM_TOP)).hum).toBe(0);
    expect(evMix(ms(90)).hum).toBe(0);
  });
  it('have road noise that grows with speed', () => {
    expect(evMix(0).road).toBe(0);
    expect(evMix(ms(60)).road).toBeGreaterThan(evMix(ms(30)).road);
    expect(evMix(ms(120)).road).toBeGreaterThan(evMix(ms(60)).road);
    expect(evMix(-ms(60)).road).toBe(evMix(ms(60)).road);
  });
  it('is the EQA and the e-steps', () => {
    expect(Object.values(VEHICLE_MODELS).filter(m => m.electric).map(m => m.id)).toEqual(['estep', 'sharestep', 'eqa']);
  });
  it('play from electric cars in traffic, not from combustion ones', async () => {
    const { G, P } = await import('../../public/js/core/state.js');
    const { addEntity, removeEntity } = await import('../../public/js/entities/registry.js');
    G.state = 'play';
    const car = (model, x) => addEntity({ kind: 'vehicle', K: {}, model, driver: {}, x, z: 0, v: ms(20), dead: false });
    const eqa = car(VEHICLE_MODELS.eqa, 4), bmw = car(VEHICLE_MODELS.bmw5, -4);
    const s = evSources();
    expect(s.map(e => e.key)).toEqual([eqa]);
    expect(s[0].hum).toBe(1);
    G.state = 'loading';
    for (const e of [eqa, bmw]) removeEntity(e);
  });
});
