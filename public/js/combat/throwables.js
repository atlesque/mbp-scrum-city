import { charMat, gunGeo } from '../characters/character.js';
import { Sound } from '../core/audio.js';
import { HEAR } from '../core/spatial.js';
import { P } from '../core/state.js';
import { clamp, rnd } from '../core/util.js';
import { WBY } from '../data/weapons.js';
import { all } from '../entities/registry.js';
import { hurtPlayer } from '../game/player.js';
import { alarm } from '../npcs/npc.js';
import { emit } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { wallHitFace } from '../world/collision.js';
import { castShot, explosion } from './combat.js';

// ================= GRENADES & MOLOTOVS =================
// Thrown weapons fly in an arc. A grenade bounces off whatever it meets and goes off when its fuse runs out;
// a molotov bursts on the first thing it touches and leaves a pool of fire that burns whoever stands in it,
// sets them alight for a few seconds after, and cooks any car parked in it until it goes up.
export const THROW = { speed: 18, lift: 0.3, gravity: -18, bounce: 0.4, friction: 0.6 };
export const FIRE = { tick: 0.25, afterburn: 3, afterDps: 0.5, playerMul: 0.5, carMul: 2 };

// the launch velocity for a throw toward where the camera looks, lobbed a little above the crosshair
export function throwVelocity(yaw, pitch) {
  const a = clamp(pitch + THROW.lift, -1.2, 1.2), s = THROW.speed;
  return { x: Math.sin(yaw) * Math.cos(a) * s, y: Math.sin(a) * s, z: Math.cos(yaw) * Math.cos(a) * s };
}
// bounce velocity v off a surface with normal n (unit): reflected, the part into the surface cut by the bounce
// and the part along it by friction
export function bounce(v, n) {
  const vn = v.x * n.x + v.y * n.y + v.z * n.z;
  const tx = v.x - vn * n.x, ty = v.y - vn * n.y, tz = v.z - vn * n.z, k = 1 - THROW.friction * (1 - THROW.bounce);
  return { x: tx * k - vn * n.x * THROW.bounce, y: ty * k - vn * n.y * THROW.bounce, z: tz * k - vn * n.z * THROW.bounce };
}

const items = [], fires = [];
const _n = new THREE.Vector3(), _d = new THREE.Vector3();
export function throwItem(id, from, vel) {
  const m = new THREE.Mesh(gunGeo(id).geo, charMat); m.position.copy(from); m.scale.setScalar(1.3); scene.add(m);
  items.push({ id, w: WBY[id], m, p: from.clone(), v: new THREE.Vector3(vel.x, vel.y, vel.z), fuse: WBY[id].fuse || 6, rest: false });
}

const fireGeo = new THREE.CircleGeometry(1, 20); fireGeo.rotateX(-Math.PI / 2);
function ignite(x, y, z, w) {
  Sound.ting(1.4, { x, y, z }); Sound.boom(0.35, { x, y, z });
  emit(x, y + 0.3, z, 18, '#ff7a2a', 6, 0.6, 0.3, -4, 4); emit(x, y + 0.3, z, 10, '#ffd23e', 7, 0.4, 0.2, -6, 5);
  emit(x, y + 0.3, z, 8, '#cfe6c8', 5, 0.4, 0.06); // glass
  const m = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: '#ff6a1a', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.scale.setScalar(w.fire); m.position.set(x, y + 0.06, z); scene.add(m);
  fires.push({ x, y, z, r: w.fire, t: w.burn, dps: w.dmg, tick: 0, m });
  alarm(x, z, 40);
}

