import { describe, expect, it, vi } from 'vitest';
import { ZONE_DAMAGE, rollZone, zoneAt, zoneDamage } from '../../public/js/combat/hitzones.js';
import { castShot } from '../../public/js/combat/combat.js';
import { removeEntity } from '../../public/js/entities/registry.js';
import { spawnNpc } from '../../public/js/npcs/npc.js';

vi.mock('../../public/js/game/pickups.js', () => ({ reward() {} }));

// someone standing at (0, 0, 10) facing the shooter, and a shot from (0, y, 0) straight at them, or off to one side
function shootAt(y, side = 0, yaw = Math.PI) {
  const n = spawnNpc('civilian', 0, 10); n.yaw = yaw;
  const o = new THREE.Vector3(side, y, 0), d = new THREE.Vector3(0, 0, 1);
  const h = castShot(o, d, 50);
  removeEntity(n);
  return h.entity === n ? h : null;
}

describe('hit zones', () => {
  it('ranks the head over the torso over arms and legs', () => {
    expect(ZONE_DAMAGE.head).toBeGreaterThan(ZONE_DAMAGE.torso);
    expect(ZONE_DAMAGE.torso).toBeGreaterThan(ZONE_DAMAGE.limb);
    expect(zoneDamage(40, 'head')).toBe(100);
    expect(zoneDamage(40, 'limb')).toBe(24);
  });
  it('maps points on a standing body to zones', () => {
    expect(zoneAt(1.75, 0)).toBe('head');
    expect(zoneAt(1.2, 0)).toBe('torso');
    expect(zoneAt(1.2, 0.36)).toBe('limb');
    expect(zoneAt(0.5, 0.1)).toBe('limb');
  });
  it('finds the zone a bullet lands on', () => {
    expect(shootAt(1.74).zone).toBe('head');
    expect(shootAt(1.2).zone).toBe('torso');
    expect(shootAt(0.5).zone).toBe('limb');
    expect(shootAt(1.1, 0.36).zone).toBe('limb');
    // turned side on, the line that found an arm now crosses the body front to back
    expect(shootAt(1.1, 0.36, Math.PI / 2).zone).toBe('torso');
  });
  it('hurts a headshot most and a leg shot least', () => {
    const dmgAt = (y, side) => {
      const n = spawnNpc('civilian', 0, 10); n.yaw = Math.PI; n.hp = 1000;
      const h = castShot(new THREE.Vector3(side || 0, y, 0), new THREE.Vector3(0, 0, 1), 50);
      h.entity.onShot(h, 20, new THREE.Vector3(0, 0, 1)); const lost = 1000 - n.hp; removeEntity(n); return lost;
    };
    expect(dmgAt(1.74)).toBe(50);
    expect(dmgAt(1.2)).toBe(20);
    expect(dmgAt(0.5)).toBe(12);
  });
  it('rolls zones for shots at the player that hurt about as much as a body shot on average', () => {
    expect(rollZone(0.05)).toBe('head');
    expect(rollZone(0.4)).toBe('torso');
    expect(rollZone(0.9)).toBe('limb');
    let sum = 0; const N = 1000;
    for (let i = 0; i < N; i++) sum += ZONE_DAMAGE[rollZone((i + 0.5) / N)];
    expect(sum / N).toBeGreaterThan(0.95); expect(sum / N).toBeLessThan(1.1);
  });
});
