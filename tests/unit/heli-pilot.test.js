// Flying the police chopper: shoot its pilot and it comes down in one piece, get in and fly it, fire its minigun and
// rocket bursts, and jump out under a parachute that opens by itself.
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../public/js/core/util.js', async orig => ({ ...(await orig()), $: () => ({ hidden: true, style: {}, classList: { toggle() {}, add() {}, remove() {} } }) }));
vi.mock('../../public/js/game/pickups.js', () => ({ reward() {} }));
import '../../public/js/vehicles/vehicle.js'; // first, as in the game: the kinds and the game modules import each other
import { makeCharacter } from '../../public/js/characters/character.js';
import { castShot } from '../../public/js/combat/combat.js';
import { G, I, P, cam } from '../../public/js/core/state.js';
import { WBY } from '../../public/js/data/weapons.js';
import { all, removeEntity } from '../../public/js/entities/registry.js';
import { camTarget, enterVehicle, exitVehicle, hurtPlayer } from '../../public/js/game/player.js';
import { spawnNpc } from '../../public/js/npcs/npc.js';
import { HELI_HP, PILOT, removeHeli, spawnHeli } from '../../public/js/vehicles/heli.js';
import { HELI_GUNS, cycleHeliGun, heliGuns, pickHeliGun } from '../../public/js/vehicles/heli-guns.js';
import { FLY, flyStep } from '../../public/js/vehicles/kinds/heli.js';
import { VEHICLE_MODELS } from '../../public/js/vehicles/models/index.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';
import { addCollider, colliders, tallBoxes } from '../../public/js/world/collision.js';

const DT = 1 / 30;
const clear = () => { for (const e of [...all()]) removeEntity(e); removeHeli(); };
function chopper() {
  clear(); P.x = 0; P.z = 0; P.y = 0; G.wanted = 4; G.heat = 60; spawnHeli();
  const h = G.heli; h.x = 0; h.y = 28; h.z = 26; h.yaw = Math.PI; h.ang = Math.PI / 2; h.fireT = 1e9; // nose towards the player
  h.grp.position.set(h.x, h.y, h.z); h.grp.rotation.set(0.12, h.yaw, 0); h.grp.updateMatrixWorld(true);
  return h;
}
// a shot from the player's eye at a point of the pilot's seated body (1.74 up: the head)
function atPilot(h, up = 1.74) {
  h.grp.updateMatrixWorld(true);
  const p = h.seat.localToWorld(new THREE.Vector3(0, up, 0)), o = new THREE.Vector3(0, 1.6, 0);
  return [o, p.sub(o).normalize()];
}
const downed = () => all('vehicle').find(v => v.model.id === 'heli');
const still = () => ({ fwd: 0, side: 0, up: false, down: false, boost: false, yaw: 0 });

