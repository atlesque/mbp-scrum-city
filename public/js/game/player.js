import { animateChar, deathAnim } from '../characters/character.js';
import { curWeapon, finishReload, playerShoot } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { emit } from '../core/events.js';
import { save } from '../core/save.js';
import { settings } from '../core/settings.js';
import { G, I, P, cam, inv, keys } from '../core/state.js';
import { $, angDiff, clamp, lerp, rnd } from '../core/util.js';
import { reloadOf } from '../data/reloads.js';
import { loadAll, wStat } from '../data/weapons.js';
import { all, removeEntity } from '../entities/registry.js';
import { emit as emitFx } from '../render/effects.js';
import { faceTo, onFoot } from '../npcs/npc.js';
import { camera, canvasEl } from '../render/scene.js';
import { showBig, toast } from '../ui/hud.js';
import { removeHeli } from '../vehicles/heli.js';
import { driveByPlayer } from '../vehicles/vehicle.js';
import { SPAWN } from '../world/city.js';
import { collide, wallHit } from '../world/collision.js';
import { updateInteraction } from './interact.js';

// ================= PLAYER =================
export const camTarget = new THREE.Vector3();
export function updatePlayer(dt) {
  if (!P.alive) { deathAnim(P, dt); P.c.root.position.set(P.x, 0, P.z); P.c.root.rotation.y = P.yaw; return; }
  // look
  const sens = (I.mouseR ? 0.0013 : 0.0022) * settings.sensitivity, sensY = settings.invertY ? -sens : sens;
  if (I.mouseDX || I.mouseDY) P.lookT = G.time;
  cam.yaw -= I.mouseDX * sens; cam.pitch = clamp(cam.pitch - I.mouseDY * sensY, -1.0, 1.15); I.mouseDX = I.mouseDY = 0;
  const aimingNow = I.mouseR || I.mouseL || I.clickQ > 0 || G.time - P.lastShot < 0.7;
  P.aiming = aimingNow;
  P.aimPitch = cam.pitch;
  const v = P.vehicle;
  if (v) {
    driveByPlayer(v, dt);
    if (P.vehicle) v.K.aim(v, P.c, aimingNow ? clamp(angDiff(v.yaw, cam.yaw), -2.4, 2.4) : null, cam.pitch);
  } else walk(dt, aimingNow);
  // weapon
  const w = curWeapon(), st = wStat(w, inv.lvl[w.id] || 0);
  if (G.reloadT > 0) { G.reloadT -= dt; if (G.reloadT <= 0) { G.reloadT = 0; finishReload(); } }
  P.reload = G.reloadT > 0 ? { anim: reloadOf(w.id).anim, u: 1 - G.reloadT / w.reload } : null;
  G.fireCd -= dt;
  if (w.spin) G.spin = (I.mouseL || I.clickQ > 0) ? Math.min(1, G.spin + dt * 2.5) : Math.max(0, G.spin - dt * 2);
  I.clickQ = Math.max(0, I.clickQ - dt);
  if ((I.mouseL || I.clickQ > 0) && G.fireCd <= 0 && G.state === 'play') {
    if (w.auto ? (I.mouseL || I.clickQ > 0) : I.clickQ > 0) { if (!w.spin || G.spin >= 1) { playerShoot(); I.clickQ = 0; } else G.fireCd = 0.05; }
  }
  if (P.c.gun && w.spin && G.spin > 0) P.c.gun.rotation.y += dt * G.spin * 40;
  if (!P.vehicle) {
    // separation from people
    for (const a of all('npc')) { if (!onFoot(a)) continue; const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz); if (d < 0.75 && d > 0.001) { const k = (0.75 - d) * 0.5; a.x += dx / d * k; a.z += dz / d * k; P.x -= dx / d * k; P.z -= dz / d * k; } }
    animateChar(P, dt);
    P.c.root.position.set(P.x, 0, P.z); P.c.root.rotation.y = P.yaw;
  }
  updateInteraction();
}
function walk(dt, aimingNow) {
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1; if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
  let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix; const ml = Math.hypot(mx, mz);
  const sprint = (keys.ShiftLeft || keys.ShiftRight) && !I.mouseR && iz >= 0;
  const speed = sprint ? 8.2 : 5.0;
  if (ml > 0) { mx /= ml; mz /= ml; }
  P.vx = lerp(P.vx || 0, mx * speed, Math.min(1, dt * 12)); P.vz = lerp(P.vz || 0, mz * speed, Math.min(1, dt * 12));
  const ox = P.x, oz = P.z; P.x += P.vx * dt; P.z += P.vz * dt; collide(P, 0.38);
  P.moveSpeed = Math.hypot(P.x - ox, P.z - oz) / Math.max(dt, 1e-4);
  // jump
  if (keys.Space && P.grounded) { P.vy = 6.2; P.grounded = false; }
  if (!P.grounded) { P.vy -= 18 * dt; P.y += P.vy * dt; if (P.y <= 0) { P.y = 0; P.vy = 0; P.grounded = true; } }
  P.jumpY = P.y;
  // facing and aim
  if (aimingNow) faceTo(P, cam.yaw, dt, 20);
  else if (ml > 0) faceTo(P, Math.atan2(mx, mz), dt, 10);
}

