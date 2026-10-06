import { describe, expect, it, vi } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { WBY, wStat } from '../../public/js/data/weapons.js';
import { spawnNpc } from '../../public/js/npcs/npc.js';
import { HELI_HP, aimLight, removeHeli, searchlightShade, spawnHeli } from '../../public/js/vehicles/heli.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { addCollider, colliders, tallBoxes } from '../../public/js/world/collision.js';

vi.mock('../../public/js/game/pickups.js', () => ({ reward() {} }));

function chopper() {
  removeHeli(); P.x = 0; P.z = 0; spawnHeli();
  const h = G.heli; h.x = 0; h.y = 28; h.z = 26; h.yaw = 0; h.ang = Math.PI / 2; // circling from +z
  return h;
}
// a ray from where the player stands towards a point
function ray(tx, ty, tz) {
  const o = new THREE.Vector3(0, 1.6, 0), d = new THREE.Vector3(tx, ty - 1.6, tz).normalize();
  return [o, d];
}

describe('police helicopter', () => {
  it('goes down to a magazine or two of rifle fire', () => {
    const h = chopper(), dmg = wStat(WBY.rifle, 0).dmg;
    let hits = 0;
    while (!h.falling && hits < 100) { h.onShot({}, dmg); hits++; }
    expect(h.falling).toBe(true);
    expect(hits).toBeLessThanOrEqual(30);
  });
  it('goes down to one direct rocket', () => {
    const h = chopper(), dmg = wStat(WBY.rpg, 0).dmg;
    h.onRocket(dmg); h.blast(h.x, h.y, h.z, 7, dmg, true);
    expect(h.falling).toBe(true);
  });
  it('can be hit on the cabin, the tail and the rotor', () => {
    const h = chopper();
    expect(h.raycast(...ray(0, 28, 26), 200)).not.toBeNull();
    // tail boom, seen side-on from a rooftop (yaw 0 points the nose at +z)
    expect(h.raycast(new THREE.Vector3(20, 29, 26 - 4.4), new THREE.Vector3(-1, 0, 0), 200)).not.toBeNull();
    expect(h.raycast(...ray(3.8, 29, 26), 200)).not.toBeNull(); // rotor tip
    expect(h.raycast(...ray(8, 28, 26), 200)).toBeNull();
  });
  it('crashes and clears away once it hits the ground', () => {
    const h = chopper();
    h.damage(HELI_HP);
    expect(h.raycast(...ray(0, 28, 26), 200)).toBeNull();
    for (let i = 0; i < 200 && G.heli; i++) h.update(0.05);
    expect(G.heli).toBeNull();
    expect(h.removed).toBe(true);
  });
  it('wrecks the cars and drops the people it crashes among, like a vehicle explosion', () => {
    const h = chopper();
    const car = spawnVehicle('sedan', 6, 26, 0), far = spawnVehicle('sedan', 30, 26, 0);
    const npc = spawnNpc('civilian', -8, 26), body = spawnNpc('civilian', 2, 28); body.kill(null, false);
    h.damage(HELI_HP);
    for (let i = 0; i < 200 && G.heli; i++) h.update(0.05);
    expect(car.burnT > 0 || car.dead).toBe(true);
    expect(npc.alive).toBe(false);
    expect(body.y > 0 || body.vy > 0).toBe(true); // thrown
    expect(far.hp).toBe(far.model.hp);
  });
  it('holds fire until it has seen the player for a moment', () => {
    const h = chopper(); G.wanted = 5; P.alive = true; h.fireT = 0;
    h.update(0.01);
    expect(h.burst).toBe(0);
    for (let i = 0; i < 30 && h.burst === 0; i++) h.update(0.01);
    expect(h.burst).toBeGreaterThan(0);
  });
  it('never opens up through a building', () => {
    const h = chopper(); G.wanted = 5; P.alive = true; h.fireT = 0;
    const wall = { x0: -20, x1: 20, z0: 4, z1: 6, h: 200 }; tallBoxes.push(wall);
    try {
      for (let i = 0; i < 100; i++) { h.update(0.02); expect(h.burst).toBe(0); }
    } finally { tallBoxes.splice(tallBoxes.indexOf(wall), 1); G.wanted = 0; }
  });
  it('shines its searchlight down to the street when nothing is in the way', () => {
    const h = chopper(); h.grp.position.set(h.x, h.y, h.z);
    const t = aimLight(h);
    expect(t).toBeCloseTo(Math.hypot(26, 27.2), 3);
    expect(h.spot.position.y).toBeCloseTo(0.05, 3);
  });
  it('stops its searchlight at a building between it and the player', () => {
    const h = chopper(); h.grp.position.set(h.x, h.y, h.z);
    // a tower block between the chopper (z 26) and the player (z 0)
    addCollider(-10, 10, 10, 16, 40, true);
    try {
      const t = aimLight(h);
      expect(t).toBeLessThan(Math.hypot(26, 27.2) * 0.5);
      // the spot lands on the tower's far wall, facing the chopper
      expect(h.spot.position.z).toBeCloseTo(16.05, 2);
      expect(h.spot.position.y).toBeGreaterThan(5);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(h.spot.quaternion);
      expect(n.z).toBeCloseTo(1, 5);
      // the beam ends at the wall too
      expect(h.beam.scale.y).toBeCloseTo(t, 5);
    } finally { colliders.pop(); tallBoxes.pop(); }
  });
  it('lets the buildings either side of an alley shadow the searchlight cone', () => {
    const h = chopper(); h.grp.position.set(h.x, h.y, h.z);
    // an alley 3 m wide running from the player towards the chopper: the line down the middle is clear,
    // but the cone is wider than the alley, so both walls must cut it
    addCollider(-12, -1.5, -5, 40, 30, true); addCollider(1.5, 12, -5, 40, 30, true);
    try {
      expect(aimLight(h)).toBeCloseTo(Math.hypot(26, 27.2), 3);
      expect(searchlightShade.nBox.value).toBe(2);
      expect(searchlightShade.origin.value.y).toBeCloseTo(27.2, 3);
    } finally { colliders.splice(-2); tallBoxes.splice(-2); }
  });
});
