// Sounds with a source in the world are heard from that source: the listener faces the camera, and loudness
// follows the inverse distance law out to each kind of sound's range.
import { describe, expect, it } from 'vitest';
import { P, cam } from '../../public/js/core/state.js';
import { AIR_FAR, AIR_NEAR, HEAR, airCutoff, beside, doppler, falloff, listenerPose, rightEar } from '../../public/js/core/spatial.js';

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('listener', () => {
  it('sits at the player\'s head and faces where the camera looks', () => {
    P.x = 5; P.z = -3; P.y = 0; cam.yaw = 0; cam.pitch = 0;
    const L = listenerPose();
    expect([L.x, L.z]).toEqual([5, -3]);
    expect(L.y).toBeGreaterThan(1);
    expect([L.fx, L.fy, L.fz].map(v => +v.toFixed(6))).toEqual([0, 0, 1]);
  });
  it('has its right ear on the side the player strafes right to, at any heading', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -2.1]) {
      cam.yaw = yaw; cam.pitch = 0.3;
      const r = rightEar(), L = listenerPose();
      expect(r.x).toBeCloseTo(-Math.cos(yaw)); expect(r.z).toBeCloseTo(Math.sin(yaw)); expect(r.y).toBeCloseTo(0);
      // up stays square to the view while looking up or down
      expect(L.fx * L.ux + L.fy * L.uy + L.fz * L.uz).toBeCloseTo(0);
    }
  });
  it('places a bump on the player\'s own vehicle on the side it came from', () => {
    P.x = 0; P.z = 0; cam.yaw = 0; cam.pitch = 0;
    const L = listenerPose(), hit = beside(-1, 0);
    expect(dot({ x: hit.x - L.x, y: hit.y - L.y, z: hit.z - L.z }, rightEar())).toBeGreaterThan(1);
  });
});

describe('distance', () => {
  it('is full volume within the reference distance and halves with each doubling past it', () => {
    const p = HEAR.siren;
    expect(falloff(0, p)).toBe(1);
    expect(falloff(p.ref, p)).toBe(1);
    expect(falloff(p.ref * 2, p)).toBeCloseTo(0.5);
    expect(falloff(p.ref * 4, p)).toBeCloseTo(0.25);
  });
  it('fades to nothing by the range instead of cutting off', () => {
    for (const p of Object.values(HEAR)) {
      expect(falloff(p.max, p)).toBe(0);
      expect(falloff(p.max * 0.9, p)).toBeLessThan(falloff(p.max * 0.7, p));
    }
  });
  it('uses a profile\'s own curve when it has one', () => {
    expect(falloff(3, { max: 10, curve: d => 1 - d / 10 })).toBeCloseTo(0.7);
  });
  it('dulls far sounds', () => {
    expect(airCutoff(0, HEAR.shot)).toBe(AIR_NEAR);
    expect(airCutoff(HEAR.shot.max, HEAR.shot)).toBeCloseTo(AIR_FAR);
    expect(airCutoff(40, HEAR.shot)).toBeLessThan(airCutoff(20, HEAR.shot));
  });
  it('raises the pitch of an approaching source and lowers a receding one, within reason', () => {
    expect(doppler(0)).toBe(1);
    expect(doppler(20)).toBeGreaterThan(1.05);
    expect(doppler(-20)).toBeLessThan(0.96);
    expect(doppler(1000)).toBeLessThan(1.2);
  });
});
