// Vehicles soak up gunfire, but a rocket or a grenade still wrecks them in one.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { WBY } from '../../public/js/data/weapons.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { ROCKET_BLAST_R } from '../../public/js/combat/combat.js';
import { spawnTruck } from '../../public/js/vehicles/firetruck.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { VEHICLE_MODELS } from '../../public/js/vehicles/models/index.js';

vi.mock('../../public/js/game/pickups.js', () => ({ reward() {}, dropCash() {}, dropItem() {}, dropWeapon() {} }));

const clear = () => { for (const e of all()) if (e.kind === 'vehicle' || e.kind === 'firetruck' || e.kind === 'npc') removeEntity(e); };
afterEach(clear);
function parked(id) { clear(); P.x = 0; P.z = -150; P.alive = true; P.vehicle = null; G.state = 'play'; return spawnVehicle(id, -3, 25, 0); }
const at = v => ({ p: new THREE.Vector3(v.x, 1, v.z) });
const shotsToBurn = (v, dmg) => { let n = 0; while (!(v.burnT > 0) && n < 1000) { v.onShot(at(v), dmg, null); n++; } return n; };

describe('vehicle toughness', () => {
  it('guns take about three times as many bullets as before', () => {
    const v = parked('sedan'), was = Math.ceil(v.hp / WBY.pistol.dmg);
    expect(shotsToBurn(v, WBY.pistol.dmg)).toBeGreaterThanOrEqual(was * 3 - 1);
    expect(shotsToBurn(parked('sedan'), WBY.rifle.dmg)).toBeGreaterThanOrEqual(10);
  });
  it('a grenade landing next to any car or the drivable fire truck sets it off', () => {
    const g = WBY.grenade;
    // bikes need a real canvas for their decals; they take the same blast() as cars
    for (const id of Object.keys(VEHICLE_MODELS).filter(id => VEHICLE_MODELS[id].kind !== 'bike')) {
      const v = parked(id); v.blast(v.x + g.blast * 0.45, 1, v.z, g.blast, g.dmg, true, true);
      expect(v.burnT, id).toBeGreaterThan(0);
    }
  });
  it('a rocket going off near a car sets it off', () => {
    const v = parked('bmw5'); v.blast(v.x + ROCKET_BLAST_R * 0.45, 1, v.z, ROCKET_BLAST_R, WBY.rpg.dmg, true, true);
    expect(v.burnT).toBeGreaterThan(0);
  });
  it('a car going up alongside is not ordnance: the far edge of its blast only dents', () => {
    const v = parked('sedan'); v.blast(v.x + 8, 1, v.z, 9, 240, false);
    expect(v.burnT || 0).toBe(0); expect(v.hp).toBeLessThan(v.model.hp);
  });
  it('the fire truck goes up from one grenade or rocket, but shrugs off a magazine', () => {
    clear(); P.x = 0; P.z = -150;
    const t = spawnTruck(0, 40, { x: 0, z: 80 });
    for (let i = 0; i < 30; i++) t.onShot(at(t), WBY.rifle.dmg);
    expect(t.dead).toBe(false);
    t.blast(t.x + 3, 1, t.z, WBY.grenade.blast, WBY.grenade.dmg, true, true);
    expect(t.dead).toBe(true);
    const r = spawnTruck(0, 40, { x: 0, z: 80 }); r.onRocket(WBY.rpg.dmg); expect(r.dead).toBe(true);
  });
});
