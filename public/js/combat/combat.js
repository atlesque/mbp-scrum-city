import { setGun } from '../characters/character.js';
import { Sound } from '../core/audio.js';
import { G, I, P, bikes, cam, cars, enemies, inv, peds, riders, rockets, stats } from '../core/state.js';
import { $, clamp, rnd } from '../core/util.js';
import { WBY, WEAPONS, wStat } from '../data/weapons.js';
import { dropCash } from '../game/pickups.js';
import { camTarget } from '../game/player.js';
import { addHeat } from '../game/wanted.js';
import { alarm, hurtPlayer, muzzleOf, pan3d, vol3d } from '../npcs/actors.js';
import { PGEO, bloodPool, boomFx, emit, muzzleFlash, pmat, tracer } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { drawWeaponIcon, toast } from '../ui/hud.js';
import { damageBike, ejectRider } from '../vehicles/bikes.js';
import { damageCar } from '../vehicles/cars.js';
import { damageHeli } from '../vehicles/heli.js';
import { rayBox, raySphere, wallHit } from '../world/collision.js';

// ================= COMBAT =================
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
function castShot(o, d, maxT) {
  let best = { t: maxT, kind: 'none' };
  const tw = wallHit(o.x, o.y, o.z, d.x, d.y, d.z, maxT); if (tw < best.t) best = { t: tw, kind: 'wall' };
  if (d.y < -1e-4) { const tg = -o.y / d.y; if (tg < best.t) best = { t: tg, kind: 'ground' }; }
  for (const c of cars) { const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, c.x - c.hx, 0, c.z - c.hz, c.x + c.hx, 1.55, c.z + c.hz); if (t < best.t) best = { t, kind: 'car', car: c }; }
  for (const b of bikes) {
    if (b === P.bike) continue; const sy = Math.abs(Math.sin(b.yaw)), cy = Math.abs(Math.cos(b.yaw)), hx = sy * 1.05 + cy * 0.32, hz = cy * 1.05 + sy * 0.32;
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.x - hx, 0, b.z - hz, b.x + hx, b.fallen ? 0.6 : 0.98, b.z + hz); if (t < best.t) best = { t, kind: 'bike', bike: b };
  }
  const scan = (list) => { for (const a of list) { if (!a.alive) continue; const s = a.def && a.def.scale || 1, yo = a.bike ? 0.15 : 0;
    const tb = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, a.x, 1.05 * s + yo, a.z, 0.44 * s); if (tb < best.t) best = { t: tb, kind: 'actor', a, head: false };
    const tl = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, a.x, 0.5 * s + yo, a.z, 0.32 * s); if (tl < best.t) best = { t: tl, kind: 'actor', a, head: false };
    const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, a.x, 1.74 * s + yo, a.z, 0.2 * s); if (th < best.t) best = { t: th, kind: 'actor', a, head: true }; } };
  scan(peds); scan(enemies); scan(riders);
  if (G.heli && !G.heli.falling) { const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, G.heli.x, G.heli.y, G.heli.z, 3); if (t < best.t) best = { t, kind: 'heli' }; }
  best.p = o.clone().addScaledVector(d, best.t);
  return best;
}
export function curWeapon() { return WBY[inv.cur]; }
export function playerShoot() {
  const w = curWeapon(), st = wStat(w, inv.lvl[w.id] || 0);
  if (G.reloadT > 0) return;
  if ((inv.mag[w.id] || 0) <= 0) { startReload(); if ((inv.mag[w.id] || 0) <= 0) { Sound.empty(); G.fireCd = 0.3; } return; }
  inv.mag[w.id]--; G.fireCd = st.rate; P.lastShot = G.time;
  const muz = muzzleOf(P.c).clone();
  const dir = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  const origin = camTarget.clone();
  const spreadMul = (P.moveSpeed > 6 ? 2 : P.moveSpeed > 1 ? 1.4 : 1) * (I.mouseR ? 0.55 : 1) * (P.grounded ? 1 : 1.6);
  Sound.shot(w.id, 1, 0); muzzleFlash(muz, w.id === 'shotgun' || w.id === 'rpg');
  cam.pitch = clamp(cam.pitch + w.recoil * (0.6 + Math.random() * 0.6), -1.1, 1.2); cam.yaw += (Math.random() - 0.5) * w.recoil * 0.6; cam.shake = Math.max(cam.shake, w.recoil * 2.2);
  if (w.rocket) {
    const tgt = castShot(origin, dir, 300).p, rd = tgt.clone().sub(muz).normalize();
    fireRocket(muz, rd, st.dmg);
  } else {
    let hitAny = false, headAny = false;
    for (let k = 0; k < w.pellets; k++) {
      const sp = w.spread * spreadMul;
      _d.copy(dir).add(new THREE.Vector3(rnd(-sp, sp), rnd(-sp, sp), rnd(-sp, sp))).normalize();
      const h = castShot(origin, _d, w.range);
      tracer(muz, h.p, false);
      if (h.kind === 'actor') { hitAny = true; if (h.head) headAny = true; damageActor(h.a, st.dmg * (h.head ? 2.2 : 1), _d, true); }
      else if (h.kind === 'car') { damageCar(h.car, st.dmg, true); emit(h.p.x, h.p.y, h.p.z, 3, '#ffe9a8', 5, 0.25, 0.06); hitAny = true; }
      else if (h.kind === 'bike') { damageBike(h.bike, st.dmg, true); emit(h.p.x, h.p.y, h.p.z, 3, '#ffe9a8', 5, 0.25, 0.06); hitAny = true; }
      else if (h.kind === 'heli') { damageHeli(st.dmg); hitAny = true; }
      else if (h.kind !== 'none') emit(h.p.x, h.p.y, h.p.z, 3, h.kind === 'ground' ? '#c8b8a8' : '#f4e8f0', 3, 0.35, 0.07);
    }
    if (hitAny) { G.hitT = 0.12; const ch = $('crosshair'); ch.className = headAny ? 'head' : 'hit'; headAny ? Sound.head() : Sound.hit(); }
  }
  // gunfire is a crime when people are around
  alarm(P.x, P.z, 32);
  if (G.wanted === 0 && peds.some(p => p.alive && Math.hypot(p.x - P.x, p.z - P.z) < 22)) addHeat(0.12);
}
export function damageActor(a, dmg, dir, byPlayer) {
  if (!a.alive) return;
  a.hp -= dmg;
  emit(a.x, 1.2, a.z, 6, '#c0142c', 3.5, 0.5, 0.09);
  if (a.kind === 'ped' && a.state !== 'flee') { a.state = 'flee'; a.timer = 10; a.fx = P.x; a.fz = P.z; a.panic = true; }
  if (a.kind === 'enemy') { a.los = true; a.losT = 0.3; }
  if (a.bike) a.bike.top = 24; // a wounded biker guns it
  if (a.hp <= 0) killActor(a, dir, byPlayer);
}
function killActor(a, dir, byPlayer) {
  const wasBiker = a.bike && a.bike.M; if (wasBiker) ejectRider(a.bike);
  if (wasBiker && byPlayer && !killActor.told) { killActor.told = true; setTimeout(() => toast(`That ${wasBiker.tag} is up for grabs. Walk over and press <em>F</em> to ride it.`, 5), 600); }
  a.alive = false; a.deadT = 0; a.aiming = false; a.panic = false; a.moveSpeed = 0;
  if (dir) a.yaw = Math.atan2(-dir.x, -dir.z);
  bloodPool(a.x, a.z); emit(a.x, 1, a.z, 10, '#a30f24', 4, 0.7, 0.1);
  if (a.c.gun) setGun(a.c, null);
  if (a.kind === 'ped') { Sound.scream(vol3d(a.x, a.z), pan3d(a.x, a.z)); }
  if (!byPlayer) return;
  stats.kills++;
  if (a.kind === 'ped') { addHeat(3); dropCash(a.x, a.z, Math.round(rnd(30, 120))); }
  else { stats.cops++; addHeat(a.def.heat); dropCash(a.x, a.z, a.def.reward); }
}
function fireRocket(from, dir, dmg) {
  const m = new THREE.Mesh(PGEO, pmat('#5b6a3a')); m.scale.set(0.16, 0.16, 0.7); m.position.copy(from); m.lookAt(from.clone().add(dir)); scene.add(m);
  rockets.push({ m, p: from.clone(), d: dir.clone(), life: 5, dmg });
}
export function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i], step = 70 * dt; r.life -= dt;
    const h = castShot(r.p, r.d, step);
    emit(r.p.x, r.p.y, r.p.z, 1, '#c8c0c8', 0.5, 0.8, 0.25, 1.5, 0.3);
    if (h.kind !== 'none' || r.life <= 0) {
      if (h.kind === 'heli') damageHeli(r.dmg * 2);
      if (h.kind === 'car') damageCar(h.car, 999, true);
      if (h.kind === 'bike') damageBike(h.bike, 999, true);
      explosion(h.p.x, Math.max(0.3, h.p.y), h.p.z, 7, r.dmg, true);
      scene.remove(r.m); rockets.splice(i, 1); continue;
    }
    r.p.copy(h.p); r.m.position.copy(r.p);
  }
}
export function explosion(x, y, z, R, dmg, byPlayer) {
  boomFx(x, y, z, R * 0.7);
  const dP = Math.hypot(x - P.x, z - P.z);
  Sound.boom(clamp(1.2 - dP / 140, 0, 1.2), pan3d(x, z)); cam.shake = Math.max(cam.shake, clamp(1 - dP / 40, 0, 1) * 0.9);
  const dir = new THREE.Vector3();
  for (const list of [peds, enemies, riders]) for (const a of list.slice()) {
    if (!a.alive) continue; const d = Math.hypot(a.x - x, a.z - z);
    if (d < R) { dir.set(a.x - x, 0, a.z - z).normalize().negate(); damageActor(a, dmg * (1 - d / R) + 30, dir, !!byPlayer); }
  }
  for (const c of cars) { const d = Math.hypot(c.x - x, c.z - z); if (d < R && !c.dead) damageCar(c, dmg * (1 - d / R) + 40, byPlayer ? 'boom' : false); }
  for (const b of bikes.slice()) { const d = Math.hypot(b.x - x, b.z - z); if (d < R) damageBike(b, dmg * (1 - d / R) + 40, byPlayer ? 'boom' : false); }
  if (G.heli && Math.hypot(G.heli.x - x, G.heli.y - y, G.heli.z - z) < R + 3) damageHeli(dmg);
  if (dP < R && P.alive) hurtPlayer((dmg * (1 - dP / R) + 10) * (byPlayer ? 0.35 : 0.6));
  alarm(x, z, 50);
}
export function startReload() {
  const w = curWeapon(), st = wStat(w, inv.lvl[w.id] || 0);
  if (G.reloadT > 0 || inv.mag[w.id] >= st.mag) return;
  if (!w.infinite && (inv.ammo[w.id] || 0) <= 0) { if (startReload.warn !== w.id) toast(`Out of ${w.name} ammo. Restock at <em>Bullet Bros. Guns</em> ($ on the radar).`); startReload.warn = w.id; return; }
  G.reloadT = w.reload; Sound.reload();
}
export function finishReload() {
  const w = curWeapon(), st = wStat(w, inv.lvl[w.id] || 0), need = st.mag - (inv.mag[w.id] || 0);
  if (w.infinite) inv.mag[w.id] = st.mag;
  else { const take = Math.min(need, inv.ammo[w.id] || 0); inv.ammo[w.id] -= take; inv.mag[w.id] += take; }
}
export function selectWeapon(id) {
  if (!inv.owned[id] || inv.cur === id) return;
  inv.cur = id; G.reloadT = 0; G.spin = 0; setGun(P.c, id); P.twoHand = !!WBY[id].twoHand;
  if (inv.mag[id] == null) inv.mag[id] = 0;
  drawWeaponIcon(); startReload.warn = null;
}
export function cycleWeapon(dir) {
  const owned = WEAPONS.filter(w => inv.owned[w.id]); let i = owned.findIndex(w => w.id === inv.cur);
  i = (i + dir + owned.length) % owned.length; selectWeapon(owned[i].id);
}
