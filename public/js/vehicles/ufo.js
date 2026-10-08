import { charMat } from '../characters/character.js';
import { explosion } from '../combat/combat.js';
import { SIGHT_EVERY } from '../combat/sight.js';
import { Sound } from '../core/audio.js';
import { G, P } from '../core/state.js';
import { lerp, rnd } from '../core/util.js';
import { addEntity, count, removeEntity } from '../entities/registry.js';
import { reward } from '../game/pickups.js';
import { spawnNpc } from '../npcs/npc.js';
import { emit } from '../render/effects.js';
import { GB, addGeo, cylG } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { showBig, toast } from '../ui/hud.js';
import { blocked, isFree } from '../world/collision.js';

// ================= UFO =================
// The secret sixth star (game/wanted.js): a flying saucer comes in over the rooftops, circles the player and lowers
// aliens down a green tractor beam, one at a time, keeping a crew of up to CREW_MAX on the ground. It doesn't shoot;
// its crew do, with laser rifles (npcs/types.js). It takes a lot of punishment (about six direct rockets), wobbles
// down trailing smoke when it gives out and goes up bigger than the tank. It leaves again if the sixth star fades.
export const UFO_HP = 3000;
// it hovers HOVER_Y up, ORBIT_R from the player, and flies at up to SPEED m/s
export const HOVER_Y = 24, ORBIT_R = 20, SPEED = 22;
// the saucer is a flattened disc: its radius and half its height (the hit volume is an ellipsoid of these)
export const DISC_R = 6, DISC_HH = 1.4;
// crew: how many aliens it keeps on the ground, how long between drops, and how long the beam stays lit for one
export const CREW_MAX = 5, DROP_EVERY = [3, 5], BEAM_TIME = 4.5;
// it crashes bigger than the tank (r 14, dmg 340)
export const CRASH_BLAST = { y: 1, r: 16, dmg: 380, power: 1.8 };
// after one is shot down or flies off, the next may come this many seconds later
export const UFO_COOLDOWN = 45;

const GREEN = '#6dff8a';
const beamMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const domeMat = new THREE.MeshPhongMaterial({ color: '#7dffb0', transparent: true, opacity: 0.55, shininess: 120, specular: 0xffffff });
const lampMat = new THREE.MeshBasicMaterial({ color: GREEN }), lampOff = new THREE.MeshBasicMaterial({ color: '#1f5a2c' });
const crew = () => count(e => e.kind === 'npc' && e.type === 'alien' && e.alive && !e.leaving);

const Ufo = {
  kind: 'ufo',
  blipLayer: 4,
  update(dt) {
    const u = this;
    u.grp.rotation.y += dt * (u.falling ? 6 : 1.2);
    // the rim lamps chase round the saucer
    const lit = Math.floor(G.time * 10) % u.lamps.length;
    u.lamps.forEach((l, i) => { l.material = (i - lit + u.lamps.length) % 4 === 0 ? lampOff : lampMat; });
    const hpF = u.hp / UFO_HP;
    if (!u.falling && hpF < 0.5 && Math.random() < (hpF < 0.25 ? 0.9 : 0.4)) emit(u.x, u.y, u.z, 1, hpF < 0.25 ? '#2a2430' : '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
    if (u.falling) {
      u.vy -= 9 * dt; u.y += u.vy * dt; u.grp.rotation.z = Math.sin(G.time * 7) * 0.35;
      if (Math.random() < 0.8) emit(u.x, u.y, u.z, 1, '#3a3240', 2, 1.5, 0.8, 2, 1);
      if (Math.random() < 0.4) emit(u.x, u.y, u.z, 1, GREEN, 4, 0.3, 0.2, 0, 1);
      if (u.y <= CRASH_BLAST.y) { explosion(u.x, CRASH_BLAST.y, u.z, CRASH_BLAST.r, CRASH_BLAST.dmg, true, CRASH_BLAST.power); removeUfo(UFO_COOLDOWN); return; }
      place(u); return;
    }
    // the sixth star faded: up and away
    if (G.wanted < 6) {
      u.beamT = 0; u.y += dt * 12; u.x += Math.sin(u.ang) * dt * 25; u.z += Math.cos(u.ang) * dt * 25;
      place(u); if (u.y > 90) removeUfo(20); return;
    }
    // it holds still while the beam is lit, so whoever is coming down lands under it
    if (u.beamT <= 0) u.ang += dt * 0.15;
    const tx = P.x + Math.cos(u.ang) * ORBIT_R, tz = P.z + Math.sin(u.ang) * ORBIT_R;
    const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz), sp = Math.min(d, SPEED * dt);
    if (d > 0.01 && u.beamT <= 0) { u.x += dx / d * sp; u.z += dz / d * sp; }
    u.y = lerp(u.y, HOVER_Y, Math.min(1, dt * 0.6));
    // it keeps the heat on while it can see the player
    u.losT -= dt;
    if (u.losT <= 0) { u.los = P.alive && Math.hypot(P.x - u.x, P.z - u.z) < 90 && !blocked(u.x, u.y - 2, u.z, P.x, P.y + 1, P.z); u.losT = SIGHT_EVERY * 4; }
    if (u.los) G.seenNow = true;
    // lower an alien whenever the crew is short and there is open ground under the saucer
    u.dropT -= dt; u.beamT -= dt;
    if (u.dropT <= 0 && u.beamT <= 0 && d < 8) {
      u.dropT = rnd(DROP_EVERY[0], DROP_EVERY[1]);
      const spot = crew() < CREW_MAX && groundUnder(u);
      if (spot) beamDown(u, spot);
    }
    place(u);
  },
  raycast(o, d, maxT) {
    if (this.falling) return null;
    const t = rayEllipsoid(o, d, this.x, this.y, this.z, DISC_R, DISC_HH);
    return t < maxT ? { t } : null;
  },
  onShot(hit, dmg) { this.damage(dmg); return { head: false }; },
  onRocket(dmg) { this.damage(dmg * 2); },
  blast(x, y, z, R, dmg, byPlayer) { if (byPlayer && Math.hypot(this.x - x, this.y - y, this.z - z) < R + DISC_R) this.damage(dmg); },
  damage(dmg) {
    const u = this; if (u.falling) return;
    u.hp -= dmg; emit(u.x, u.y - 0.8, u.z, 4, Math.random() < 0.5 ? GREEN : '#ffd23e', 7, 0.3, 0.16);
    if (u.hp <= 0) { u.falling = true; u.vy = 0; u.beamT = 0; place(u); reward(u.x, u.z, 10000, 'UFO down'); }
  },
  blip(radar) { radar.dot(this.x, this.z, radar.flash ? GREEN : '#2ad44a', 13, true, 'sq'); },
  dispose() { scene.remove(this.grp, this.beam); },
};