describe('shooting the pilot', () => {
  beforeEach(() => { P.c = makeCharacter({ skin: '#eab48f', shirt: '#2fb8c9', pants: '#f4f0e6', hair: '#3a2416' }); P.vehicle = null; P.alive = true; P.chute = null; G.state = 'play'; });
  it('a shot through the canopy finds the pilot rather than the bodywork', () => {
    const h = chopper(), hit = castShot(...atPilot(h), 200);
    expect(hit.entity).toBe(h);
    expect(hit.occupant).toBe(true);
    // a shot at the tail does not
    const tail = castShot(new THREE.Vector3(20, 28.3, 26 + 4.4), new THREE.Vector3(-1, 0, 0), 200);
    expect(tail.entity).toBe(h); expect(tail.occupant).toBe(false);
  });
  it('two rifle rounds or one to the head kill him; the chopper is not hurt by them', () => {
    const h = chopper(), dmg = WBY.rifle.dmg;
    let [o, d] = atPilot(h, 1.2); h.onShot(castShot(o, d, 200), dmg, d);
    expect(h.downed).toBe(false);
    [o, d] = atPilot(h, 1.2); h.onShot(castShot(o, d, 200), dmg, d);
    expect(h.downed).toBe(true); expect(h.hp).toBe(HELI_HP);
    const g = chopper(); g.onShot({ occupant: true, head: true }, dmg);
    expect(PILOT.hp).toBeLessThanOrEqual(dmg * PILOT.head);
    expect(g.downed).toBe(true);
  });
  it('drops with the rotors winding down and lands in one piece, as a chopper to fly', () => {
    const h = chopper(), npc = spawnNpc('civilian', 0.5, 26), car = spawnVehicle('sedan', 30, 26, 0);
    h.onShot({ occupant: true, head: true }, 999);
    let t = 0; for (; t < 20 && G.heli; t += DT) h.update(DT);
    expect(G.heli).toBeNull(); // the police chopper is gone, so another can come later
    expect(h.spin).toBeLessThan(1);
    const v = downed();
    expect(v).toBeDefined();
    expect(v.dead).toBe(false); expect(v.burnT).toBe(0);
    expect(v.hp).toBe(HELI_HP);
    expect(v.y).toBeCloseTo(0, 1); expect(Math.hypot(v.x - 0, v.z - 26)).toBeLessThan(0.5);
    expect(npc.alive).toBe(false); // it came down on him
    expect(car.dead).toBe(false); expect(car.burnT).toBe(0); // not a blast
  });
  it('a chopper downed over a roof lands on it', () => {
    const b = addCollider(-10, 10, 16, 36, 18, true);
    try {
      const h = chopper(); h.onShot({ occupant: true, head: true }, 999);
      for (let t = 0; t < 20 && G.heli; t += DT) h.update(DT);
      expect(downed().y).toBeCloseTo(18, 1);
    } finally { colliders.splice(colliders.indexOf(b), 1); tallBoxes.splice(tallBoxes.indexOf(b), 1); }
  });
  it('still goes down in flames when shot to pieces instead', () => {
    const h = chopper(); h.damage(HELI_HP);
    for (let t = 0; t < 20 && G.heli; t += DT) h.update(DT);
    expect(downed()).toBeUndefined();
  });
});

