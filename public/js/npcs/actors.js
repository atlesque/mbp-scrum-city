import { HAIR, SKIN, animateChar, deathAnim, disposeChar, gunGeo, makeCharacter, randomLook, setGun } from '../characters/character.js';
import { Sound } from '../core/audio.js';
import { G, P, cam, enemies, peds } from '../core/state.js';
import { $, angDiff, clamp, lerp, pick, rnd } from '../core/util.js';
import { ENEMY } from '../data/enemies.js';
import { die } from '../game/player.js';
import { emit, muzzleFlash, tracer } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { blocked, collide, isFree, onRoad } from '../world/collision.js';

// ================= ACTORS =================
export function findSpot(minD, maxD, avoidView, allowRoad) {
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, Math.PI * 2), d = rnd(minD, maxD), x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    if (!isFree(x, z, 1)) continue;
    if (!allowRoad && onRoad(x, z) && i < 22) continue;
    if (avoidView && i < 20 && (Math.cos(a) * fx + Math.sin(a) * fz) > 0.35) continue;
    return { x, z };
  }
  return null;
}
export function spawnPed(x, z) {
  const look = randomLook(), c = makeCharacter(look);
  const a = { kind: 'ped', c, x, z, yaw: rnd(0, 6.28), hp: 40, alive: true, state: 'walk', tx: x, tz: z, timer: 0, stuck: 0, moveSpeed: 0, deadT: 0, panic: false };
  c.root.position.set(x, 0, z); scene.add(c.root); peds.push(a); return a;
}
export function spawnEnemy(type, x, z) {
  const def = ENEMY[type], look = Object.assign({ skin: pick(SKIN), hair: pick(HAIR), hairStyle: 'short', shoes: '#15141a' }, def.look);
  if (!look.skin) look.skin = pick(SKIN);
  if (type === 'cop') look.glasses = Math.random() < 0.5;
  look.scale = def.scale;
  const c = makeCharacter(look); setGun(c, def.gun);
  const e = { kind: 'enemy', type, def, c, x, z, yaw: 0, hp: def.hp, alive: true, los: false, losT: 0, fireT: rnd(0.8, 1.6), burst: 0, burstT: 0, moveSpeed: 0, deadT: 0, aiming: false, aimPitch: 0, twoHand: def.gun !== 'pistol', strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rnd(1, 3), stuck: 0, detourT: 0, dx: 0, dz: 0, leaving: false, r: def.scale ? 0.5 : 0.38 };
  c.root.position.set(x, 0, z); scene.add(c.root); enemies.push(e); return e;
}
export function removeActor(list, a) { const i = list.indexOf(a); if (i >= 0) list.splice(i, 1); disposeChar(a.c); }
function moveActor(a, dx, dz, speed, dt, r) {
  const ox = a.x, oz = a.z;
  a.x += dx * speed * dt; a.z += dz * speed * dt;
  collide(a, r || 0.38);
  const moved = Math.hypot(a.x - ox, a.z - oz);
  a.moveSpeed = lerp(a.moveSpeed, moved / Math.max(dt, 1e-4), 0.3);
  return moved < speed * dt * 0.35;
}
export function faceTo(a, yaw, dt, rate) { a.yaw += angDiff(a.yaw, yaw) * Math.min(1, dt * (rate || 10)); }
export function alarm(x, z, r) {
  for (const p of peds) if (p.alive && p.state !== 'flee') {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < r) { p.state = 'flee'; p.timer = rnd(6, 10); p.fx = x; p.fz = z; p.panic = Math.random() < 0.7; if (Math.random() < 0.25) Sound.scream(vol3d(p.x, p.z) * 0.6, pan3d(p.x, p.z)); }
  }
}
export function vol3d(x, z) { const d = Math.hypot(x - P.x, z - P.z); return clamp(1 - d / 110, 0, 1) ** 1.5; }
export function pan3d(x, z) { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1; return clamp((dx * -Math.cos(cam.yaw) + dz * Math.sin(cam.yaw)) / d, -1, 1) * 0.8; }

