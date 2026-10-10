// Parachutes on the three high roofs: open one in the air, float down, and it is spent on landing; the roof gets a new one.
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../public/js/core/util.js', async orig => ({ ...(await orig()), $: () => ({ hidden: true, style: {} }) }));
import { G, P } from '../../public/js/core/state.js';
import { HANG, PARA, chuteStep, dropChute, hangPose, makeParachutePickup, openChute, opensChute, poseHang, strapOnChute } from '../../public/js/game/parachute.js';
import { animateChar } from '../../public/js/characters/character.js';
import { landDamage } from '../../public/js/game/player.js';
import { removeEntity } from '../../public/js/entities/registry.js';

const GRAVITY = 18, DT = 1 / 60;
const fall = (vy, s) => { for (let t = 0; t < s; t += DT) vy = chuteStep(vy, DT, GRAVITY); return vy; };

describe('parachute', () => {
  beforeEach(() => {
    P.c = { body: new THREE.Group(), root: new THREE.Group() }; P.chute = null; P.alive = true; P.vehicle = null;
    P.x = 0; P.z = 0; P.y = 60; G.time = 0;
  });
  it('opens on Space in the air once the double jump is spent or the fall is fast, not while the jets can fly', () => {
    const c = { open: false };
    expect(opensChute(c, 1, -2, false)).toBe(false); // the double jump comes first
    expect(opensChute(c, 2, 1, false)).toBe(true);
    expect(opensChute(c, 1, -PARA.openFall - 1, false)).toBe(true); // stepped off and dropping
    expect(opensChute(c, 2, -10, true)).toBe(false); // the jetpack has fuel: Space flies
    expect(opensChute(null, 2, -10, false)).toBe(false);
    expect(opensChute({ open: true }, 2, -10, false)).toBe(false);
  });
  it('brakes a fast fall to a sink rate that lands without a scratch', () => {
    expect(fall(-30, 2.5)).toBeCloseTo(-PARA.sink, 1);
    expect(fall(0, 3)).toBeCloseTo(-PARA.sink, 1); // opened at the top of a jump: falls, then holds
    expect(landDamage(-PARA.sink)).toBe(0);
  });
  it('is one use: open it, then landing or dying drops it', () => {
    strapOnChute(); expect(P.chute.open).toBe(false); expect(P.c.body.children).toContain(P.chute.mesh);
    openChute(); expect(P.chute.open).toBe(true); expect(P.c.root.children).toContain(P.chute.canopy);
    expect(P.c.body.children).toHaveLength(0);
    dropChute(); expect(P.chute).toBe(null); expect(P.c.root.children).toHaveLength(0);
  });
  it('is taken by walking over it and comes back on the roof after a while', () => {
    const p = makeParachutePickup(0, 60, 0);
    p.update(DT); expect(P.chute).not.toBe(null); expect(p.m.visible).toBe(true);
    dropChute(); G.time = 1; p.update(DT);
    expect(P.chute).toBe(null); expect(p.m.visible).toBe(false); // gone for now
    G.time = PARA.respawn + 0.5; p.update(DT);
    expect(P.chute).not.toBe(null); // back, and taken again
    removeEntity(p);
  });
  it('waits while the player still has one packed', () => {
    const p = makeParachutePickup(0, 60, 0);
    strapOnChute(); const mine = P.chute; p.update(DT);
    expect(P.chute).toBe(mine); expect(p.m.visible).toBe(true);
    removeEntity(p);
  });
  it('hangs in the harness under the open wing instead of walking: legs together and forward, hands up on the lines', () => {
    const g = () => new THREE.Group();
    const a = { c: { body: g(), legL: g(), legR: g(), armL: g(), armR: g(), gunHolder: g() }, moveSpeed: PARA.air, jumpY: 30, vx: 0, vz: PARA.air, yaw: 0 };
    const legs = [];
    for (let i = 0; i < 40; i++) { // steering ahead at full speed: the walk cycle would swing the legs a long way
      G.time = i * DT; animateChar(a, DT); poseHang(a);
      const { legL, legR } = a.c;
      expect(Math.abs(legL.rotation.x - legR.rotation.x)).toBeLessThan(0.05); // together, not striding
      expect(legL.rotation.x).toBeLessThan(0); // swung forward, like sitting
      expect(a.c.body.position.y).toBe(30); // no step bob
      expect(a.c.armL.rotation.x).toBeLessThan(-2.4); expect(a.c.armR.rotation.x).toBeLessThan(-2.4); // up on the lines
      legs.push(legL.rotation.x);
    }
    expect(Math.max(...legs) - Math.min(...legs)).toBeLessThanOrEqual(2 * HANG.sway + 1e-6); // only a slow sway
    a.aiming = true; a.c.armR.rotation.set(-1.5, 0, 0); poseHang(a);
    expect(a.c.armR.rotation.x).toBe(-1.5); // a gun being aimed keeps its arm
  });
  it('pulls the brake on the side it steers towards', () => {
    const left = hangPose(0, PARA.air), right = hangPose(0, -PARA.air), level = hangPose(0, 0);
    expect(left.armL[0]).toBeGreaterThan(level.armL[0]); expect(left.armR[0]).toBe(level.armR[0]);
    expect(right.armR[0]).toBeGreaterThan(level.armR[0]); expect(right.armL[0]).toBe(level.armL[0]);
  });
});
