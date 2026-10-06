import { describe, expect, it, vi } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { WBY, wStat } from '../../public/js/data/weapons.js';
import { HELI_HP, removeHeli, spawnHeli } from '../../public/js/vehicles/heli.js';
import { tallBoxes } from '../../public/js/world/collision.js';

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
});
