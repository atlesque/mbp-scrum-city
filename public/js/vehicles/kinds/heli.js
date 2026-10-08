import { kb } from '../../core/controls.js';
import { G, P, cam } from '../../core/state.js';
import { angDiff, clamp, lerp, rnd } from '../../core/util.js';
import { strapOnChute } from '../../game/parachute.js';
import { camTarget } from '../../game/player.js';
import { emit } from '../../render/effects.js';
import { scene } from '../../render/scene.js';
import { groundAt } from '../../world/city.js';
import { collide, pushOutSeg, raySphere, tallBoxes } from '../../world/collision.js';
import { surfaceAt } from '../../world/rooftops.js';
import { armHeli, heliGuns } from '../heli-guns.js';
import { SKID, heliPoint, seatPilot } from '../heli-mesh.js';
import { removeSearchlight, shine, showSearchlight } from '../searchlight.js';

// The police chopper, flown by the player once its pilot has been shot down (vehicles/heli.js). Arcade flight: the
// chopper turns to face where the mouse looks, and the keys move it the way they walk you: forward and back, and
// sideways, all at the same height. Space climbs and the wheelie key (C) descends. With nobody at the controls the
// rotors wind down and it drops; a hard landing, or coming down burning, wrecks it.
// v.y is the height of the skids (the ground under a landed chopper), so v.y + SKID is the middle of the cabin.
// See kinds/bike.js for what each field of a kind means.
export const FLY = {
  top: 24, boostTop: 38,  // m/s across the ground
  accel: 1.6,             // how fast it gets to the speed the keys ask for, per second
  climb: 10, sink: 9,     // m/s up and down
  vAccel: 3,
  turn: 2.4,              // rad/s it turns towards where the camera looks
  spinUp: 0.5,            // rotor speed gained per second at the controls (from standing, two seconds to full)
  spinDown: 0.25,         // and lost per second with nobody flying it
  liftAt: 0.8,            // rotor speed it needs to leave the ground
  ceiling: 150,           // the highest it climbs, m
  gravity: 14,            // falling with the rotors stopped (the blades still spinning slow it down)
  r: 2.2,                 // how wide the cabin is for bumping into buildings
  bump: 10,               // m/s into a wall above which it takes damage, `bumpDmg` per m/s over
  bumpDmg: 30,
  safeLand: 9,            // m/s down it can land at unhurt; above this it takes `landDmg` per m/s over
  landDmg: 40,
  wreckAt: 16,            // with nobody flying it, landing faster than this (or burning) is the end of it
  tilt: 0.28,             // how far it noses down at full speed, and banks into a sideways slide
  beamMax: 160,           // how far the searchlight reaches
};
// hit volumes, as for the police chopper: the cabin and the tail boom
const BODY_R = 3, TAIL_BACK = 4.4, TAIL_R = 1.6;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), BEAM = { x: 0, y: -0.8, z: 1.4 };

