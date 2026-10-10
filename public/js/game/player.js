import { animateChar, deathAnim } from '../characters/character.js';
import { curWeapon, finishReload, playerShoot, selectWeapon } from '../combat/combat.js';
import { scopeFov, updateScope } from '../combat/scope.js';
import { landPlayerSwing, playerSwing } from '../combat/melee.js';
import { tickSwing } from '../characters/swing.js';
import { Sound } from '../core/audio.js';
import { emit } from '../core/events.js';
import { save } from '../core/save.js';
import { held } from '../core/controls.js';
import { settings } from '../core/settings.js';
import { G, I, P, cam, inv, stats } from '../core/state.js';
import { $, angDiff, clamp, clock, lerp, rnd } from '../core/util.js';
import { HEAR, beside } from '../core/spatial.js';
import { reloadOf } from '../data/reloads.js';
import { WBY, loadAll, loseFound, wStat } from '../data/weapons.js';
import { all, removeEntity } from '../entities/registry.js';
import { emit as emitFx } from '../render/effects.js';
import { faceTo, onFoot } from '../npcs/npc.js';
import { camera, canvasEl } from '../render/scene.js';
import { showBig, toast } from '../ui/hud.js';
import { removeHeli } from '../vehicles/heli.js';
import { removeTank } from '../vehicles/tank.js';
import { removeUfo } from '../vehicles/ufo.js';
import { answersHeat, driveByPlayer, sirenOn } from '../vehicles/vehicle.js';
import { SPAWN } from '../world/city.js';
import { collide, wallHit } from '../world/collision.js';
import { ceilingAt, collideRoofs, surfaceAt } from '../world/rooftops.js';
import { BAIL, bailDamage, bailLaunch, tumbleStep } from './bailout.js';
import { PITCH_MAX, PITCH_MIN, cameraRoof, stepArm, stepShoulder } from './camera.js';
import { JET, jetFx, jetStep, refuel, takeOffJetpack } from './jetpack.js';
import { PARA, chuteFx, chuteStep, dropChute, openChute, opensChute, strapOnChute } from './parachute.js';
import { updateInteraction } from './interact.js';
import { resetTool, updateTool } from './repair.js';

