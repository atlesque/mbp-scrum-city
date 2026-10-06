// Car handling: grip through turns, handbrake drifts that can be held and steered out of, and riding up kerbs.
import { describe, expect, it } from 'vitest';
import { driftDrive } from '../../public/js/vehicles/drive.js';
import { KINDS } from '../../public/js/vehicles/vehicle.js';

const car = (v = 0) => ({ K: KINDS.car, H: Object.assign({}, KINDS.car.handling), x: 0, z: 0, yaw: 0, v, steer: 0 });
const run = (c, secs, ctl) => { for (let t = 0; t < secs; t += 1 / 60) driftDrive(c, 1 / 60, { steer: 0, ...ctl }, KINDS.car.wheelbase); return c; };
const slideAngle = c => Math.atan2(Math.abs(c.slip), Math.abs(c.v));

describe('car handling', () => {
  it('drives straight without sliding', () => {
    const c = run(car(), 4, { throttle: true });
    expect(c.v).toBeGreaterThan(20);
    expect(c.slip).toBeCloseTo(0);
    expect(c.x).toBeCloseTo(0);
  });
  it('grips through a turn at speed, turning harder than it used to and keeping its speed', () => {
    const c = run(car(25), 1, { throttle: true, steer: 1 });
    expect(c.yaw).toBeGreaterThan(1.05); // the old steering managed about 0.75 rad in a second at this speed
    expect(slideAngle(c)).toBeLessThan(0.2);
    expect(Math.hypot(c.v, c.slip)).toBeGreaterThan(24);
    expect(c.drifting).toBeFalsy();
  });
  it('a handbrake turn kicks the tail out into a drift that holds on the throttle', () => {
    const c = run(car(25), 0.4, { throttle: true, steer: 1, handbrake: true });
    expect(c.drifting).toBe(true);
    expect(slideAngle(c)).toBeGreaterThan(0.3);
    run(c, 2, { throttle: true, steer: 1 });
    expect(c.drifting).toBe(true);
    expect(slideAngle(c)).toBeGreaterThan(0.3);
    expect(slideAngle(c)).toBeLessThan(0.9); // sideways, not spinning round
    expect(Math.hypot(c.v, c.slip)).toBeGreaterThan(18);
  });
  it('a quick tap of the handbrake is enough to start one', () => {
    const c = run(car(25), 1 / 60, { throttle: true, steer: 1, handbrake: true });
    run(c, 1, { throttle: true, steer: 1 });
    expect(c.drifting).toBe(true);
    expect(slideAngle(c)).toBeGreaterThan(0.3);
  });
  it('countersteering straightens a drift out', () => {
    const c = run(car(25), 0.4, { throttle: true, steer: 1, handbrake: true });
    run(c, 1.2, { throttle: true, steer: -0.3 });
    expect(c.drifting).toBe(false);
    expect(Math.abs(c.slip)).toBeLessThan(1.5);
    expect(c.v).toBeGreaterThan(20);
  });
  it('the handbrake alone, without steering, just slows the car', () => {
    const c = run(car(25), 1, { handbrake: true });
    expect(c.drifting).toBeFalsy();
    expect(c.v).toBeLessThan(20);
    expect(c.slip).toBeCloseTo(0);
  });
});

describe('cars on raised ground', () => {
  const posed = (x, z, yaw) => { const c = Object.assign(car(), { x, z, yaw, mesh: { grp: new THREE.Object3D() } }); KINDS.car.pose(c, 0); return c.mesh.grp; };
  it('sits on the road at road level', () => {
    expect(posed(-150, -175, 0).position.y).toBe(0);
  });
  it('sits on top of a sidewalk instead of sinking into it', () => {
    const g = posed(-157, -175, 0);
    expect(g.position.y).toBeCloseTo(0.14);
    expect(g.rotation.x).toBeCloseTo(0);
    expect(g.rotation.z).toBeCloseTo(0);
  });
  it('tilts with one side up on the kerb', () => {
    const g = posed(-156, -175, 0); // left wheels on the sidewalk, right wheels in the road
    expect(g.position.y).toBeGreaterThan(0.05);
    expect(g.position.y).toBeLessThan(0.1);
    expect(g.rotation.z).toBeLessThan(-0.03); // rolled towards the road side
  });
  it('pitches nose up driving onto the kerb', () => {
    const g = posed(-155.3, -175, -Math.PI / 2); // facing -x: front wheels on the sidewalk, rear in the road
    expect(g.rotation.x).toBeLessThan(-0.02); // nose up
  });
});
