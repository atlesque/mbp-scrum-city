import { charMat } from '../characters/character.js';
import { explosion } from '../combat/combat.js';
import { SIGHT_EVERY, newSight, reactTo } from '../combat/sight.js';
import { Sound } from '../core/audio.js';
import { pan3d, vol3d } from '../core/spatial.js';
import { G, P } from '../core/state.js';
import { angDiff, lerp, rnd } from '../core/util.js';
import { addEntity, removeEntity } from '../entities/registry.js';
import { reward } from '../game/pickups.js';
import { hurtPlayer } from '../game/player.js';
import { addHeat } from '../game/wanted.js';
import { PGEO, emit, muzzleFlash, pmat, tracer } from '../render/effects.js';
import { GB, box } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { showBig } from '../ui/hud.js';
import { blocked, raySphere } from '../world/collision.js';
import { lightRed } from './materials.js';

// ================= HELICOPTER =================
// The 4+ star chopper: circles the player, sweeps a searchlight and fires minigun bursts.
// It takes about 20 rifle hits or one direct rocket, smokes as it weakens and spins down when killed.
export const HELI_HP = 700;
// hit volumes in the chopper's own frame: the cabin, the tail boom and the rotor disc
const BODY_R = 3, TAIL_BACK = 4.4, TAIL_R = 1.6, ROTOR_Y = 1, ROTOR_R = 4.5;
const Heli = {
  kind: 'heli',
  blipLayer: 4,
  update(dt) {
    const h = this;
    h.rotor.rotation.y += dt * 30; h.rotor2.rotation.y = h.rotor.rotation.y;
    // damage shows: grey smoke below 60%, thick black smoke and sparks below 30%
    const hpF = h.hp / HELI_HP;
    if (!h.falling && hpF < 0.6 && Math.random() < (hpF < 0.3 ? 0.9 : 0.4)) {
      emit(h.x, h.y + 0.6, h.z, 1, hpF < 0.3 ? '#2a2430' : '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
      if (hpF < 0.3 && Math.random() < 0.3) emit(h.x, h.y + 0.6, h.z, 1, '#ff8a3a', 2, 0.3, 0.25, 0, 1);
    }
    if (h.falling) {
      h.vy -= 14 * dt; h.y += h.vy * dt; h.grp.rotation.y += dt * 5; h.grp.rotation.z += dt * 0.6;
      if (Math.random() < 0.8) emit(h.x, h.y, h.z, 1, '#3a3240', 2, 1.5, 0.8, 2, 1);
      if (h.y <= 1) { explosion(h.x, 1, h.z, 9, 200, true); removeHeli(40); return; }
      h.grp.position.set(h.x, h.y, h.z); return;
    }
    if (G.wanted < 4) {
      h.y += dt * 8; h.x += Math.sin(h.yaw) * dt * 20; h.z += Math.cos(h.yaw) * dt * 20; h.beam.visible = false;
      h.grp.position.set(h.x, h.y, h.z);
      if (h.y > 70) removeHeli(20);
      return;
    }
    h.beam.visible = true;
    h.ang += dt * 0.22;
    const tx = P.x + Math.cos(h.ang) * 26, tz = P.z + Math.sin(h.ang) * 26, ty = 28;
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz), sp = Math.min(d, 16 * dt);
    if (d > 0.01) { h.x += dx / d * sp; h.z += dz / d * sp; }
    h.y = lerp(h.y, ty, dt * 0.5);
    h.yaw += angDiff(h.yaw, Math.atan2(P.x - h.x, P.z - h.z)) * dt * 2;
    h.grp.position.set(h.x, h.y + Math.sin(G.time * 1.3) * 0.3, h.z); h.grp.rotation.set(0.12, h.yaw, 0);
    h.lr.visible = (G.time * 2 | 0) % 2 === 0;
    // searchlight from the heli to the player
    const bx = lerp(h.x, P.x, 0.5), bz = lerp(h.z, P.z, 0.5), by = h.y / 2, L = Math.hypot(P.x - h.x, h.y, P.z - h.z);
    h.beam.position.set(bx, by, bz); h.beam.scale.set(1, L, 1); h.beam.lookAt(P.x, 0, P.z); h.beam.rotateX(-Math.PI / 2);
    const dist = Math.hypot(P.x - h.x, P.z - h.z, h.y);
    h.losT -= dt;
    if (h.losT <= 0) { h.los = P.alive && dist < 80 && !blocked(h.x, h.y - 1, h.z, P.x, P.y + 1, P.z); h.losT = SIGHT_EVERY; }
    // the minigun only opens up on a player in view, after a short reaction, and stops when they duck out of sight
    const ready = reactTo(h.sight, h.los && dist < 70, dt);
    if (!h.los) h.burst = 0;
    h.fireT -= dt;
    if (h.burst > 0) {
      h.burstT -= dt;
      if (h.burstT <= 0) {
        h.burst--; h.burstT = 0.09;
        const from = new THREE.Vector3(h.x, h.y - 1, h.z), to = new THREE.Vector3(P.x, P.y + 1, P.z);
        const hit = Math.random() < 0.2 && !blocked(from.x, from.y, from.z, to.x, to.y, to.z);
        if (!hit) to.add(new THREE.Vector3(rnd(-2, 2), rnd(-1, 0.5), rnd(-2, 2)));
        tracer(from, to, true); muzzleFlash(from); Sound.shot('minigun', vol3d(h.x, h.z) * 0.6, pan3d(h.x, h.z)); if (hit) hurtPlayer(5);
        emit(to.x, 0.1, to.z, 2, '#d8c8b0', 3, 0.3, 0.1);
      }
    } else if (h.fireT <= 0 && ready) { h.burst = 10; h.fireT = rnd(2.5, 3.5); }
    if (h.los) G.seenNow = true;
  },
  raycast(o, d, maxT) {
    const h = this; if (h.falling) return null;
    let t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, h.x, h.y, h.z, BODY_R);
    const tx = h.x - Math.sin(h.yaw) * TAIL_BACK, tz = h.z - Math.cos(h.yaw) * TAIL_BACK;
    t = Math.min(t, raySphere(o.x, o.y, o.z, d.x, d.y, d.z, tx, h.y + 0.3, tz, TAIL_R));
    // the spinning blades read as a solid disc
    if (Math.abs(d.y) > 1e-4) {
      const tr = (h.y + ROTOR_Y - o.y) / d.y;
      if (tr > 0 && Math.hypot(o.x + d.x * tr - h.x, o.z + d.z * tr - h.z) < ROTOR_R) t = Math.min(t, tr);
    }
    return t < maxT ? { t } : null;
  },
  onShot(hit, dmg) { this.damage(dmg); return { head: false }; },
  onRocket(dmg) { this.damage(dmg * 2); },
  blast(x, y, z, R, dmg) { if (Math.hypot(this.x - x, this.y - y, this.z - z) < R + 3) this.damage(dmg); },
  damage(dmg) {
    const h = this; if (h.falling) return; h.hp -= dmg; emit(h.x, h.y, h.z, 4, '#ffd23e', 7, 0.3, 0.16);
    if (h.hp <= 0) { h.falling = true; h.vy = 0; h.beam.visible = false; reward(h.x, h.z, 2000, 'Chopper down'); addHeat(10); }
  },
  blip(radar) { radar.dot(this.x, this.z, radar.flash ? '#ffd23e' : '#ff3b4e', 11, true, 'sq'); },
  dispose() { scene.remove(this.grp); scene.remove(this.beam); },
};