// ================= PLAYER =================
export const camTarget = new THREE.Vector3();
export function updatePlayer(dt) {
  if (!P.alive) { fallDead(dt); deathAnim(P, dt); P.c.root.position.set(P.x, P.y, P.z); P.c.root.rotation.y = P.yaw; return; }
  // look
  // through the scope the mouse slows with the zoom, so the crosshair moves as far on screen as it does unzoomed
  const sens = (G.scope ? 0.0022 * scopeFov(1, G.scope) : I.mouseR ? 0.0013 : 0.0022) * settings.sensitivity, sensY = settings.invertY ? -sens : sens;
  if (I.mouseDX || I.mouseDY) P.lookT = G.time;
  cam.yaw -= I.mouseDX * sens; cam.pitch = clamp(cam.pitch - I.mouseDY * sensY, PITCH_MIN, PITCH_MAX); I.mouseDX = I.mouseDY = 0;
  const aimingNow = I.mouseR || G.scope > 0 || I.mouseL || I.clickQ > 0 || G.time - P.lastShot < 0.7;
  P.aiming = aimingNow;
  P.aimPitch = cam.pitch;
  const v = P.vehicle;
  if (v) {
    driveByPlayer(v, dt);
    if (P.vehicle) v.K.aim(v, P.c, aimingNow ? clamp(angDiff(v.yaw, cam.yaw), -2.4, 2.4) : null, cam.pitch);
  } else if (P.tumble) tumble(dt); else walk(dt, aimingNow);
  // weapon: a chopper fires its own guns (vehicles/heli-guns.js), and what's in hand waits until the player is out
  if (P.vehicle && P.vehicle.K.guns) { P.reload = null; P.vehicle.K.guns(P.vehicle, dt); } else handWeapon(dt);
  if (!P.vehicle) {
    // separation from people
    for (const a of all('npc')) { if (!onFoot(a) || P.y > 1) continue; const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz); if (d < 0.75 && d > 0.001) { const k = (0.75 - d) * 0.5; a.x += dx / d * k; a.z += dz / d * k; P.x -= dx / d * k; P.z -= dz / d * k; } }
    animateChar(P, dt);
    P.c.root.position.set(P.x, P.floor || 0, P.z); P.c.root.rotation.y = P.yaw;
    if (P.tumble) rollPose(-P.tumble.roll); // rolling out towards the body's +x side turns it the negative way round z
  }
  jetFx(); chuteFx(dt); updateTool(dt);
  updateInteraction();
}
function handWeapon(dt) {
  const w = curWeapon(), st = wStat(w, inv.lvl[w.id] || 0);
  if (G.reloadT > 0) { G.reloadT -= dt; if (G.reloadT <= 0) { G.reloadT = 0; finishReload(); } }
  P.reload = G.reloadT > 0 ? { anim: reloadOf(w.id).anim, u: 1 - G.reloadT / w.reload } : null;
  G.fireCd -= dt;
  if (w.spin) G.spin = (I.mouseL || I.clickQ > 0) ? Math.min(1, G.spin + dt * 2.5) : Math.max(0, G.spin - dt * 2);
  I.clickQ = Math.max(0, I.clickQ - dt);
  if (P.tumble) P.swing = null; // no fighting while rolling down the road
  else if (w.tool) {} // the repair tool works from updateTool (game/repair.js)
  else if (w.melee) {
    // hold or click to keep swinging; nothing to swing at from the saddle
    if (P.vehicle) P.swing = null;
    else if ((I.mouseL || I.clickQ > 0) && G.fireCd <= 0 && G.state === 'play') { playerSwing(w, st); I.clickQ = 0; }
    if (P.swing) tickSwing(P, dt, landPlayerSwing);
  } else if ((I.mouseL || I.clickQ > 0) && G.fireCd <= 0 && G.state === 'play') {
    if (w.auto ? (I.mouseL || I.clickQ > 0) : I.clickQ > 0) { if (!w.spin || G.spin >= 1) { playerShoot(); I.clickQ = 0; } else G.fireCd = 0.05; }
  }
  if (P.c.gun && w.spin && G.spin > 0) P.c.gun.rotation.y += dt * G.spin * 40;
}
const JUMP_V = 7.6, GRAVITY = 18; // m/s, m/s²
const AIR_JUMP_V = 7; // the second jump, pushed off thin air
// Landing harder than SAFE_LAND m/s (a drop of about 5 m) hurts, LAND_HURT hit points for every m/s over it:
// a 10 m drop costs about 20, a fall from 30 m (a tall roof) about 80, and a 45 m one is the end.
export const SAFE_LAND = 13.5, LAND_HURT = 4;
export const landDamage = vy => Math.max(0, -vy - SAFE_LAND) * LAND_HURT;
// Feet and floors: P.y is the height of the feet above the street, P.floor the top they are over (the street, a roof,
// or a hut or air-con unit on one; world/rooftops.js), P.roof the roof that top is on (null in the street).
function walk(dt, aimingNow) {
  let ix = 0, iz = 0;
  if (!G.stairs) { // standing still while the screen is black
    if (held('forward')) iz += 1; if (held('back')) iz -= 1;
    if (held('left')) ix -= 1; if (held('right')) ix += 1;
  }
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
  let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix; const ml = Math.hypot(mx, mz);
  const sprint = held('sprint') && !I.mouseR && iz >= 0;
  const flying = P.jetpack && !P.grounded;
  const speed = P.chute && P.chute.open ? PARA.air : flying ? JET.air : (sprint ? 8.2 : 5.0) * (P.swing ? 0.6 : 1); // a swing slows you down
  if (ml > 0) { mx /= ml; mz /= ml; }
  P.vx = lerp(P.vx || 0, mx * speed, Math.min(1, dt * 12)); P.vz = lerp(P.vz || 0, mz * speed, Math.min(1, dt * 12));
  const ox = P.x, oz = P.z; P.x += P.vx * dt; P.z += P.vz * dt;
  // buildings and props stop the feet only where they reach up to them; railings only while the feet are below the top rail
  collide(P, 0.38, null, P.y); collideRoofs(P, 0.38, P.y);
  P.moveSpeed = Math.hypot(P.x - ox, P.z - oz) / Math.max(dt, 1e-4);
  const { floor, roof } = surfaceAt(P.x, P.z, P.y);
  P.floor = floor; P.roof = roof;
  if (P.grounded) {
    if (P.y > floor + 0.05) { P.grounded = false; P.vy = 0; P.jumps = 1; } // walked off an edge: one jump left in the air
    else P.y = floor; // stepped up or down a little
  }
  // jump, and once more in the air (v²/2g puts the top of the first at about 1.6 m); with the jetpack, hold Space to fly;
  // with a parachute packed, Space in the air opens it once the jump can't do anything else (game/parachute.js)
  const space = held('jump') && !G.stairs, press = space && !P.spaceHeld; P.spaceHeld = space;
  if (press && P.grounded) { P.vy = JUMP_V; P.grounded = false; P.jumps = 1; }
  else if (press && opensChute(P.chute, P.jumps || 0, P.vy, P.jetpack && P.jetpack.fuel > 0)) openChute();
  else if (press && (P.jumps || 0) < 2) { P.vy = Math.max(P.vy, AIR_JUMP_V); P.jumps = 2; }
  if (!P.grounded) {
    if (P.chute && P.chute.open) P.vy = chuteStep(P.vy, dt, GRAVITY);
    else if (P.jetpack) P.vy = jetStep(P.jetpack, P.vy, space && !press, dt, GRAVITY);
    else P.vy -= GRAVITY * dt;
    const head = ceilingAt(P.x, P.z, P.y) - 1.8;
    P.y += P.vy * dt;
    if (P.vy > 0 && P.y > head) { P.y = Math.max(floor, head); P.vy = 0; } // bumped the head on something overhead
    if (P.y <= floor) land(floor);
  } else if (P.jetpack) refuel(P.jetpack, dt);
  P.jumpY = P.y - floor;
  // facing and aim
  if (aimingNow) faceTo(P, cam.yaw, dt, 20);
  else if (ml > 0) faceTo(P, Math.atan2(mx, mz), dt, 10);
}
// feet down on a floor: a hard landing hurts
function land(floor) {
  const hurt = landDamage(P.vy);
  P.y = floor; P.vy = 0; P.grounded = true; P.jumps = 0;
  if (P.chute && P.chute.open) dropChute(); // one jump only
  if (hurt > 0) { Sound.thud(0.6, beside(0, 0), HEAR.near); emitFx(P.x, floor + 0.15, P.z, 8, '#cfc8d8', 2.5, 0.45, 0.22, 1, 1); hurtPlayer(hurt); cam.shake = Math.max(cam.shake, 0.35); }
}
// a body falls the rest of the way down to whatever is under it
function fallDead(dt) {
  if (P.vehicle || P.tumble) return;
  const { floor } = surfaceAt(P.x, P.z, P.y);
  if (P.y > floor) { P.vy = Math.min(0, P.vy || 0) - GRAVITY * dt; P.y = Math.max(floor, P.y + P.vy * dt); } else { P.y = floor; P.vy = 0; }
  P.floor = floor;
}