export function updatePed(a, dt) {
  if (!a.alive) {
    if (a.svx || a.svz) { a.x += a.svx * dt; a.z += a.svz * dt; const k = Math.max(0, 1 - dt * 2.5); a.svx *= k; a.svz *= k; if (Math.abs(a.svx) + Math.abs(a.svz) < 0.2) a.svx = a.svz = 0; collide(a, 0.3); }
    deathAnim(a, dt); a.c.root.position.set(a.x, 0, a.z); a.c.root.rotation.y = a.yaw; return;
  }
  let speed = 1.4, dx = 0, dz = 0;
  if (a.state === 'flee') {
    a.timer -= dt; if (a.timer <= 0) { a.state = 'walk'; a.panic = false; a.tx = a.x; a.tz = a.z; }
    dx = a.x - a.fx; dz = a.z - a.fz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    if (a.stuck > 0.4) { const t = dx; dx = -dz * (a.side || 1); dz = t * (a.side || 1); if (a.stuck > 1.2) { a.side = -(a.side || 1); a.stuck = 0; } }
    speed = 6.3;
  } else {
    let tx = a.tx - a.x, tz = a.tz - a.z, d = Math.hypot(tx, tz);
    if (d < 0.8 || a.stuck > 1) {
      for (let i = 0; i < 8; i++) { const an = rnd(0, 6.28), L = rnd(8, 22), nx = a.x + Math.cos(an) * L, nz = a.z + Math.sin(an) * L; if (isFree(nx, nz, 0.6) && (!onRoad(nx, nz) || Math.random() < 0.15)) { a.tx = nx; a.tz = nz; break; } }
      a.stuck = 0; tx = a.tx - a.x; tz = a.tz - a.z; d = Math.hypot(tx, tz) || 1;
    }
    dx = tx / d; dz = tz / d;
  }
  if (moveActor(a, dx, dz, speed, dt)) a.stuck += dt; else a.stuck = Math.max(0, a.stuck - dt);
  if (Math.abs(dx) + Math.abs(dz) > 0.01) faceTo(a, Math.atan2(dx, dz), dt, 8);
  animateChar(a, dt);
  a.c.root.position.set(a.x, 0, a.z); a.c.root.rotation.y = a.yaw;
}
export function updateEnemy(e, dt) {
  if (!e.alive) { deathAnim(e, dt); e.c.root.position.set(e.x, 0, e.z); e.c.root.rotation.y = e.yaw; return; }
  const def = e.def, dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 1;
  e.losT -= dt;
  if (e.losT <= 0) { e.los = P.alive && dist < 90 && !blocked(e.x, 1.5, e.z, P.x, P.y + 1.3, P.z); e.losT = rnd(0.15, 0.3); }
  if (e.leaving) {
    e.aiming = false; moveActor(e, -dx / dist, -dz / dist, def.speed * 0.8, dt, e.r); faceTo(e, Math.atan2(-dx, -dz), dt);
    animateChar(e, dt); e.c.root.position.set(e.x, 0, e.z); e.c.root.rotation.y = e.yaw;
    if (dist > 75 || (dist > 40 && !e.los)) removeActor(enemies, e);
    return;
  }
  if (e.los && dist < 70) G.seenNow = true;
  const want = def.range * 0.62;
  let mx = 0, mz = 0, spd = def.speed;
  if (!e.los || dist > want) {
    mx = dx / dist; mz = dz / dist;
    if (e.detourT > 0) { e.detourT -= dt; mx = e.dx; mz = e.dz; }
  } else {
    e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = rnd(1.2, 3); }
    mx = -dz / dist * e.strafe; mz = dx / dist * e.strafe; spd = 1.6;
    if (dist < 6) { mx -= dx / dist; mz -= dz / dist; }
  }
  if (moveActor(e, mx, mz, spd, dt, e.r)) { e.stuck += dt; if (e.stuck > 0.4 && e.detourT <= 0) { const s = Math.random() < 0.5 ? 1 : -1; e.dx = -dz / dist * s; e.dz = dx / dist * s; e.detourT = rnd(0.8, 1.6); e.stuck = 0; } }
  else e.stuck = 0;
  e.aiming = e.los && dist < def.range * 1.15 && P.alive;
  if (e.aiming) { faceTo(e, Math.atan2(dx, dz), dt, 12); e.aimPitch = Math.atan2(P.y + 1.2 - 1.4, dist); }
  else if (Math.abs(mx) + Math.abs(mz) > 0.01) faceTo(e, Math.atan2(mx, mz), dt, 8);
  // firing
  e.fireT -= dt;
  if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = def.gap; enemyShoot(e, dist); } }
  else if (e.fireT <= 0 && e.aiming && dist < def.range && G.shootersNow < 5) { G.shootersNow++; e.burst = def.burst; e.burstT = 0; e.fireT = def.rate * rnd(0.8, 1.3); }
  animateChar(e, dt);
  e.c.root.position.set(e.x, 0, e.z); e.c.root.rotation.y = e.yaw;
}
const _mz = new THREE.Vector3(), _pt = new THREE.Vector3();
export function muzzleOf(c) { return c.gunHolder.localToWorld(_mz.copy(gunGeo(c.gunId || 'pistol').muzzle)); }
function enemyShoot(e, dist) {
  if (!P.alive) return;
  const from = muzzleOf(e.c).clone();
  const sprint = P.moveSpeed > 6 ? 0.55 : P.moveSpeed > 1 ? 0.8 : 1;
  const chance = e.def.acc * clamp(1.25 - dist / e.def.range * 0.7, 0.35, 1.1) * sprint;
  const target = new THREE.Vector3(P.x, P.y + 1.2, P.z);
  const hit = Math.random() < chance && !blocked(from.x, from.y, from.z, target.x, target.y, target.z);
  if (!hit) target.add(new THREE.Vector3(rnd(-1.6, 1.6), rnd(-0.9, 1.2), rnd(-1.6, 1.6)));
  tracer(from, target, true); muzzleFlash(from, e.type === 'jugg');
  Sound.shot(e.def.gun, vol3d(e.x, e.z) * 0.7, pan3d(e.x, e.z));
  if (hit) hurtPlayer(e.def.dmg);
  else if (dist < 12) Sound.ting(0.5, pan3d(target.x, target.z));
}
export function hurtPlayer(d) {
  if (!P.alive || G.state !== 'play') return;
  if (P.armor > 0) { const a = Math.min(P.armor, d * 0.7); P.armor -= a; d -= a; }
  P.hp -= d; Sound.hurt(); cam.shake = Math.max(cam.shake, 0.15);
  const v = $('vignette'); v.style.opacity = '1'; clearTimeout(hurtPlayer.t); hurtPlayer.t = setTimeout(() => { v.style.opacity = '0'; }, 140);
  emit(P.x, P.y + 1.2, P.z, 4, '#b3122a', 3, 0.5, 0.08);
  if (P.hp <= 0) die();
}