// the highest thing under (x, z) the skids at height y can stand on: the street, a roof, or a hut or air-con unit on one
export function floorUnder(x, z, y) {
  let f = Math.max(groundAt(x, z), surfaceAt(x, z, y).floor);
  for (const b of tallBoxes) if (b.h > f && b.h <= y + 0.6 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) f = b.h;
  return f;
}
// One step of flight for the controls c = { fwd, side, up, down, boost, yaw }: fwd and side are -1..1 along and
// across the chopper's heading, yaw is where it should turn to. Pure enough to test: it moves v and reports what it hit.
export function flyStep(v, dt, c) {
  v.rotor = Math.min(1, (v.rotor || 0) + dt * FLY.spinUp);
  const lift = v.rotor >= FLY.liftAt;
  if (lift) v.yaw += clamp(angDiff(v.yaw, c.yaw), -FLY.turn * dt, FLY.turn * dt);
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = -fz, rz = fx;
  let wx = fx * c.fwd + rx * c.side, wz = fz * c.fwd + rz * c.side; const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  const top = c.boost ? FLY.boostTop : FLY.top, grounded = v.landed && !(lift && c.up);
  if (!lift || grounded) wx = wz = 0; // it doesn't taxi: on the ground it sits until it lifts off
  const k = Math.min(1, dt * (grounded ? 8 : FLY.accel));
  v.vx = lerp(v.vx || 0, wx * top, k); v.vz = lerp(v.vz || 0, wz * top, k);
  if (lift) v.vy = lerp(v.vy || 0, c.up ? FLY.climb : c.down ? -FLY.sink : 0, Math.min(1, dt * FLY.vAccel));
  else v.vy = (v.vy || 0) - FLY.gravity * dt;
  return move(v, dt);
}
// move by the velocity, then out of buildings and down onto whatever is underneath. Returns { wall, land }: the speed
// it hit a wall at and the speed it came down at (0 when it didn't).
function move(v, dt) {
  const ox = v.x, oz = v.z;
  v.x += v.vx * dt; v.z += v.vz * dt; v.y += v.vy * dt;
  if (v.y > FLY.ceiling) { v.y = FLY.ceiling; v.vy = Math.min(0, v.vy); }
  let wall = 0;
  const o = { x: v.x, z: v.z };
  if (collide(o, FLY.r, v, v.y)) {
    // how fast it was going into whatever pushed it back, and none of that speed is left
    const px = o.x - v.x, pz = o.z - v.z, pl = Math.hypot(px, pz);
    if (pl > 1e-4) { const nx = px / pl, nz = pz / pl, into = -(v.vx * nx + v.vz * nz); if (into > 0) { wall = into; v.vx += nx * into; v.vz += nz * into; } }
    v.x = o.x; v.z = o.z;
    if (!wall && Math.hypot(v.x - ox, v.z - oz) < 1e-4) wall = 0;
  }
  const floor = floorUnder(v.x, v.z, v.y);
  let land = 0;
  if (v.y <= floor) { if (v.vy < 0) land = -v.vy; v.y = floor; v.vy = Math.max(0, v.vy); }
  v.landed = v.y - floor < 0.05; v.floor = floor;
  v.v = Math.hypot(v.vx, v.vz);
  return { wall, land };
}

