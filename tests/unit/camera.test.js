import { describe, expect, it } from 'vitest';
import { CAM_R, PITCH_MIN, armRoom, pickSide, shoulderRoom, stepArm } from '../../public/js/game/camera.js';
import { addCollider, sweepHit } from '../../public/js/world/collision.js';

// an alley 3.2 m wide running north-south between two 20 m tall buildings, out past the edge of the city
const AX = 1000, AZ = 1000;
addCollider(AX - 16, AX - 1.6, AZ - 15, AZ + 15, 20, true);
addCollider(AX + 1.6, AX + 16, AZ - 15, AZ + 15, 20, true);
// the camera ball's distance into the nearest of the two walls (positive: clipping)
const intoWall = (x, y) => y > 20 + CAM_R ? -1 : Math.max(x - (AX + 1.6 - CAM_R), (AX - 1.6 + CAM_R) - x);
// where the arm puts the camera
const place = (s, x, y, z, yaw) => [x - Math.sin(yaw) * Math.cos(s.pitch) * s.arm, y - Math.sin(s.pitch) * s.arm, z - Math.cos(yaw) * Math.cos(s.pitch) * s.arm];
function settle(x, y, z, yaw, pitch, want, minArm, s = { arm: 0, lift: 0 }) {
  for (let i = 0; i < 300; i++) stepArm(s, x, y, z, yaw, pitch, want, minArm, 1 / 60);
  return s;
}

describe('camera sweep against buildings', () => {
  it('stops a camera-sized ball short of a wall', () => {
    expect(sweepHit(AX, 1.6, AZ, -1, 0, 0, 10, CAM_R)).toBeCloseTo(1.6 - CAM_R, 5);
    expect(sweepHit(AX, 1.6, AZ, 0, 0, 1, 10, CAM_R)).toBe(10); // straight down the alley is clear
  });
  it('still stops at a wall when the ray dips below the street', () => {
    const d = Math.SQRT1_2;
    expect(sweepHit(AX, 1.6, AZ, -d, -d, 0, 10, CAM_R)).toBeCloseTo((1.6 - CAM_R) / d, 5);
  });
  it('stops at a rooftop hut passed in as an extra box, and clears the roof trim', () => {
    const hut = [{ x0: AX - 1, x1: AX + 1, y0: 20.6, y1: 23, z0: AZ - 10, z1: AZ - 8 }];
    expect(sweepHit(AX, 22.3, AZ, 0, 0, -1, 10, CAM_R, hut)).toBeCloseTo(8 - CAM_R, 5);
    expect(sweepHit(AX - 8, 30, AZ, 0, -1, 0, 20, CAM_R)).toBeCloseTo(30 - 20.7 - CAM_R, 5); // down onto the west building
  });
  it('lets a ball that starts inside a building back out of it', () => {
    expect(sweepHit(AX - 1.5, 1.6, AZ, 1, 0, 0, 10, CAM_R)).toBeCloseTo(3.2 - CAM_R - 0.1, 5);
  });
});

describe('follow camera spring arm', () => {
  it('hangs the arm as steep as the steepest aim, so the camera stays on the shot line looking down at the feet', () => {
    expect(PITCH_MIN).toBeLessThan(-1.4); // within a few degrees of straight down
    const s = settle(AX + 100, 30, AZ, 0, PITCH_MIN, 4.6, 1.4); // open air, high above the street
    expect(s.pitch).toBeCloseTo(PITCH_MIN, 5);
    expect(s.arm).toBeCloseTo(4.6, 2);
  });
  it('keeps the shoulder offset off the wall', () => {
    expect(shoulderRoom(AX, 1.6, AZ, 0, 0.55)).toBe(0.55);
    expect(shoulderRoom(AX - 1.0, 1.6, AZ, 0, 0.55)).toBeLessThan(0.3); // facing north, right is towards -x
  });
  it('looks over the left shoulder when a wall on the right would bring the arm in close', () => {
    expect(shoulderRoom(AX, 1.6, AZ, 0, -0.55)).toBe(-0.55);
    expect(pickSide(AX, 1.62, AZ, 0, -0.08, 0.55, 4.6)).toBe(1); // down the alley: room either way, stay right
    // at 45 degrees with the right shoulder towards the west wall: the left leaves more room
    expect(pickSide(AX, 1.62, AZ, Math.PI / 4, -0.08, 0.55, 4.6)).toBe(-1);
    // back to the right as soon as it has as much room again
    expect(pickSide(AX, 1.62, AZ, 0, -0.08, 0.55, 4.6, -1)).toBe(1);
  });
  it('sits the whole arm back when nothing is in the way', () => {
    const s = settle(AX, 1.62, AZ, 0, -0.08, 4.6, 1.4);
    expect(s.arm).toBeCloseTo(4.6, 2);
    expect(s.lift).toBeCloseTo(0, 3);
    expect(s.look).toBe(30);
  });
  it('pulls in front of the wall when facing across the alley on foot', () => {
    const yaw = Math.PI / 2, s = settle(AX + 0.6, 1.62, AZ, yaw, -0.08, 4.6, 1.4), [x, y] = place(s, AX + 0.6, 1.62, AZ, yaw);
    expect(intoWall(x, y)).toBeLessThanOrEqual(1e-6);
    expect(s.arm).toBeGreaterThan(1.4);
  });
  it('swings up over a car parked across the alley and looks down on it', () => {
    const yaw = Math.PI / 2, s = settle(AX, 2.2, AZ, yaw, -0.08, 7.4, 3.4), [x, y] = place(s, AX, 2.2, AZ, yaw);
    expect(intoWall(x, y)).toBeLessThanOrEqual(1e-6);
    expect(s.arm).toBeGreaterThanOrEqual(3.4);
    expect(y).toBeGreaterThan(5);
    expect(s.look).toBeLessThan(5);
  });
  it('snaps in at once but eases back out', () => {
    const s = settle(AX, 1.62, AZ, Math.PI / 2, -0.08, 4.6, 1.4), near = s.arm;
    stepArm(s, AX, 1.62, AZ, 0, -0.08, 4.6, 1.4, 1 / 60); // turn to look down the alley: the way back is clear
    expect(s.arm).toBeGreaterThan(near);
    expect(s.arm).toBeLessThan(near + 0.3);
    stepArm(s, AX, 1.62, AZ, Math.PI / 2, -0.08, 4.6, 1.4, 1 / 60); // and back across: in at once, never into the wall
    const [x, y] = place(s, AX, 1.62, AZ, Math.PI / 2);
    expect(intoWall(x, y)).toBeLessThanOrEqual(1e-6);
    expect(s.arm).toBeLessThanOrEqual(armRoom(AX, 1.62, AZ, Math.PI / 2, s.pitch, 4.6) + 1e-6);
  });
});