export function spawnHeli() {
  const g = new GB();
  box(g, 1.8, 1.6, 4, 0, 0, 0, '#1b2a4a'); box(g, 1.6, 1.0, 1.4, 0, 0.1, 1.9, '#3a5a7a'); box(g, 0.4, 0.4, 4, 0, 0.3, -3.8, '#1b2a4a');
  box(g, 0.1, 1.2, 0.8, 0, 0.8, -5.6, '#1b2a4a'); box(g, 2.06, 0.3, 1.2, 0, 0.1, -0.3, '#f4f4f4');
  box(g, 0.1, 0.1, 3.4, 0.9, -1.1, 0, '#222'); box(g, 0.1, 0.1, 3.4, -0.9, -1.1, 0, '#222'); box(g, 0.1, 0.5, 0.1, 0.9, -0.85, 0.8, '#222'); box(g, 0.1, 0.5, 0.1, -0.9, -0.85, 0.8, '#222');
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(g.geometry(), charMat));
  const rotor = new THREE.Mesh(PGEO, pmat('#141418')); rotor.scale.set(9, 0.06, 0.35); rotor.position.y = 1.0; grp.add(rotor);
  const rotor2 = new THREE.Mesh(PGEO, pmat('#141418')); rotor2.scale.set(0.35, 0.06, 9); rotor2.position.y = 1.0; grp.add(rotor2);
  const lr = new THREE.Mesh(PGEO, lightRed); lr.scale.setScalar(0.25); lr.position.set(0, -0.85, 1); grp.add(lr);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  scene.add(beam);
  const a = rnd(0, 6.28);
  const h = Object.assign(Object.create(Heli), { grp, rotor, rotor2, lr, beam, x: P.x + Math.cos(a) * 120, z: P.z + Math.sin(a) * 120, y: 34, hp: HELI_HP, alive: true, ang: a, fireT: 3, burst: 0, burstT: 0, los: false, losT: 0, sight: newSight(), vy: 0, falling: false, yaw: 0 });
  grp.position.set(h.x, h.y, h.z); scene.add(grp);
  G.heli = addEntity(h);
  showBig('Chopper inbound');
}
// clear the chopper away; the next one may come `cooldown` seconds later
export function removeHeli(cooldown) {
  if (!G.heli) return;
  removeEntity(G.heli); G.heli = null;
  if (cooldown != null) G.heliT = cooldown;
}