export const heli = {
  flies: true,
  front: 2.6,
  verb: 'fly',
  handling: {},
  fx: { smokeRate: 5, smokeY: 1.8, smokeSpeed: 1.5, smokeLife: 2.4, smokeSize: 0.9, fireRate: 0.8, fireY: 1.4, fireSize: 0.5, spread: 1.1, fuse: 2.5, boomFuse: 0.3, crashFuse: 0 },
  blast: { y: 1, r: 12, dmg: 300 }, // as big as the police chopper's crash (CRASH_BLAST in vehicles/heli.js)
  wreckReward: { heat: 4, cash: 0 },
  bumper: { back: 0, front: 0, half: 0, slow: 1 },
  crash: { exitSpeed: Infinity, hurt: 0 },
  ram: { mass: 8, hull: [1.5, 1.6], heavierAt: 3, sameAt: Infinity }, // cars bounce off a chopper on the ground; the fire truck and the tank shove it
  shieldsDriver: true, // shots and blasts land on the chopper, not on the player in it
  camera: { dist: 14, aimDist: 10, height: 6, fovPerSpeed: 0.2, minArm: 5 }, // well up over the rotor, so the chopper sits below the crosshair
  laneHalf: 2.6, trafficDespawn: Infinity, reachMax: 1.8,
  tip: () => `The police chopper. Look where you want to go: it turns to face the mouse. <em>${kb('forward')}</em>/<em>${kb('back')}</em> forward and back, <em>${kb('left')}</em>/<em>${kb('right')}</em> sideways, <em>${kb('jump')}</em> climb, <em>${kb('wheelie')}</em> descend, <em>${kb('sprint')}</em> full speed. <em>1</em> minigun, <em>2</em> rockets (three a click). <em>${kb('ride')}</em> jumps out: the parachute opens by itself.`,

  init(v) { v.y = 0; v.vx = v.vz = v.vy = 0; v.rotor = 0; v.pitch = v.roll = 0; v.landed = true; v.floor = 0; },
  build(v) {
    const m = v.model.mesh(v);
    showSearchlight(m.light, false);
    return m;
  },
  pose(v, dt) {
    const m = v.mesh, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    // nose down going forward, banking into a sideways slide; level when it stands on the ground
    const fwd = (v.vx || 0) * fx + (v.vz || 0) * fz, side = (v.vx || 0) * -fz + (v.vz || 0) * fx;
    const k = dt ? Math.min(1, dt * 4) : 1, air = !v.landed;
    v.pitch = lerp(v.pitch || 0, air ? clamp(fwd / FLY.boostTop, -1, 1) * FLY.tilt : 0, k);
    v.roll = lerp(v.roll || 0, air ? clamp(side / FLY.boostTop, -1, 1) * FLY.tilt : 0, k);
    m.grp.position.set(v.x, v.y + SKID + (v.dead ? -0.3 : 0), v.z); m.grp.rotation.set(v.pitch, v.yaw, v.roll + (v.wreckRoll || 0), 'YXZ');
    m.rotor.rotation.y += dt * 30 * (v.rotor || 0); m.rotor2.rotation.y = m.rotor.rotation.y;
    m.lr.visible = !v.dead && v.driver === P && (G.time * 2 | 0) % 2 === 0;
    v.onRoof = v.y > 1; // a chopper set down on a roof can be got into from up there (game/interact.js)
    // the searchlight follows the crosshair, but never above the horizon
    const lit = v.driver === P && !v.dead && v.rotor > 0.3;
    if (m.light.beam.visible !== lit) showSearchlight(m.light, lit);
    if (lit) aimSearchlight(v, m.light);
    if (dt && !v.dead && !(v.burnT > 0) && v.hp < v.model.hp * 0.4 && Math.random() < dt * 8) emit(v.x, v.y + SKID + 0.6, v.z, 1, v.hp < v.model.hp * 0.2 ? '#2a2430' : '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
  },
  drive(v, dt, c) {
    const hit = flyStep(v, dt, c);
    if (hit.wall > FLY.bump) { v.damage((hit.wall - FLY.bump) * FLY.bumpDmg, false, true); cam.shake = Math.max(cam.shake, clamp(hit.wall / 30, 0.2, 0.7)); }
    if (hit.land > FLY.safeLand) { v.damage((hit.land - FLY.safeLand) * FLY.landDmg, false, true); cam.shake = Math.max(cam.shake, clamp(hit.land / 25, 0.2, 0.7)); }
    if (hit.land > 3) emit(v.x, v.y + 0.2, v.z, 10, '#cfc8d8', 4, 0.6, 0.4, 1, 1.2);
    // rotor wash kicks up dust close to the ground
    if (v.rotor > 0.5 && v.y - v.floor < 8 && Math.random() < dt * 14) { const a = rnd(0, 6.28); emit(v.x + Math.cos(a) * 4, v.floor + 0.2, v.z + Math.sin(a) * 4, 1, '#d8d0c4', 3, 0.7, 0.35, 0.5, 0.4); }
  },
  // the guns are the chopper's own while flying it (vehicles/heli-guns.js)
  guns: heliGuns,
  collideSelf(v) { const o = { x: v.x, z: v.z }, hit = collide(o, FLY.r, v, v.y); v.x = o.x; v.z = o.z; return hit; },
  ai: {},
  // with nobody at the controls: the rotors wind down and it settles, or drops out of the sky
  coast(v, dt) {
    v.rotor = Math.max(0, (v.rotor || 0) - dt * FLY.spinDown);
    if (v.landed && !v.vy) { v.vx = v.vz = 0; v.v = 0; return; }
    v.vy = (v.vy || 0) - FLY.gravity * (1 - 0.5 * v.rotor) * dt;
    v.vx *= Math.max(0, 1 - dt * 0.4); v.vz *= Math.max(0, 1 - dt * 0.4);
    if (!v.dead) v.yaw += dt * 1.2 * (1 - v.rotor);
    if (v.burnT > 0 && Math.random() < 0.6) emit(v.x, v.y + SKID, v.z, 1, '#3a3240', 2, 1.5, 0.8, 2, 1);
    const { land } = move(v, dt);
    if (!land) return;
    if (!v.dead && (land > FLY.wreckAt || v.burnT > 0)) { v.byPlayer = true; v.explode(); }
    else if (land > 3) emit(v.x, v.y + 0.2, v.z, 10, '#cfc8d8', 4, 0.6, 0.4, 1, 1.2);
  },
  seat(v, ch) { seatPilot(v.mesh.seat, ch); },
  unseat(v, ch) {
    scene.add(ch.root); ch.shadow.visible = true; ch.legL.geometry = ch.legR.geometry = ch.legGeo;
    ch.legL.rotation.set(0, 0, 0); ch.legR.rotation.set(0, 0, 0); ch.armL.rotation.set(0, 0, 0, 'XYZ'); ch.armR.rotation.set(0, 0, 0, 'XYZ');
  },
  aim() {},
  seatZ: () => 1.3,
  // out of the pilot's door, on its left
  exitAt: v => ({ x: v.x + Math.cos(v.yaw) * 2, z: v.z - Math.sin(v.yaw) * 2 }),
  airborne: v => v.y - floorUnder(v.x, v.z, v.y) > 2.5,
  hitBox() { return { hx: 2.4, hz: 2.4, h: 2.6 }; },
  raycast(v, o, d, maxT) {
    const y = v.y + SKID;
    let t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, v.x, y, v.z, BODY_R);
    t = Math.min(t, raySphere(o.x, o.y, o.z, d.x, d.y, d.z, v.x - Math.sin(v.yaw) * TAIL_BACK, y + 0.3, v.z - Math.cos(v.yaw) * TAIL_BACK, TAIL_R));
    return t < maxT ? { t } : null;
  },
  // people and cars walk round a chopper standing in the street; one in the air or up on a roof is out of their way
  pushOut(v, o, r) { return v.y < 1 && pushOutSeg(o, r + 0.9, v.x, v.z, v.yaw, -5.2, 2.4); },
  reach(v, p) { return Math.abs((p.y || 0) - v.y) > 2 ? Infinity : Math.max(0, Math.hypot(p.x - v.x, p.z - v.z) - 1.6); },
  knock(v, vx, vz, up) { v.vx = (v.vx || 0) + vx * 0.3; v.vz = (v.vz || 0) + vz * 0.3; if (!v.landed || up > 2) { v.vy = (v.vy || 0) + up * 0.3; v.landed = false; } },
  onDriverGone(v) { v.mode = 'parked'; },
  // taking the seat: the dead pilot is pulled out, the guns are loaded, and a parachute comes with the job
  onPlayerEnter(v) {
    const m = v.mesh; if (m.pilot) { m.seat.remove(m.pilot.root); m.pilot = null; }
    armHeli(v); v.landed = v.y - floorUnder(v.x, v.z, v.y) < 0.05;
    if (!P.chute) strapOnChute(true);
  },
  onPlayerExit(v) { v.mode = 'parked'; showSearchlight(v.mesh.light, false); },
  wreck(v) { v.wreckRoll = rnd(-0.3, 0.3); v.rotor = 0; v.landed = v.y - floorUnder(v.x, v.z, v.y) < 0.05; showSearchlight(v.mesh.light, false); },
  blip(v, radar) { radar.dot(v.x, v.z, '#8fd0ff', 10, false, 'sq'); },
  dispose(v) { removeSearchlight(v.mesh.light); },
};

// the beam from under the nose, along the line from there to what the crosshair is on, dipped to the horizon if that
// points above it; it lands on the street or a wall, or fades out FLY.beamMax away
function aimSearchlight(v, L) {
  heliPoint(v.x, v.y + SKID, v.z, v.yaw, BEAM, _o);
  _d.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  // where the crosshair ray meets the ground (or FLY.beamMax along it), seen from the lamp
  const c = camTarget, t = _d.y < -1e-3 ? Math.min(FLY.beamMax, (c.y - groundAt(c.x, c.z)) / -_d.y) : FLY.beamMax;
  _d.multiplyScalar(t).add(c).sub(_o);
  if (_d.y > 0) _d.y = 0;
  const len = _d.length(); if (len < 0.01) return;
  shine(L, _o, _d.divideScalar(len), FLY.beamMax, true);
}
