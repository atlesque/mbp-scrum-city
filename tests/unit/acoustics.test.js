// The street's echo: how much comes back, and how soon, from the walls round the listener.
import { describe, expect, it } from 'vitest';
import { addCollider, removeCollider } from '../../public/js/world/collision.js';
import { roomAt } from '../../public/js/world/acoustics.js';
import { echoSend, HEAR } from '../../public/js/core/spatial.js';

describe('the room around the listener', () => {
  it('is nearly dry out in the open', () => {
    const r = roomAt(0, 1.6, 0);
    expect(r.wet).toBeLessThan(0.1);
  });
  it('rings between buildings, and the slap comes back sooner the closer they are', () => {
    // a street running along z between two long blocks
    const walls = (gap) => [addCollider(-gap - 20, -gap, -60, 60, 20, true), addCollider(gap, gap + 20, -60, 60, 20, true)];
    const near = walls(5), narrow = roomAt(0, 1.6, 0); near.forEach(removeCollider);
    const far = walls(15), wide = roomAt(0, 1.6, 0); far.forEach(removeCollider);
    expect(narrow.wet).toBeGreaterThan(0.3);
    expect(narrow.wet).toBeGreaterThanOrEqual(wide.wet);
    expect(narrow.delay).toBeLessThan(wide.delay);
    expect(roomAt(0, 1.6, 0).wet).toBeLessThan(0.1); // the walls are gone again
  });
  it('comes back late from up on a roof', () => {
    const r = roomAt(0, 21.6, 0, 20);
    expect(r.delay).toBeGreaterThanOrEqual(0.22);
    expect(r.wet).toBeGreaterThan(0.1);
  });
});

describe('the echo send', () => {
  it('grows with distance, so far-off shots are mostly echo', () => {
    expect(echoSend(0, HEAR.shot)).toBeCloseTo(0.5);
    expect(echoSend(80, HEAR.shot)).toBeGreaterThan(echoSend(20, HEAR.shot));
    expect(echoSend(HEAR.shot.max * 2, HEAR.shot)).toBe(3);
  });
});