export function updateThrown(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.fuse -= dt;
    if (it.w.fuse && it.fuse <= 0) { explosion(it.p.x, Math.max(0.3, it.p.y), it.p.z, it.w.blast, it.w.dmg, true, 1.2, true); scene.remove(it.m); items.splice(i, 1); continue; }
    if (it.w.fire && it.fuse <= 0) { scene.remove(it.m); items.splice(i, 1); continue; } // flew off the map
    if (it.rest) continue;
    it.v.y += THROW.gravity * dt;
    const L = it.v.length() * dt; if (L < 1e-5) continue;
    _d.copy(it.v).normalize();
    const h = castShot(it.p, _d, L);
    if (h.kind === 'none') { it.p.copy(h.p); }
    else if (it.w.fire) { ignite(h.p.x, Math.max(0, h.p.y), h.p.z, it.w); scene.remove(it.m); items.splice(i, 1); continue; }
    else {
      if (h.kind === 'wall') wallHitFace(it.p.x, it.p.y, it.p.z, _d.x, _d.y, _d.z, L + 0.01, _n);
      else if (h.kind === 'ground') _n.set(0, 1, 0);
      else _n.set(-_d.x, 0, -_d.z).normalize();
      const b = bounce(it.v, _n); it.v.set(b.x, b.y, b.z);
      it.p.copy(h.p).addScaledVector(_n, 0.05);
      if (_n.y > 0.5 && it.v.length() < 1.2) { it.v.set(0, 0, 0); it.rest = true; }
      else if (it.v.length() > 3) Sound.thud(0.25, it.p, HEAR.thud);
    }
    it.m.position.copy(it.p); it.m.rotation.x += dt * 9; it.m.rotation.z += dt * 5;
  }
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t -= dt;
    const fade = Math.min(1, f.t / 1.5);
    f.m.material.opacity = (0.3 + Math.random() * 0.15) * fade;
    if (Math.random() < dt * 40 * fade) { const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * f.r; emit(f.x + Math.cos(a) * r, f.y + 0.2, f.z + Math.sin(a) * r, 1, Math.random() < 0.5 ? '#ff7a2a' : '#ffd23e', 1, 0.6, 0.35, 4, 1.5); }
    if (Math.random() < dt * 4 * fade) emit(f.x + rnd(-f.r, f.r) * 0.5, f.y + 1.2, f.z + rnd(-f.r, f.r) * 0.5, 1, '#2a2230', 1, 1.6, 0.6, 2.5, 1);
    if ((f.tick -= dt) <= 0) {
      f.tick = FIRE.tick; const d = f.dps * FIRE.tick;
      for (const e of all()) {
        if (e.removed) continue;
        const dist = Math.hypot(e.x - f.x, e.z - f.z);
        if (e.kind === 'npc' && e.alive && !e.vehicle && dist < f.r && Math.abs((e.y || 0) - f.y) < 1.5) { e.hurt(d, null, true, 0); e.burnT = FIRE.afterburn; }
        else if (e.kind === 'vehicle' && e.damage && !e.dead && dist < f.r + 1.2) e.damage(d * FIRE.carMul, true);
      }
      if (P.alive && !P.vehicle && Math.hypot(P.x - f.x, P.z - f.z) < f.r && Math.abs((P.y || 0) - f.y) < 1.5) hurtPlayer(d * FIRE.playerMul);
    }
    if (f.t <= 0) { scene.remove(f.m); f.m.material.dispose(); fires.splice(i, 1); }
  }
  // people who walked out of the fire keep burning for a moment
  for (const n of all('npc')) {
    if (!(n.burnT > 0)) continue;
    if (!n.alive) { n.burnT = 0; continue; }
    n.burnT -= dt;
    if (Math.random() < dt * 30) emit(n.x + rnd(-0.25, 0.25), (n.y || 0) + rnd(0.4, 1.7), n.z + rnd(-0.25, 0.25), 1, Math.random() < 0.5 ? '#ff7a2a' : '#ffd23e', 1, 0.45, 0.22, 4, 1.5);
    n.burnTick = (n.burnTick || 0) - dt;
    if (n.burnTick <= 0) { n.burnTick = FIRE.tick; n.hurt(WBY.molotov.dmg * FIRE.afterDps * FIRE.tick, null, true, 0); }
  }
}
