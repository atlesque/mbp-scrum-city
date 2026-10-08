// The army arrives in its own trucks, never in police cars; police cars still come at five stars, with officers only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emit } from '../../public/js/core/events.js';
import { G, P } from '../../public/js/core/state.js';
import { RIDES, WANTED, crewMix, footMix, pickRide } from '../../public/js/data/wanted.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import '../../public/js/game/rewards.js';
import { RESPONDERS, sendResponder } from '../../public/js/game/wanted.js';
import { VEHICLE_MODELS } from '../../public/js/vehicles/models/index.js';
import { answersHeat, lightsOn, sirenOn, spawnVehicle } from '../../public/js/vehicles/vehicle.js';

vi.mock('../../public/js/game/pickups.js', () => ({ reward() {}, dropCash() {}, dropItem() {}, dropWeapon() {} }));

const clear = () => { for (const e of all()) if (e.kind === 'vehicle' || e.kind === 'npc') removeEntity(e); };
afterEach(() => { clear(); G.wanted = 0; });
const soldiers = ['army', 'jugg'];

describe('who rides in what', () => {
  it('soldiers ride only in army trucks and never walk in; everyone else rides in police cars', () => {
    for (const t of soldiers) expect(RIDES[t]).toBe('army');
    for (let lvl = 1; lvl < WANTED.length; lvl++) {
      const L = WANTED[lvl];
      for (const [t] of crewMix(L.mix, 'police') || []) expect(soldiers).not.toContain(t);
      for (const [t] of footMix(L.mix) || []) expect(soldiers).not.toContain(t);
      for (const [t] of crewMix(L.mix, 'army') || []) expect(soldiers).toContain(t);
    }
  });
  it('at five stars both army trucks and police cars come', () => {
    const rides = new Set(); for (let r = 0.01; r < 1; r += 0.05) rides.add(pickRide(WANTED[5].mix, r));
    expect([...rides].sort()).toEqual(['army', 'police']);
    for (let lvl = 2; lvl < 5; lvl++) for (let r = 0.01; r < 1; r += 0.05) expect(pickRide(WANTED[lvl].mix, r)).toBe('police');
  });
  it('the army truck answers the heat like a cop car, with no siren or lights', () => {
    const M = VEHICLE_MODELS.army;
    expect(M.kind).toBe('truck'); expect(M.traffic.weight).toBe(0); expect(M.siren).toBeFalsy(); expect(M.police).toBeFalsy();
    P.x = 0; P.z = -150; G.wanted = 5; G.state = 'play';
    const t = spawnVehicle('army', -3, 25, 0, 'respond');
    expect(answersHeat(t)).toBe(true); expect(sirenOn(t)).toBe(false); expect(lightsOn(t)).toBe(false);
    expect(answersHeat(spawnVehicle('sedan', 3, 25, 0))).toBe(false);
  });
});

describe('arriving', () => {
  const arrive = (model, wanted) => {
    clear(); P.x = 0; P.z = 0; G.wanted = wanted; G.state = 'play';
    const c = spawnVehicle(model, -3, 30, Math.PI, 'parked');
    emit('police:arrived', { vehicle: c });
    return all('npc').filter(n => n.faction === 'law').map(n => n.type);
  };
  it('an army truck lets four soldiers out', () => {
    for (let i = 0; i < 10; i++) { const crew = arrive('army', 5); expect(crew).toHaveLength(4); for (const t of crew) expect(soldiers).toContain(t); }
  });
  it('a police car at five stars lets out agents, never soldiers', () => {
    for (let i = 0; i < 10; i++) { const crew = arrive('police', 5); expect(crew).toHaveLength(2); for (const t of crew) expect(soldiers).not.toContain(t); }
  });
});

describe('sending them', () => {
  it('keeps to a few on the way and makes room by clearing an empty one parked far off', () => {
    clear(); P.x = -3; P.z = 0; G.wanted = 5; G.state = 'play';
    const L = WANTED[5];
    expect(sendResponder(L)).toBeTruthy(); expect(sendResponder(L)).toBeTruthy();
    expect(sendResponder(L)).toBeNull(); // two on the way already
    for (const v of all('vehicle')) v.mode = 'parked';
    const far = spawnVehicle('police', -3, 120, 0, 'parked');
    for (let i = 0; i < RESPONDERS.max - 3; i++) spawnVehicle('army', 3, 10 + i * 10, 0, 'parked');
    expect(all('vehicle').filter(answersHeat)).toHaveLength(RESPONDERS.max);
    expect(sendResponder(L)).toBeTruthy();
    expect(far.removed).toBe(true);
  });
});
