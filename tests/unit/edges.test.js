import { describe, expect, it } from 'vitest';
import { keepOnGrid } from '../../public/js/vehicles/drive.js';
import { laneFor } from '../../public/js/vehicles/traffic.js';
import { W } from '../../public/js/world/collision.js';
import { FACE } from '../../public/js/world/edges.js';

const LANES = new Set([-203, -197, -153, -147, -103, -97, -53, -47, -3, 3, 47, 53, 97, 103, 147, 153, 197, 203]);

describe('map edges', () => {
  it('keeps the play area inside the walls', () => {
    expect(W.minX).toBeGreaterThan(-FACE); expect(W.minZ).toBeGreaterThan(-FACE); expect(W.maxZ).toBeLessThan(FACE);
  });
  it('turns traffic along the ring road instead of off the map', () => {
    const roads = [-150, -100, -50, 0, 50, 100, 150, 200];
    let onRing = 0, backInTown = 0, off = 0, offLane = 0;
    for (let n = 0; n < 48; n++) {
      const vertical = n % 2 === 0, road = roads[n % roads.length], s = n % 4 < 2 ? 1 : -1, dx = vertical ? 0 : s, dz = vertical ? s : 0, L = laneFor(road, dx, dz);
      const v = { x: vertical ? L.x : (n * 37) % 380 - 190, z: vertical ? (n * 53) % 380 - 190 : L.z, dirX: dx, dirZ: dz, v: 12 };
      let wasRing = false;
      for (let i = 0; i < 2000; i++) {
        const dt = 0.05; v.x += v.dirX * v.v * dt; v.z += v.dirZ * v.v * dt; keepOnGrid(v, dt);
        if (Math.abs(v.x) > 203 || Math.abs(v.z) > 203) off++;
        if (!LANES.has(Math.round(v.dirX ? v.z : v.x))) offLane++; // always in a lane across the way it drives
        const ring = Math.abs(v.dirX ? v.z : v.x) > 196;
        if (ring) onRing++; else if (wasRing) backInTown++;
        wasRing = ring;
      }
    }
    expect(off).toBe(0); expect(offLane).toBe(0);
    expect(onRing).toBeGreaterThan(0); expect(backInTown).toBeGreaterThan(0);
  });
});
