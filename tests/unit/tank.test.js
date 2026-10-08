import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROCKET_BLAST_R } from '../../public/js/combat/combat.js';
import { G, P } from '../../public/js/core/state.js';
import { WBY, wStat } from '../../public/js/data/weapons.js';
import { WANTED } from '../../public/js/data/wanted.js';
import { all } from '../../public/js/entities/registry.js';
import { spawnNpc } from '../../public/js/npcs/npc.js';
import { CRASH_BLAST, HELI_HP } from '../../public/js/vehicles/heli.js';
import { HL, MIN_RANGE, SHELL, TANK_BLAST, TANK_HP, nextDir, removeTank, spawnTank } from '../../public/js/vehicles/tank.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { tallBoxes } from '../../public/js/world/collision.js';

vi.mock('../../public/js/game/pickups.js', () => ({ reward() {} }));

// a tank at the junction (0, 50), facing down the road towards the player at the origin
function tank() {
  removeTank(null, true); P.x = 0; P.z = 0; P.y = 0; P.alive = true; P.hp = 100; P.vehicle = null; G.wanted = 5;
  const t = spawnTank();
  Object.assign(t, { x: 0, z: 50, yaw: Math.PI, dirX: 0, dirZ: -1, toX: 0, toZ: 0, turretYaw: Math.PI, aimYaw: Math.PI });
  return t;
}
afterEach(() => { removeTank(null, true); G.wanted = 0; });

describe('army tank', () => {
  it('rolls in with the army at five stars only', () => {
    expect(WANTED[5].tank).toBe(true);
    expect(WANTED.slice(1, 5).some(L => L.tank)).toBe(false);
  });
  it('shrugs off rifle fire', () => {
    const t = tank(), dmg = wStat(WBY.rifle, 0).dmg;
    for (let i = 0; i < 90; i++) t.onShot({ p: new THREE.Vector3(t.x, 1, t.z) }, dmg);
    expect(t.dead).toBe(false);
    expect(t.hp).toBeGreaterThan(TANK_HP * 0.8);
    expect(TANK_HP).toBeGreaterThan(HELI_HP);
  });
  it('takes about four direct rockets to stop', () => {
    const t = tank(), dmg = wStat(WBY.rpg, 0).dmg;
    let n = 0;
    while (!t.dead && n < 20) { t.onRocket(dmg); t.blast(t.x, 1, t.z + 3, ROCKET_BLAST_R, dmg, true); n++; }
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
  });
  it("is not hurt by the army's own shells and rockets", () => {
    const t = tank();
    t.blast(t.x, 1, t.z, 12, 500, false);
    expect(t.hp).toBe(TANK_HP);
  });
  it('fires from well clear of its own shell blast', () => {
    expect(MIN_RANGE).toBeGreaterThan(ROCKET_BLAST_R * SHELL.blastMul);
  });
  it('drives along the roads towards the player', () => {
    expect(nextDir(0, 50, 0, 0, null)).toEqual([0, -1]);
    expect(nextDir(100, 100, -10, 140, null)).toEqual([-1, 0]);
    // never back the way it came while another road gets closer
    expect(nextDir(0, 50, 0, 120, [0, -1])).toEqual([0, 1]);
    expect(nextDir(0, 50, 0, 70, [0, 1])).not.toEqual([0, 1]);
    const t = tank(); P.z = -100; tallBoxes.push({ x0: -5, x1: 5, z0: 10, z1: 12, h: 200 }); // out of sight
    try {
      for (let i = 0; i < 100; i++) t.update(0.05);
      expect(t.z).toBeLessThan(40);
      expect(t.x).toBe(0);
    } finally { tallBoxes.pop(); }
  });
  it('holds fire until it has seen the player and turned its gun on them', () => {
    const t = tank(); t.reloadT = 0; P.z = -10; // 60 m off
    t.turretYaw = 0; // facing away
    t.update(0.02);
    expect(t.reloadT).toBeLessThanOrEqual(0);
    for (let i = 0; i < 300 && t.reloadT <= 0; i++) t.update(0.02);
    expect(t.reloadT).toBeGreaterThan(SHELL.reload[0] - 0.1);
    expect(Math.abs(Math.sin(t.turretYaw - Math.PI))).toBeLessThan(0.1);
    expect(t.v).toBe(0); // stopped to fire
  });
  it('never fires through a building', () => {
    const t = tank(); t.reloadT = 0; t.turretYaw = Math.PI;
    tallBoxes.push({ x0: -20, x1: 20, z0: 20, z1: 24, h: 200 });
    try {
      for (let i = 0; i < 100; i++) { t.update(0.02); expect(t.reloadT).toBeLessThanOrEqual(0); }
    } finally { tallBoxes.pop(); }
  });
  it('shoves and crushes a car in its way', () => {
    const t = tank(); P.z = -200; t.v = 7;
    const car = spawnVehicle('sedan', 0, 50 - HL - 2, 0);
    tallBoxes.push({ x0: -5, x1: 5, z0: 10, z1: 12, h: 200 });
    try {
      for (let i = 0; i < 40; i++) t.update(0.05);
      expect(car.hp).toBeLessThan(car.model.hp);
      expect(car.z).toBeLessThan(t.z - HL);
    } finally { tallBoxes.pop(); }
  });
  it('runs over people on foot in front of it', () => {
    const t = tank(); P.z = -200; t.v = 7;
    const n = spawnNpc('civilian', 0.5, 50 - HL - 0.3);
    t.update(0.05);
    expect(n.alive).toBe(false);
  });
  it('can be hit on the hull and the turret', () => {
    const t = tank(), d = new THREE.Vector3(-1, 0, 0);
    expect(t.raycast(new THREE.Vector3(20, 1, 50), d, 100)).not.toBeNull();
    expect(t.raycast(new THREE.Vector3(20, 2.2, 50), d, 100)).not.toBeNull();
    expect(t.raycast(new THREE.Vector3(20, 3.5, 50), d, 100)).toBeNull();
  });
  it('goes up bigger than a chopper crash and leaves a wreck in the road', () => {
    expect(TANK_BLAST.r).toBeGreaterThan(CRASH_BLAST.r);
    expect(TANK_BLAST.dmg).toBeGreaterThan(CRASH_BLAST.dmg);
    const t = tank(), car = spawnVehicle('sedan', 8, 50, 0), npc = spawnNpc('civilian', -6, 50);
    t.damage(TANK_HP);
    expect(t.dead).toBe(true);
    expect(G.tank).toBeNull();
    expect(car.burnT > 0 || car.dead).toBe(true);
    expect(npc.alive).toBe(false);
    for (let i = 0; i < 60; i++) t.update(0.05);
    expect(all('tank')).toContain(t);
    expect(t.pushOut({ x: 0, z: 50 + HL - 0.5 }, 0.5)).toBe(true); // still in the way
  });
  it('drives off when the army stands down', () => {
    const t = tank(); G.wanted = 4;
    for (let i = 0; i < 600 && G.tank; i++) t.update(0.1);
    expect(G.tank).toBeNull();
    expect(t.removed).toBe(true);
  });
});