// ---- getting on and off vehicles ----
const told = {};
export function enterVehicle(v) {
  P.vehicle = v; v.driver = P; v.mode = 'player'; v.K.onPlayerEnter(v);
  v.K.seat(v, P.c); P.x = v.x; P.z = v.z; P.y = 0; P.vy = 0; P.grounded = true; P.lookT = -9;
  $('prompt').hidden = true; G.hudCache = ''; $('vehName').textContent = v.model.short;
  if (!told[v.model.id]) { told[v.model.id] = true; toast(v.K.tip(v.model), 7); }
  emit('vehicle:enter', { vehicle: v });
}
export function exitVehicle(crash) {
  const v = P.vehicle; if (!v) return;
  P.vehicle = null; v.driver = null; v.K.unseat(v, P.c);
  const sp = Math.abs(v.v), at = v.K.exitAt(v);
  P.x = at.x; P.z = at.z; collide(P, 0.38);
  P.y = 0; P.vy = 0; P.grounded = true; P.yaw = v.yaw; P.vx = P.vz = 0; P.moveSpeed = 0;
  P.c.root.position.set(P.x, 0, P.z); P.c.root.rotation.y = P.yaw;
  v.K.onPlayerExit(v, crash, sp);
  if (sp > v.K.crash.exitSpeed) hurtPlayer(Math.min(60, sp * 1.1));
  G.hudCache = '';
  emit('vehicle:exit', { vehicle: v, crash });
}

// zone: where a bullet landed (combat/hitzones.js); a shot to the head rocks the camera harder
export function hurtPlayer(d, zone) {
  if (!P.alive || G.state !== 'play') return;
  if (P.armor > 0) { const a = Math.min(P.armor, d * 0.7); P.armor -= a; d -= a; }
  P.hp -= d; Sound.hurt(); cam.shake = Math.max(cam.shake, zone === 'head' ? 0.4 : 0.15);
  const vg = $('vignette'); vg.style.opacity = '1'; clearTimeout(hurtPlayer.t); hurtPlayer.t = setTimeout(() => { vg.style.opacity = '0'; }, 140);
  emitFx(P.x, P.y + 1.2, P.z, 4, '#b3122a', 3, 0.5, 0.08);
  if (P.hp <= 0) die();
}

export function updateCamera(dt) {
  const v = P.vehicle, C = v && v.K.camera, aim = I.mouseR && P.alive, sp = v ? Math.abs(v.v) : 0;
  cam.dist = lerp(cam.dist, aim ? (C ? C.aimDist : 2.4) : (C ? C.dist : 4.6), Math.min(1, dt * 10));
  cam.fov = lerp(cam.fov, aim ? settings.fov - 18 : settings.fov + Math.min(14, sp * (C ? C.fovPerSpeed : 0)), Math.min(1, dt * 10));
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  const cp = Math.cos(cam.pitch), d = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  const right = new THREE.Vector3(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  camTarget.set(P.x, (P.alive ? P.y : 0) + (C ? C.height : 1.62), P.z).addScaledVector(right, aim ? 0.7 : 0.55);
  let dist = cam.dist;
  const back = d.clone().negate(), tw = wallHit(camTarget.x, camTarget.y, camTarget.z, back.x, back.y, back.z, dist + 0.3);
  if (tw < dist + 0.3) dist = Math.max(0.6, tw - 0.3);
  camera.position.copy(camTarget).addScaledVector(d, -dist);
  if (camera.position.y < 0.3) camera.position.y = 0.3;
  if (cam.shake > 0) { const k = settings.shake ? cam.shake * 0.3 : 0; camera.position.x += rnd(-1, 1) * k; camera.position.y += rnd(-1, 1) * k; cam.shake = Math.max(0, cam.shake - dt * 2.5); }
  camera.lookAt(camTarget.x + d.x * 30, camTarget.y + d.y * 30, camTarget.z + d.z * 30);
}
export function die() {
  P.alive = false; P.deadT = 0; P.aiming = false; P.hp = 0; G.state = 'dead'; G.deadT = 0; I.mouseL = false; I.mouseR = false;
  if (P.vehicle) exitVehicle(true);
  const fee = Math.min(inv.money, Math.round(inv.money * 0.1));
  inv.money -= fee; save();
  $('wastedInfo').textContent = fee > 0 ? `Hospital bill: $${fee.toLocaleString()}` : 'Patched up for free. Lucky you.';
  $('wasted').hidden = false; canvasEl.style.filter = 'grayscale(0.85) contrast(1.1)';
  $('prompt').hidden = true;
  Sound.hush();
  emit('player:died', { fee });
}
export function respawn() {
  for (const e of all()) if ((e.kind === 'npc' && e.faction === 'law') || (e.kind === 'vehicle' && (e.model.police || e.dead))) removeEntity(e);
  removeHeli();
  G.wanted = 0; G.heat = 0; G.lostT = 0; G.heliT = 15;
  P.x = SPAWN.x; P.z = SPAWN.z; P.y = 0; P.hp = 100; P.alive = true; P.deadT = 0; P.yaw = SPAWN.yaw; cam.yaw = SPAWN.yaw; cam.pitch = -0.08;
  P.c.body.rotation.x = 0; P.c.body.position.y = 0;
  loadAll(inv); G.reloadT = 0;
  $('wasted').hidden = true; canvasEl.style.filter = '';
  G.state = 'play'; showBig('City General discharged you');
}
