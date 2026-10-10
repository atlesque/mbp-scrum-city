import { bulletImpact, castBullet, castShot, crimeNoise, fireRocket } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { G, I, P, cam } from '../core/state.js';
import { $, clamp, rnd } from '../core/util.js';
import { WBY } from '../data/weapons.js';
import { camTarget } from '../game/player.js';
import { muzzleFlash, tracer } from '../render/effects.js';
import { GUN_TIP, PODS, SKID, heliPoint } from './heli-mesh.js';

// ================= CHOPPER GUNS =================
// A chopper the player flies has its own two guns, picked with 1 and 2 (or the mouse wheel) and fired at the crosshair:
//   minigun   the hand-held minigun's damage, rate and 250-round belt, firing from under the nose
//   rockets   six in the pods; one click sends three off one after another, `gap` seconds apart, from alternate pods
// Both reload in the same time as the gun they are based on, and never run out of spare ammo.
export const HELI_GUNS = {
  minigun: { id: 'minigun', name: 'Chopper minigun', icon: 'minigun', mag: WBY.minigun.mag, rate: WBY.minigun.rate, dmg: WBY.minigun.dmg, spread: 0.03, range: 170, reload: WBY.minigun.reload, recoil: 0.002 },
  rockets: { id: 'rockets', name: 'Chopper rockets', icon: 'rpg', mag: 6, burst: 3, gap: 0.16, rate: 0.45, dmg: WBY.rpg.dmg, reload: WBY.rpg.reload, recoil: 0.02 },
};
export const HELI_GUN_ORDER = ['minigun', 'rockets'];

// the guns' state on a chopper, made the first time someone flies it
export function armHeli(v) {
  if (!v.guns) v.guns = { cur: 'minigun', mag: { minigun: HELI_GUNS.minigun.mag, rockets: HELI_GUNS.rockets.mag }, reloadT: 0, cd: 0, burst: 0, burstT: 0, pod: 0 };
  return v.guns;
}
// the chopper the player is flying right now, if they are
export const flyingHeli = () => (P.vehicle && P.vehicle.guns && !P.vehicle.dead ? P.vehicle : null);

// pick a gun by id; switching drops a reload under way and a burst still going
export function pickHeliGun(v, id) {
  const g = v.guns; if (!HELI_GUNS[id] || g.cur === id) return;
  g.cur = id; g.reloadT = 0; g.burst = 0; g.cd = Math.max(g.cd, 0.2);
  Sound.stopReload();
}
export function cycleHeliGun(v, dir) {
  const i = HELI_GUN_ORDER.indexOf(v.guns.cur);
  pickHeliGun(v, HELI_GUN_ORDER[(i + dir + HELI_GUN_ORDER.length) % HELI_GUN_ORDER.length]);
}
export function reloadHeliGun(v) {
  const g = v.guns, W = HELI_GUNS[g.cur];
  if (g.reloadT > 0 || g.mag[g.cur] >= W.mag) return;
  g.reloadT = W.reload; g.burst = 0;
  Sound.reload(W.id === 'rockets' ? 'rpg' : 'minigun');
}

// One frame of the guns: the reload ticking, a rocket burst going off, and the trigger (hold for the minigun, a click
// or a held button for a burst of rockets).
export function heliGuns(v, dt) {
  const g = armHeli(v), W = HELI_GUNS[g.cur];
  g.cd -= dt;
  if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) { g.reloadT = 0; g.mag[g.cur] = W.mag; } }
  const trigger = (I.mouseL || I.clickQ > 0) && G.state === 'play';
  I.clickQ = Math.max(0, I.clickQ - dt);
  if (g.burst > 0) {
    g.burstT -= dt;
    if (g.burstT <= 0) { shootRocket(v, g); g.burst--; g.burstT = W.gap; if (!g.burst) { g.cd = W.rate; if (!g.mag.rockets) reloadHeliGun(v); } }
    return;
  }
  if (!trigger || g.cd > 0 || g.reloadT > 0) return;
  I.clickQ = 0;
  if (g.mag[g.cur] <= 0) { reloadHeliGun(v); return; }
  if (g.cur === 'rockets') { g.burst = Math.min(W.burst, g.mag.rockets); g.burstT = 0; return heliGuns(v, 0); }
  shootMinigun(v, g, W);
  if (!g.mag.minigun) reloadHeliGun(v);
}

// where the crosshair is pointing, from the camera
const _dir = new THREE.Vector3(), _from = new THREE.Vector3(), _d = new THREE.Vector3();
function aimDir() { return _dir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)); }
const muzzle = (v, p) => heliPoint(v.x, v.y + SKID, v.z, v.yaw, p, _from);

function shootMinigun(v, g, W) {
  g.mag.minigun--; g.cd = W.rate; P.lastShot = G.time;
  const from = muzzle(v, GUN_TIP).clone(), dir = aimDir(), origin = camTarget.clone();
  _d.copy(dir).add(new THREE.Vector3(rnd(-W.spread, W.spread), rnd(-W.spread, W.spread), rnd(-W.spread, W.spread))).normalize();
  const h = castBullet(origin, _d, W.range);
  tracer(from, h.p, false); muzzleFlash(from); Sound.shot('minigun', 1, 0); bulletImpact(h);
  cam.shake = Math.max(cam.shake, W.recoil * 20);
  if (h.kind === 'entity') {
    const r = h.entity.onShot(h, W.dmg, _d);
    G.hitT = 0.12; const ch = $('crosshair'); if (ch) ch.className = r && r.head ? 'head' : 'hit'; r && r.head ? Sound.head() : Sound.hit();
  }
  crimeNoise();
}
function shootRocket(v, g) {
  const W = HELI_GUNS.rockets; if (g.mag.rockets <= 0) return;
  g.mag.rockets--; P.lastShot = G.time;
  const from = muzzle(v, PODS[g.pod]).clone(); g.pod = 1 - g.pod;
  const tgt = castShot(camTarget.clone(), aimDir(), 300).p;
  fireRocket(from, tgt.sub(from).normalize(), W.dmg, 1);
  muzzleFlash(from, true); Sound.shot('rpg', 1, 0);
  cam.shake = Math.max(cam.shake, W.recoil * 10); cam.pitch = clamp(cam.pitch + W.recoil * 0.3, -1.45, 1.15);
  crimeNoise();
}

// what the HUD shows for the gun in use: { id, name, icon, ammo }
export function heliGunHud(v) {
  const g = armHeli(v), W = HELI_GUNS[g.cur];
  return { id: W.id, name: W.name, icon: W.icon, ammo: g.reloadT > 0 ? 'Reloading' : `${g.mag[g.cur]}<span>/∞</span>` };
}