// thrown out of a moving vehicle (see bailout.js): no control until the player has rolled to a stop and is back up
function tumble(dt) {
  const T = P.tumble, air = P.y > 0 || P.vy > 0;
  const going = tumbleStep(P, T, dt);
  if (collide(P, 0.38)) { P.vx *= 0.6; P.vz *= 0.6; }
  if (air && P.y === 0 && P.vy === 0) { Sound.thud(0.35, beside(0, 0), HEAR.near); emitFx(P.x, 0.15, P.z, 6, '#cfc8d8', 2, 0.4, 0.2, 1, 1); }
  P.moveSpeed = 0; P.jumpY = P.y; P.grounded = false;
  if (!going) { P.tumble = null; P.vx = P.vz = P.vy = 0; P.y = 0; P.jumpY = 0; P.grounded = true; rollPose(0); }
}
// roll the body sideways round its middle rather than its feet
function rollPose(roll) {
  const b = P.c.body, h = 0.9;
  b.rotation.z = roll; b.position.x = h * Math.sin(roll); b.position.y += h * (1 - Math.cos(roll));
}
// which side to bail out of: the door side unless a wall is right there
function bailSide(v, reach) {
  const free = s => wallHit(v.x, 1, v.z, Math.cos(v.yaw) * s, 0, -Math.sin(v.yaw) * s, reach);
  return free(1) >= reach || free(1) >= free(-1) ? 1 : -1;
}

