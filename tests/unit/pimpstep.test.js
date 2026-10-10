// The pimped e-step (models/pimpstep.js) and the one guy who rides it (NPC type 'stepking').
import { describe, expect, it } from 'vitest';
import { NPC_TYPES, makeLook } from '../../public/js/npcs/types.js';
import { POPULATION } from '../../public/js/game/population.js';
import { arcadeDrive } from '../../public/js/vehicles/drive.js';
import { VEHICLE_MODELS, pickTrafficModel } from '../../public/js/vehicles/models/index.js';
import { KINDS } from '../../public/js/vehicles/vehicle.js';

const M = VEHICLE_MODELS.pimpstep, K = KINDS.step;
const kmh = v => v * 3.6;
const H = () => Object.assign({}, K.handling, M.handling);

describe('the pimped e-step', () => {
  it('is an electric step that never turns up in random traffic', () => {
    expect(M.kind).toBe('step'); expect(M.electric).toBe(true); expect(M.traffic.weight).toBe(0);
    for (let i = 0; i < 200; i++) expect(pickTrafficModel('step').id).not.toBe('pimpstep');
  });
  it('reaches 90 km/h, and gets there sooner in sport mode', () => {
    const time = boost => {
      const v = { H: H(), x: 0, z: 0, yaw: 0, v: 0, steer: 0 };
      let t = 0; while (kmh(v.v) < 90 && t < 30) { arcadeDrive(v, 1 / 30, { throttle: true, boost, steer: 0 }, M.spec.wb); t += 1 / 30; }
      return { t, top: v };
    };
    const plain = time(false), sport = time(true);
    expect(plain.t).toBeLessThan(12); expect(sport.t).toBeLessThan(plain.t);
    // and no further: flat out a while longer it stays under 93
    const v = plain.top; for (let i = 0; i < 900; i++) arcadeDrive(v, 1 / 30, { throttle: true, boost: true, steer: 0 }, M.spec.wb);
    expect(kmh(v.v)).toBeLessThan(93);
  });
  it('says 90 km/h when the player gets on, and a plain step still says 25', () => {
    expect(K.tip(M)).toMatch(/90 km\/h/);
    expect(K.tip(VEHICLE_MODELS.estep)).toMatch(/25 km\/h/);
  });
  it('turns gentler than a plain step at speed, so it can be ridden flat out', () => {
    expect(M.handling.turnHigh).toBeLessThan(K.handling.turnHigh);
    const v = { H: H(), x: 0, z: 0, yaw: 0, v: 25, steer: 0 };
    for (let i = 0; i < 30; i++) arcadeDrive(v, 1 / 30, { throttle: true, steer: 1 }, M.spec.wb);
    expect(Math.abs(v.yawRate * v.v)).toBeLessThan(40); // sideways pull at full lock, m/s²
  });
  it('bails out with the full roll at speed, unlike a plain step\'s hop off', () => {
    expect(VEHICLE_MODELS.estep.hopOff).toBe(true); expect(M.hopOff).toBeFalsy();
  });
  it('builds a step rig with a seat to stand on', () => {
    const mesh = K.build({ model: M });
    expect(mesh.wheels).toHaveLength(2); expect(mesh.lit).toHaveLength(2);
    expect(mesh.seat.position.y).toBeGreaterThan(0.1);
  });
});

describe('the step king', () => {
  it('rides, carries a fat roll, and has an afro, a beard and a gold chain', () => {
    const T = NPC_TYPES.stepking;
    expect(T.behaviour).toBe('ride'); expect(T.faction).toBe('civilian');
    expect(T.cash[0]).toBeGreaterThan(NPC_TYPES.stepper.cash[1]);
    const L = makeLook(T);
    expect(L.hairStyle).toBe('bigafro'); expect(L.beard).toBe(true); expect(L.chain).toBeTruthy(); expect(L.hat).toBeUndefined();
  });
  it('one is always about, on the pimped step', () => {
    const row = POPULATION.find(r => r.id === 'stepking');
    expect(row.target()).toBe(1);
    const on = (id, driver) => ({ kind: 'vehicle', model: VEHICLE_MODELS[id], driver });
    expect(row.counts(on('pimpstep', { kind: 'npc' }))).toBe(true);
    expect(row.counts(on('pimpstep', { kind: 'player' }))).toBeFalsy();
    expect(row.counts(on('estep', { kind: 'npc' }))).toBe(false);
  });
});