// the saucer and its beam where they are now; the beam reaches from its belly to the ground under it
function place(u) {
  u.grp.position.set(u.x, u.y + Math.sin(G.time * 1.6) * 0.4, u.z);
  const on = u.beamT > 0 && !u.falling;
  u.beam.visible = on;
  if (on) { const h = Math.max(1, u.y - 1); u.beam.position.set(u.bx, h / 2, u.bz); u.beam.scale.set(2.6, h, 2.6); u.beam.material.opacity = 0.16 + Math.sin(G.time * 18) * 0.05; }
}
// a free spot on the street right under the saucer, or near it
function groundUnder(u) {
  for (let i = 0; i < 16; i++) {
    const r = i ? rnd(1, DISC_R - 1) : 0, a = rnd(0, Math.PI * 2), x = u.x + Math.cos(a) * r, z = u.z + Math.sin(a) * r;
    if (isFree(x, z, 0.8)) return { x, z };
  }
  return null;
}
// light the beam and send an alien down it (the 'beamdown' behaviour in npcs/behaviours.js lands them)
function beamDown(u, spot) {
  u.bx = spot.x; u.bz = spot.z; u.beamT = BEAM_TIME;
  const n = spawnNpc('alien', spot.x, spot.z);
  n.y = u.y - DISC_HH - 0.5; n.become('beamdown');
  emit(spot.x, 0.3, spot.z, 14, GREEN, 3, 0.8, 0.12, 0, 2);
}
// distance along a ray (d normalised) to an ellipsoid of radius r across and hh half-height, or Infinity
export function rayEllipsoid(o, d, cx, cy, cz, r, hh) {
  const k = r / hh, ox = o.x - cx, oy = (o.y - cy) * k, oz = o.z - cz, dx = d.x, dy = d.y * k, dz = d.z;
  const a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - a * c; if (disc < 0) return Infinity;
  const s = Math.sqrt(disc), t0 = (-b - s) / a, t1 = (-b + s) / a;
  return t0 >= 0 ? t0 : t1 >= 0 ? 0 : Infinity;
}

function build() {
  const g = new GB(), hull = '#aeb5c2', dark = '#5c6270';
  addGeo(g, cylG(28), 0, 0, 0, DISC_R * 2, 0.5, DISC_R * 2, 0, 0, 0, hull); // the rim
  addGeo(g, cylG(28), 0, 0.42, 0, DISC_R * 1.5, 0.4, DISC_R * 1.5, 0, 0, 0, hull); // the upper deck
  addGeo(g, cylG(28), 0, -0.38, 0, DISC_R * 1.45, 0.3, DISC_R * 1.45, 0, 0, 0, dark); // the belly
  addGeo(g, cylG(20), 0, -0.6, 0, 3.2, 0.2, 3.2, 0, 0, 0, '#2a6a3a'); // the beam emitter
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(g.geometry(), charMat));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dome.position.y = 0.6; dome.scale.y = 0.8; grp.add(dome);
  const lamps = [], lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, l = new THREE.Mesh(lampGeo, lampMat); l.position.set(Math.cos(a) * DISC_R, 0, Math.sin(a) * DISC_R); grp.add(l); lamps.push(l); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1, 1, 20, 1, true), beamMat.clone()); beam.visible = false;
  return { grp, lamps, beam };
}

export function spawnUfo() {
  const { grp, lamps, beam } = build();
  const a = rnd(0, Math.PI * 2);
  const u = Object.assign(Object.create(Ufo), { grp, lamps, beam, x: P.x + Math.cos(a) * 130, z: P.z + Math.sin(a) * 130, y: 45, hp: UFO_HP, alive: true, ang: a, dropT: 1.5, beamT: 0, bx: 0, bz: 0, los: false, losT: 0, vy: 0, falling: false });
  scene.add(grp, beam); place(u);
  G.ufo = addEntity(u);
  showBig('UFO inbound');
  toast('Something is coming down out of the sky. Six stars: <em>the aliens want you too</em>.', 5);
  return u;
}
// clear the UFO away; the next one may come `cooldown` seconds later
export function removeUfo(cooldown) {
  if (!G.ufo) return;
  removeEntity(G.ufo); G.ufo = null;
  if (cooldown != null) G.ufoT = cooldown;
}