// ---- getting on and off vehicles ----
const told = {};
export function enterVehicle(v) {
  P.vehicle = v; v.driver = P; v.mode = 'player'; v.K.onPlayerEnter(v);
  if (v.model.siren) v.siren = sirenOn(v); // the siren is the player's to switch now, starting as it was
  v.K.seat(v, P.c); P.x = v.x; P.z = v.z; P.y = 0; P.floor = 0; P.roof = null; P.vy = 0; P.grounded = true; P.lookT = -9;
  $('prompt').hidden = true; G.hudCache = ''; $('vehName').textContent = v.model.short; $('vehSiren').hidden = !v.model.siren; $('vehWheelie').hidden = !v.K.wheelie;
  if (!told[v.model.id]) { told[v.model.id] = true; toast(v.K.tip(v.model), 7); }
  emit('vehicle:enter', { vehicle: v });
}
export function exitVehicle(crash) {
  const v = P.vehicle; if (!v) return;
  P.vehicle = null; v.driver = null; v.K.unseat(v, P.c);
  if (v.K.airborne && v.K.airborne(v)) { jumpOut(v, crash); return; }
  // still moving fast: bail out sideways, away from the vehicle and clear of its path, and take a few knocks
  const vx = P.vx || 0, vz = P.vz || 0, sp = Math.max(Math.abs(v.v), Math.hypot(vx, vz)), fast = sp > v.K.crash.exitSpeed && P.alive;
  const door = v.K.exitAt(v), dx = door.x - v.x, dz = door.z - v.z, side = fast ? bailSide(v, Math.hypot(dx, dz) + 1.2) : 1;
  P.x = v.x + dx * side; P.z = v.z + dz * side; collide(P, 0.38, v);
  // a chopper may stand on a roof: step out onto that
  const base = v.K.flies ? surfaceAt(P.x, P.z, v.y + 0.3) : { floor: 0, roof: null };
  P.y = base.floor; P.floor = base.floor; P.roof = base.roof; P.vy = 0; P.grounded = true; P.yaw = v.yaw; P.vx = P.vz = 0; P.moveSpeed = 0;
  P.c.root.position.set(P.x, base.floor, P.z); P.c.root.rotation.y = P.yaw;
  v.K.onPlayerExit(v, crash, sp, side);
  if (fast) {
    const T = P.tumble = bailLaunch(v.yaw, vx, vz, side);
    P.vx = T.vx; P.vz = T.vz; P.vy = T.vy; P.grounded = false;
    P.bailFrom = v; P.bailT = G.time + BAIL.ghost; // the vehicle rolls on past without running into them
    hurtPlayer(bailDamage(sp, v.K.crash.exitSpeed)); cam.shake = Math.max(cam.shake, 0.3);
  }
  G.hudCache = '';
  emit('vehicle:exit', { vehicle: v, crash });
}

// Out of a chopper up in the air: straight out of the door, no tumble, and the parachute that comes with flying it
// (kinds/heli.js) opens at once. The chopper drops away without them (see coast in kinds/heli.js).
function jumpOut(v, crash) {
  const door = v.K.exitAt(v);
  P.x = door.x; P.z = door.z; P.y = v.y + 0.2; P.vx = (v.vx || 0) * 0.6; P.vz = (v.vz || 0) * 0.6; P.vy = Math.min(0, v.vy || 0);
  P.grounded = false; P.jumps = 2; P.yaw = v.yaw; P.moveSpeed = 0; P.tumble = null;
  const { floor, roof } = surfaceAt(P.x, P.z, P.y); P.floor = floor; P.roof = roof; P.jumpY = P.y - floor;
  P.c.root.position.set(P.x, floor, P.z); P.c.root.rotation.y = P.yaw;
  v.K.onPlayerExit(v, crash, 0, 1);
  P.bailFrom = v; P.bailT = G.time + BAIL.ghost;
  if (P.alive) { strapOnChute(true); openChute(); }
  G.hudCache = '';
  emit('vehicle:exit', { vehicle: v, crash });
}

// the vehicle whose cab keeps the player at the wheel from harm (the fire engine: its kind has shieldsDriver), or null
export const shieldingCab = () => P.vehicle?.K.shieldsDriver ? P.vehicle : null;

// zone: where a bullet landed (combat/hitzones.js); a shot to the head rocks the camera harder.
// Behind the wheel of a shielding cab nothing reaches the player: the hit lands on the vehicle instead.
export function hurtPlayer(d, zone) {
  if (!P.alive || G.state !== 'play') return;
  const cab = shieldingCab(); if (cab) { if (d > 0) cab.damage(d, false); return; }
  if (P.armor > 0) { const a = Math.min(P.armor, d * 0.7); P.armor -= a; d -= a; }
  P.hp -= d; Sound.hurt(); cam.shake = Math.max(cam.shake, zone === 'head' ? 0.4 : 0.15);
  const vg = $('vignette'); vg.style.opacity = '1'; clearTimeout(hurtPlayer.t); hurtPlayer.t = setTimeout(() => { vg.style.opacity = '0'; }, 140);
  emitFx(P.x, P.y + 1.2, P.z, 4, '#b3122a', 3, 0.5, 0.08);
  if (P.hp <= 0) die();
}

