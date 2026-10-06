// Positional sounds pan to the ear on their side of the camera, not just get louder up close.
import { describe, expect, it } from 'vitest';
import { PAN_NEAR, PAN_WIDTH, panFor } from '../../public/js/core/spatial.js';

// facing +z (yaw 0) the camera's right is -x, the way the player strafes (player.js)
const right = yaw => [-Math.cos(yaw), Math.sin(yaw)];

describe('stereo pan', () => {
  it('puts a sound to the right in the right ear and one to the left in the left ear', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -2.1]) {
      const [rx, rz] = right(yaw);
      expect(panFor(rx * 20, rz * 20, yaw)).toBeCloseTo(PAN_WIDTH);
      expect(panFor(-rx * 20, -rz * 20, yaw)).toBeCloseTo(-PAN_WIDTH);
    }
  });
  it('keeps sounds straight ahead or behind in the middle', () => {
    expect(panFor(0, 30, 0)).toBeCloseTo(0);
    expect(panFor(0, -30, 0)).toBeCloseTo(0);
  });
  it('eases to the middle as a sound gets right on top of you', () => {
    expect(panFor(0, 0, 0)).toBe(0);
    expect(Math.abs(panFor(-PAN_NEAR / 4, 0, 0))).toBeCloseTo(PAN_WIDTH / 4);
    expect(panFor(-PAN_NEAR / 4, 0, 0, 0)).toBeCloseTo(PAN_WIDTH);
  });
});