describe('flying it', () => {
  let v;
  beforeEach(() => {
    clear(); P.c = makeCharacter({ skin: '#eab48f', shirt: '#2fb8c9', pants: '#f4f0e6', hair: '#3a2416' }); P.vehicle = null; P.alive = true; P.chute = null; G.state = 'play';
    v = spawnVehicle('heli', 0, 0, 0); v.rotor = 0;
  });
  it('is as tough as the police chopper', () => { expect(VEHICLE_MODELS.heli.hp).toBe(HELI_HP); });
  it('needs the rotor up to speed before it lifts off', () => {
    const c = { ...still(), up: true };
    for (let t = 0; t < 1; t += DT) flyStep(v, DT, c);
    expect(v.y).toBe(0);
    for (let t = 0; t < 3; t += DT) flyStep(v, DT, c);
    expect(v.rotor).toBe(1); expect(v.y).toBeGreaterThan(5);
  });
  it('climbs, holds its height, turns to the camera and flies the way the keys point', () => {
    v.rotor = 1; v.y = 30; v.landed = false;
    for (let t = 0; t < 3; t += DT) flyStep(v, DT, { ...still(), yaw: Math.PI / 2 });
    expect(v.y).toBeCloseTo(30, 0);
    expect(v.yaw).toBeCloseTo(Math.PI / 2, 2);
    const x = v.x; for (let t = 0; t < 4; t += DT) flyStep(v, DT, { ...still(), fwd: 1, yaw: Math.PI / 2 });
    expect(v.x - x).toBeGreaterThan(40); expect(v.v).toBeGreaterThan(FLY.top * 0.8); expect(v.v).toBeLessThanOrEqual(FLY.top + 0.01);
    const z = v.z; for (let t = 0; t < 2; t += DT) flyStep(v, DT, { ...still(), side: 1, yaw: Math.PI / 2 });
    expect(v.z).toBeGreaterThan(z + 5); // facing +x, its right is +z (as walking: core/keymap.js 'right')
    for (let t = 0; t < 30; t += DT) flyStep(v, DT, { ...still(), up: true, yaw: Math.PI / 2 });
    expect(v.y).toBe(FLY.ceiling);
  });
  it('lands on the street when it comes down, and a fast landing hurts it', () => {
    v.rotor = 1; v.y = 20; v.landed = false;
    for (let t = 0; t < 6; t += DT) flyStep(v, DT, { ...still(), down: true });
    expect(v.y).toBe(0); expect(v.landed).toBe(true); expect(v.hp).toBe(HELI_HP);
  });
  it('stops against a building instead of flying through it', () => {
    const b = addCollider(20, 40, -10, 10, 30, true);
    try {
      v.rotor = 1; v.y = 10; v.landed = false; v.yaw = Math.PI / 2;
      for (let t = 0; t < 4; t += DT) flyStep(v, DT, { ...still(), fwd: 1, yaw: Math.PI / 2 });
      expect(v.x).toBeLessThanOrEqual(20 - FLY.r + 0.01);
    } finally { colliders.splice(colliders.indexOf(b), 1); tallBoxes.splice(tallBoxes.indexOf(b), 1); }
  });
  it('with nobody flying it, drops out of the sky and goes up, but settles from a hop', () => {
    P.x = 300; P.z = 0; // well clear of the bang
    v.rotor = 1; v.y = 40; v.landed = false;
    for (let t = 0; t < 10 && !v.dead; t += DT) v.update(DT);
    expect(v.dead).toBe(true);
    const w = spawnVehicle('heli', 50, 0, 0); w.rotor = 1; w.y = 3; w.landed = false;
    for (let t = 0; t < 5; t += DT) w.update(DT);
    expect(w.dead).toBe(false); expect(w.y).toBe(0);
  });
  it('can only be got into from close by and on the same level', () => {
    P.x = 2.5; P.z = 0; P.y = 0;
    expect(v.interaction(P)).not.toBeNull();
    P.y = 6; expect(v.interaction(P)).toBeNull();
    P.y = 0; P.x = 8; expect(v.interaction(P)).toBeNull();
  });
  it('shots and blasts land on the chopper, not on the player flying it', () => {
    P.hp = 100; enterVehicle(v);
    v.y = 30; v.landed = false;
    hurtPlayer(20);
    expect(P.hp).toBe(100); expect(v.hp).toBe(HELI_HP - 20);
    exitVehicle(false);
  });
  it('comes with a parachute: jumping out in the air opens it at once, with no tumble', () => {
    enterVehicle(v); expect(P.chute).not.toBeNull(); expect(P.chute.open).toBe(false);
    v.y = 40; v.vx = 10; v.landed = false;
    exitVehicle(false);
    expect(P.vehicle).toBeNull();
    expect(P.chute.open).toBe(true); expect(P.tumble).toBeFalsy();
    expect(P.y).toBeGreaterThan(39); expect(P.grounded).toBe(false);
  });
  it('the searchlight follows the crosshair down to the horizon, never above it', () => {
    enterVehicle(v); v.y = 40; v.rotor = 1; v.landed = false;
    const beamDir = () => { const L = v.mesh.light; return new THREE.Vector3(0, 1, 0).applyQuaternion(L.beam.quaternion).negate(); }; // the cone points down its -y
    camTarget.set(v.x, v.y + 6, v.z);
    cam.yaw = 0; cam.pitch = -0.5; v.K.pose(v, 0.016);
    expect(v.mesh.light.beam.visible).toBe(true); expect(v.mesh.light.spot.visible).toBe(true);
    expect(v.mesh.light.spot.position.y).toBeLessThan(1); // on the street ahead
    expect(v.mesh.light.spot.position.z).toBeGreaterThan(40);
    cam.pitch = 0.6; v.K.pose(v, 0.016);
    expect(Math.abs(beamDir().y)).toBeLessThan(1e-6); // level, not up into the sky
    expect(v.mesh.light.spot.visible).toBe(false); // nothing out there to land on
    exitVehicle(false);
  });
  it('on the ground, out of the door like a car', () => {
    enterVehicle(v); exitVehicle(false);
    expect(P.y).toBe(0); expect(P.grounded).toBe(true); expect(P.chute.open).toBe(false);
  });
});

