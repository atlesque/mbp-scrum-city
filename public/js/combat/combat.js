import { setGun, muzzleOf } from '../characters/character.js';
import { Sound } from '../core/audio.js';
import { pan3d } from '../core/spatial.js';
import { G, I, P, cam, inv } from '../core/state.js';
import { $, clamp, rnd } from '../core/util.js';
import { WBY, WEAPONS, wStat } from '../data/weapons.js';
import { all, entities } from '../entities/registry.js';
import { camTarget, hurtPlayer } from '../game/player.js';
import { addHeat } from '../game/wanted.js';
import { alarm } from '../npcs/npc.js';
import { PGEO, boomFx, emit, muzzleFlash, pmat, tracer } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { drawWeaponIcon, toast } from '../ui/hud.js';
import { wallHit } from '../world/collision.js';

// ================= COMBAT =================
const _d = new THREE.Vector3();
// first thing along a ray: a wall, the ground, or any entity with a raycast trait
export function castShot(o, d, maxT) {
  let best = { t: maxT, kind: 'none' };
  const tw = wallHit(o.x, o.y, o.z, d.x, d.y, d.z, maxT); if (tw < best.t) best = { t: tw, kind: 'wall' };
  if (d.y < -1e-4) { const tg = -o.y / d.y; if (tg < best.t) best = { t: tg, kind: 'ground' }; }
  for (const e of entities) {
    if (!e.raycast) continue;
    const h = e.raycast(o, d, best.t); if (h && h.t < best.t) best = { t: h.t, kind: 'entity', entity: e, head: !!h.head, zone: h.zone, occupant: !!h.occupant };
  }
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
      if (h.kind === 'entity') { const r = h.entity.onShot(h, st.dmg, _d); hitAny = true; if (r && r.head) headAny = true; }
      else if (h.kind !== 'none') emit(h.p.x, h.p.y, h.p.z, 3, h.kind === 'ground' ? '#c8b8a8' : '#f4e8f0', 3, 0.35, 0.07);
    }
    if (hitAny) { G.hitT = 0.12; const ch = $('crosshair'); ch.className = headAny ? 'head' : 'hit'; headAny ? Sound.head() : Sound.hit(); }
  }
  // gunfire is a crime when people are around
  alarm(P.x, P.z, 32);
  if (G.wanted === 0 && all('npc').some(n => n.faction === 'civilian' && n.alive && !n.vehicle && Math.hypot(n.x - P.x, n.z - P.z) < 22)) addHeat(0.12);
}

const rockets = [];
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
      if (h.kind === 'entity' && h.entity.onRocket) h.entity.onRocket(r.dmg);
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
  for (const e of all()) if (e.blast && !e.removed) e.blast(x, y, z, R, dmg, byPlayer);
  for (const e of all()) if (e.fling && !e.removed) e.fling(x, y, z, R); // a second pass, so whoever the blast just killed flies too
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
