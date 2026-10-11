import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { G, P, inv, stats } from '../../public/js/core/state.js';
import { emit } from '../../public/js/core/events.js';
import { updateInteraction } from '../../public/js/game/interact.js';
import { entities, addEntity } from '../../public/js/entities/registry.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { COURIER, GARAGE, courierJob, startCourier, cancelCourier, updateCourier, useGarage, garageReason, serviceInteraction, repaintCar } from '../../public/js/game/city-services.js';

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  cancelCourier(); entities.clear();
  Object.assign(G, { state: 'play', wanted: 0, heat: 0, lostT: 0, time: 0, waypoint: { x: 9, z: 9 } });
  Object.assign(P, { alive: true, vehicle: null, y: 0, club: null, x: COURIER.x, z: COURIER.z });
  inv.money = 1000; stats.earned = 0;
});
function car(model = 'sedan') {
  const v = spawnVehicle(model, P.x, P.z, 0); v.driver = P; P.vehicle = v; return v;
}
function arrive() { const s = courierJob().stops[courierJob().stop]; P.x = P.vehicle.x = s.x; P.z = P.vehicle.z = s.z; P.vehicle.v = 0; updateCourier(0.1); }

describe('courier driving jobs', () => {
  it('requires a civilian car or motorcycle and no wanted level', () => {
    expect(startCourier()).toBe(false);
    car('police'); expect(startCourier()).toBe(false);
    car(); G.wanted = 1; expect(startCourier()).toBe(false);
    G.wanted = 0; expect(startCourier()).toBe(true); expect(startCourier()).toBe(false);
  });
  it('requires stopping at each destination in the original vehicle, pays once and preserves the manual waypoint', () => {
    const v = car(); expect(startCourier()).toBe(true);
    const s = courierJob().stops[0]; P.x = s.x; P.z = s.z; v.v = 10;
    updateCourier(1); expect(courierJob().stop).toBe(0);
    arrive(); expect(courierJob().stop).toBe(1);
    arrive(); arrive();
    expect(courierJob()).toBeNull(); expect(inv.money).toBeGreaterThan(1000); expect(stats.earned).toBe(inv.money - 1000);
    const paid = inv.money; updateCourier(1); expect(inv.money).toBe(paid);
    expect(G.waypoint).toEqual({ x: 9, z: 9 });
  });
  it('does not tick while paused and fails on timeout or wreck without paying', () => {
    const v = car(); startCourier(); const time = courierJob().left;
    G.state = 'paused'; updateCourier(50); expect(courierJob().left).toBe(time);
    G.state = 'play'; updateCourier(time + 1); expect(courierJob()).toBeNull(); expect(inv.money).toBe(1000);
    startCourier(); v.dead = true; updateCourier(0.1); expect(courierJob()).toBeNull(); expect(inv.money).toBe(1000);
  });
  it('cancels on death and rejects switching vehicles at a delivery stop', () => {
    car(); startCourier(); const s = courierJob().stops[0];
    P.x = s.x; P.z = s.z; car(); updateCourier(0.1); expect(courierJob().stop).toBe(0);
    emit('player:died', {}); expect(courierJob()).toBeNull();
  });
  it('keeps damage penalties even if the car is repaired before the finish', () => {
    const v = car(); startCourier(); v.hp = v.model.hp / 2; updateCourier(1); v.hp = v.model.hp;
    arrive(); arrive(); arrive(); const damagedPay = inv.money - 1000;
    inv.money = 1000; P.x = COURIER.x; P.z = COURIER.z; startCourier(); arrive(); arrive(); arrive();
    expect(inv.money - 1000).toBeGreaterThan(damagedPay);
  });
});

describe('respray garage', () => {
  function park(model) { P.x = GARAGE.x; P.z = GARAGE.z; return car(model); }
  it('charges once, repairs and repaints only that car, and ends an unseen low-star pursuit', () => {
    const v = park('modelyblue'), other = spawnVehicle('modelyblue', 0, 0, 0);
    const before = Array.from(other.mesh.m.geometry.attributes.color.array);
    v.hp = 20; G.wanted = 3; G.heat = 30; G.lostT = 4;
    expect(useGarage()).toBe(true); expect(inv.money).toBe(1000 - GARAGE.price); expect(v.hp).toBe(v.model.hp);
    expect(G.wanted).toBe(0); expect(G.heat).toBe(0);
    expect(Array.from(other.mesh.m.geometry.attributes.color.array)).toEqual(before);
    expect(Array.from(v.mesh.m.geometry.attributes.color.array)).not.toEqual(before);
    expect(useGarage()).toBe(false);
  });
  it('refuses insufficient funds, pursuit in sight, high stars, speed, fire and emergency vehicles without charging', () => {
    const v = park(); G.wanted = 2; G.lostT = 0; expect(useGarage()).toBe(false);
    G.lostT = 4; G.wanted = 4; expect(useGarage()).toBe(false);
    G.wanted = 0; v.v = 4; expect(useGarage()).toBe(false);
    v.v = 0; v.burnT = 3; expect(useGarage()).toBe(false);
    v.burnT = 0; inv.money = 0; expect(useGarage()).toBe(false);
    inv.money = 1000; park('police'); expect(useGarage()).toBe(false); expect(inv.money).toBe(1000);
    expect(garageReason()).toMatch(/civilian/i);
  });
});


describe('service integration boundaries', () => {
  it('lets mounted services take E while F still exits and ordinary doors remain unavailable', () => {
    const prompt = { hidden: true, innerHTML: '' }; vi.stubGlobal('document', { getElementById: () => prompt });
    car();
    addEntity({ inVehicle: true, interaction: p => serviceInteraction('courier', p) });
    addEntity({ interaction: () => ({ keys: ['use'], priority: 100, dist: 0, prompt: 'ordinary door' }) });
    updateInteraction();
    expect(G.near.find(i => i.keys.includes('use')).prompt).toContain('Neon Express');
    expect(G.near.find(i => i.keys.includes('ride')).priority).toBe(9);
    expect(G.near).toHaveLength(2);
  });
  it('repaints all civilian car bodies twice without altering trim or shared source geometry', () => {
    for (const id of ['sedan', 'modely', 'modelyblue', 'eqa', 'bmw5']) {
      const v = car(id), original = v.mesh.m.geometry, source = original.attributes.color;
      const first = [source.getX(0), source.getY(0), source.getZ(0)];
      let painted = 0;
      repaintCar(v); repaintCar(v);
      const changed = v.mesh.m.geometry.attributes.color;
      for (let i = 0; i < source.count; i++) {
        const isPaint = Math.abs(source.getX(i) - first[0]) + Math.abs(source.getY(i) - first[1]) + Math.abs(source.getZ(i) - first[2]) < 0.001;
        if (isPaint) { painted++; expect(changed.getX(i), id).not.toBe(source.getX(i)); }
        else expect([changed.getX(i), changed.getY(i), changed.getZ(i)], id).toEqual([source.getX(i), source.getY(i), source.getZ(i)]);
      }
      expect(painted, id).toBeGreaterThan(source.count / 10);
      expect(v.mesh.m.geometry).not.toBe(original);
    }
  });
  it('refuses a currently visible officer even between frames when seenNow has reset', () => {
    P.x = GARAGE.x; P.z = GARAGE.z; car(); G.wanted = 2; G.lostT = 5; G.seenNow = false;
    addEntity({ kind: 'npc', faction: 'law', alive: true, los: true, x: GARAGE.x + 10, z: GARAGE.z });
    expect(useGarage()).toBe(false); expect(inv.money).toBe(1000);
  });
});