describe('its guns', () => {
  let v;
  beforeEach(() => {
    clear(); P.c = makeCharacter({ skin: '#eab48f', shirt: '#2fb8c9', pants: '#f4f0e6', hair: '#3a2416' }); P.vehicle = null; P.alive = true; P.chute = null; G.state = 'play';
    v = spawnVehicle('heli', 0, 0, 0); enterVehicle(v); v.y = 30; v.rotor = 1; cam.pitch = -0.5; cam.yaw = 0;
    I.mouseL = false; I.clickQ = 0;
  });
  it('has the minigun\'s belt and reload, and six rockets that reload as fast as the rocket launcher', () => {
    expect(HELI_GUNS.minigun.mag).toBe(WBY.minigun.mag); expect(HELI_GUNS.minigun.reload).toBe(WBY.minigun.reload);
    expect(HELI_GUNS.rockets.mag).toBe(6); expect(HELI_GUNS.rockets.reload).toBe(WBY.rpg.reload);
    expect(v.guns.mag).toEqual({ minigun: 250, rockets: 6 });
  });
  it('the minigun fires while the button is held and reloads when the belt runs out', () => {
    I.mouseL = true; for (let t = 0; t < 1; t += 0.01) heliGuns(v, 0.01);
    expect(v.guns.mag.minigun).toBeLessThan(250 - 15);
    v.guns.mag.minigun = 1; for (let t = 0; t < 0.1; t += 0.01) heliGuns(v, 0.01);
    expect(v.guns.mag.minigun).toBe(0); expect(v.guns.reloadT).toBeGreaterThan(0);
    I.mouseL = false; for (let t = 0; t < WBY.minigun.reload + 0.05; t += 0.01) heliGuns(v, 0.01);
    expect(v.guns.mag.minigun).toBe(250);
  });
  it('one click sends three rockets off one after another; two clicks empty the pods, then they reload', () => {
    pickHeliGun(v, 'rockets'); for (let t = 0; t < 0.3; t += 0.01) heliGuns(v, 0.01);
    I.clickQ = 0.3; heliGuns(v, 0.01);
    expect(v.guns.mag.rockets).toBe(5); // the first goes at once
    for (let t = 0; t < 0.1; t += 0.01) heliGuns(v, 0.01);
    expect(v.guns.mag.rockets).toBe(5); // then a short gap
    for (let t = 0; t < 0.4; t += 0.01) heliGuns(v, 0.01);
    expect(v.guns.mag.rockets).toBe(3);
    for (let t = 0; t < 1; t += 0.01) heliGuns(v, 0.01);
    expect(v.guns.mag.rockets).toBe(3); // one click, one burst
    I.clickQ = 0.3; for (let t = 0; t < 1; t += 0.01) heliGuns(v, 0.01);
    expect(v.guns.mag.rockets).toBe(0); expect(v.guns.reloadT).toBeGreaterThan(0);
    for (let t = 0; t < WBY.rpg.reload + 0.05; t += 0.01) heliGuns(v, 0.01);
    expect(v.guns.mag.rockets).toBe(6);
  });
  it('switches between the two with the number keys or the wheel', () => {
    expect(v.guns.cur).toBe('minigun');
    cycleHeliGun(v, 1); expect(v.guns.cur).toBe('rockets');
    cycleHeliGun(v, 1); expect(v.guns.cur).toBe('minigun');
    pickHeliGun(v, 'rockets'); expect(v.guns.cur).toBe('rockets');
  });
});