const arm = { arm: 0, lift: 0, pitch: 0, look: 30, side: 1 };
export function updateCamera(dt) {
  updateScope();
  const v = P.vehicle, C = v && v.K.camera, aim = I.mouseR && P.alive, sp = v ? Math.abs(v.v) : 0;
  cam.dist = lerp(cam.dist, aim ? (C ? C.aimDist : 2.4) : (C ? C.dist : 4.6), Math.min(1, dt * 10));
  cam.fov = lerp(cam.fov, aim ? settings.fov - 18 : settings.fov + Math.min(14, sp * (C ? C.fovPerSpeed : 0)), Math.min(1, dt * 10));
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  const cp = Math.cos(cam.pitch), d = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  const right = new THREE.Vector3(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  camTarget.set(P.x, (P.alive ? P.y : 0) + (C ? C.height : 1.62), P.z);
  cameraRoof(P.roof);
  camTarget.addScaledVector(right, stepShoulder(arm, camTarget.x, camTarget.y, camTarget.z, cam.yaw, cam.pitch, aim ? 0.7 : 0.55, cam.dist, dt));
  stepArm(arm, camTarget.x, camTarget.y, camTarget.z, cam.yaw, cam.pitch, cam.dist, C ? C.minArm : 1.4, dt);
  const ap = Math.cos(arm.pitch);
  camera.position.set(camTarget.x - Math.sin(cam.yaw) * ap * arm.arm, camTarget.y - Math.sin(arm.pitch) * arm.arm, camTarget.z - Math.cos(cam.yaw) * ap * arm.arm);
  if (camera.position.y < 0.3) camera.position.y = 0.3;
  // through a scope the camera sits on the shot line (camTarget) and the player's own model is hidden
  const scoped = G.scope > 0; P.c.root.visible = !scoped || !P.alive;
  if (scoped) { camera.position.copy(camTarget); cam.fov = scopeFov(settings.fov, G.scope); if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); } }
  if (cam.shake > 0) { const k = settings.shake ? cam.shake * 0.3 : 0; camera.position.x += rnd(-1, 1) * k; camera.position.y += rnd(-1, 1) * k; cam.shake = Math.max(0, cam.shake - dt * 2.5); }
  camera.lookAt(camTarget.x + d.x * arm.look, camTarget.y + d.y * arm.look, camTarget.z + d.z * arm.look);
}
export function die() {
  if (P.tumble) { P.tumble = null; rollPose(0); }
  P.alive = false; P.deadT = 0; P.aiming = false; P.hp = 0; G.state = 'dead'; G.deadT = 0; I.mouseL = false; I.mouseR = false;
  if (P.vehicle) exitVehicle(true);
  dropChute(); // a parachute, packed or open, goes with the paramedics too
  const fee = Math.min(inv.money, Math.round(inv.money * 0.1));
  // picked-up weapons go with the paramedics; only what was bought at the gun shop is still there
  const lost = loseFound(inv).map(id => WBY[id].name);
  if (!inv.owned[inv.cur]) selectWeapon('pistol');
  inv.money -= fee; save();
  $('wastedInfo').textContent = (fee > 0 ? `Hospital bill: $${fee.toLocaleString()}` : 'Patched up for free. Lucky you.') + (lost.length ? ` Lost: ${lost.join(', ')}.` : '')
    + (G.wanted >= 5 ? `\nFive star heat: ${clock(G.fiveRun)} this time, ${clock(stats.fiveStar)} all told.` : '');
  $('wasted').hidden = false; canvasEl.style.filter = 'grayscale(0.85) contrast(1.1)';
  $('prompt').hidden = true;
  Sound.hush();
  emit('player:died', { fee });
}
export function respawn() {
  for (const e of all()) if ((e.kind === 'npc' && e.faction === 'law') || answersHeat(e) || (e.kind === 'vehicle' && e.dead)) removeEntity(e);
  removeHeli(); removeTank(null, true); removeUfo(null);
  G.wanted = 0; G.heat = 0; G.lostT = 0; G.heliT = 15; G.tankT = 6; G.fiveT = 0; G.ufoT = 2;
  P.x = SPAWN.x; P.z = SPAWN.z; P.y = 0; P.floor = 0; P.vy = 0; P.grounded = true; P.roof = null; P.hp = 100; P.alive = true; P.deadT = 0; P.yaw = SPAWN.yaw; cam.yaw = SPAWN.yaw; cam.pitch = -0.08;
  P.c.body.rotation.x = 0; P.c.body.position.y = 0; P.swing = null;
  loadAll(inv); resetTool(); G.reloadT = 0;
  takeOffJetpack(); // found, not bought: it waits on the Belpaire again
  $('wasted').hidden = true; canvasEl.style.filter = '';
  G.state = 'play'; showBig('City General discharged you');
}
