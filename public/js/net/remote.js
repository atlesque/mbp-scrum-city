import { animateChar, deathAnim, disposeChar, makeCharacter, muzzleOf, setGun } from '../characters/character.js';
import { zoneDamage, zoneOnBody } from '../combat/hitzones.js';
import { Sound } from '../core/audio.js';
import { P } from '../core/state.js';
import { addEntity, removeEntity } from '../entities/registry.js';
import { emit, muzzleFlash, tracer } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { spawnVehicle } from '../vehicles/vehicle.js';
import { VEHICLE_MODELS } from '../vehicles/models/index.js';
import { raySphere } from '../world/collision.js';
import { send } from './net.js';
import { LAG, lookFor, sample, trim } from './protocol.js';

// ================= MULTIPLAYER: OTHER PLAYERS =================
// Someone else in the shared city, drawn from the states their game sends (net/protocol.js), a moment in the past so
// they glide between them. They are an entity (kind 'remote') like any other: bullets find them through raycast, the radar
// shows them, the player bumps into them. A bullet that lands on one is reported to their game as a hit; it is theirs to
// take the damage. The vehicle they ride is a local copy of the same model, posed where they say it is, and a shot at it
// goes to their game as well.
const remotes = new Map();
export const remoteOf = id => remotes.get(id);
export const allRemotes = () => [...remotes.values()];

// a name over the head, drawn once onto a little canvas
function nameTag(name) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const x = cv.getContext('2d');
  x.font = '600 34px "Bowlby One", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = '#120a1e'; x.strokeText(name, 128, 34); x.fillStyle = '#7cf29a'; x.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.6, 1); s.renderOrder = 10; return s;
}

// the overrides that make a spawned vehicle a puppet of someone else's game
const PUPPET = {
  remote: true, home: true,
  update() {}, // posed by its rider's entity
  damage(dmg) { if (dmg > 0 && this.owner) send({ t: 'vhit', to: this.owner.id, d: Math.round(dmg * 10) / 10 }); },
  blast() {}, fling() {}, onRocket() {}, // their own game feels the blast (the 'boom' message)
  repair() { return false; }, interaction() { return null; }, shouldDespawn() { return false; }, blip() {},
};

const Remote = {
  kind: 'remote',
  blipLayer: 3,
  // a new state arrived
  push(s, at) { this.buf.push({ at, s }); },
  update(dt) {
    const now = performance.now() / 1000;
    trim(this.buf, now - LAG);
    const s = sample(this.buf, now - LAG);
    const c = this.c;
    if (!s || !s.w) { this.hide(); return; }
    c.root.visible = true; this.tag.visible = true;
    const wasAlive = this.alive;
    this.alive = !!s.al; if (wasAlive && !this.alive) this.deadT = 0;
    if (!this.alive) { this.c.body.rotation.y = 0; }
    else if (!wasAlive) { c.body.rotation.x = 0; c.body.position.y = 0; }
    setGun(c, this.alive ? s.g : null);
    this.twoHand = !!s.th; this.melee = s.m || null; this.aiming = !!s.a; this.aimPitch = s.p || 0;
    if (s.v && this.alive) { this.ride(s.v, dt); return; }
    this.dismount();
    this.x = s.x; this.y = s.y || 0; this.z = s.z; this.yaw = s.yaw; this.moveSpeed = s.ms || 0; this.jumpY = s.j || 0;
    if (this.alive) animateChar(this, dt); else deathAnim(this, dt);
    c.root.position.set(this.x, this.y - this.jumpY, this.z); c.root.rotation.y = this.yaw;
    this.tag.position.set(this.x, this.y + 2.35, this.z);
  },
  hide() { this.c.root.visible = false; this.tag.visible = false; this.dismount(); this.alive = false; },
  // on (or in) a vehicle: a copy of their model, where they say it is
  ride(sv, dt) {
    let v = this.vehicle;
    if (v && v.model.id !== sv.m) { this.dismount(); v = null; }
    if (!v) {
      if (!VEHICLE_MODELS[sv.m]) return;
      v = this.vehicle = Object.assign(spawnVehicle(sv.m, sv.x, sv.z, sv.yaw), PUPPET, { owner: this });
      v.driver = this; v.mode = 'remote'; v.K.seat(v, this.c);
    }
    if (dt > 0) { v.vx = (sv.x - v.x) / dt; v.vz = (sv.z - v.z) / dt; } // a chopper leans with how it moves
    v.x = sv.x; v.z = sv.z; v.yaw = sv.yaw; v.v = sv.v || 0; v.steer = sv.st || 0; v.pop = sv.pp || 0;
    if (v.K.flies) { v.y = sv.y; v.rotor = sv.r ?? 1; v.landed = !!sv.l; }
    v.K.pose(v, dt);
    v.K.aim(v, this.c, this.aiming ? sv.ay : null, this.aimPitch);
    this.x = sv.x; this.z = sv.z; this.y = v.K.flies ? sv.y : 0; this.yaw = sv.yaw;
    this.tag.position.set(this.x, this.y + 2.6, this.z);
  },
  dismount() {
    const v = this.vehicle; if (!v) return;
    this.vehicle = null; v.K.unseat(v, this.c); v.driver = null; // (unseat puts the body back in the street)
    removeEntity(v);
  },
  raycast(o, d, maxT) {
    if (!this.alive || !this.c.root.visible || (this.vehicle && this.vehicle.K.enclosed)) return null; // inside a car, the car decides
    const yo = this.vehicle ? 0.15 + (this.vehicle.K.flies ? this.y : 0) : this.y || 0;
    let best = null;
    const test = (y, r, head) => { const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, this.x, y + yo, this.z, r); if (t < maxT && (!best || t < best.t)) best = { t, head }; };
    test(1.05, 0.44, false); test(0.5, 0.32, false); test(1.74, 0.2, true);
    if (best) best.zone = best.head ? 'head' : zoneOnBody(o, d, best.t, this.x, this.z, this.yaw, yo, 1);
    return best;
  },
  // a bullet from this player (or a shot through the window of what they're in): their game takes the damage
  onShot(hit, dmg) {
    const zone = hit.zone || (hit.head ? 'head' : 'torso');
    send({ t: 'hit', to: this.id, d: Math.round(zoneDamage(dmg, zone) * 10) / 10, z: zone });
    if (hit.p) emit(hit.p.x, hit.p.y, hit.p.z, 5, '#c0142c', 3.5, 0.45, 0.08);
    return { head: zone === 'head', zone };
  },
  blast() {}, fling() {},
  // people don't walk through each other
  pushOut(o, r) {
    if (!this.alive || this.vehicle || o !== P || Math.abs((P.y || 0) - this.y) > 1.2) return false;
    const dx = o.x - this.x, dz = o.z - this.z, d = Math.hypot(dx, dz), min = r + 0.35;
    if (d >= min || d < 1e-4) return false;
    o.x = this.x + dx / d * min; o.z = this.z + dz / d * min; return true;
  },
  blip(radar) { if (this.c.root.visible) radar.dot(this.x, this.z, '#b8ff3e', 9, true); },
  // their gun went off: the flash, the tracers and the bang, from their muzzle as we see it
  showShot(m) {
    if (!this.c.root.visible || !Array.isArray(m.h)) return;
    const laser = m.w === 'laser', from = this.c.gun && !this.vehicle ? muzzleOf(this.c).clone() : new THREE.Vector3(...m.f);
    for (const h of m.h.slice(0, 8)) tracer(from, new THREE.Vector3(...h), false, laser);
    if (laser) emit(from.x, from.y, from.z, 3, '#6dff8a', 2, 0.15, 0.06); else muzzleFlash(from, m.w === 'shotgun' || m.w === 'rpg');
    Sound.shot(m.w, 0.9, { x: from.x, y: from.y, z: from.z });
    for (const h of m.h.slice(0, 3)) emit(h[0], h[1], h[2], 3, '#d8d0c8', 3, 0.35, 0.07, -12, 2);
  },
  shouldDespawn() { return false; },
  dispose() {
    this.dismount(); disposeChar(this.c);
    scene.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose();
  },
};

export function addRemote(id, name) {
  if (remotes.has(id)) return remotes.get(id);
  const c = makeCharacter(lookFor(id)); c.root.visible = false; scene.add(c.root);
  const tag = nameTag(name); tag.visible = false; scene.add(tag);
  const r = Object.assign(Object.create(Remote), { id, name, c, tag, buf: [], x: 0, y: 0, z: 0, yaw: 0, alive: false, deadT: 0, vehicle: null });
  remotes.set(id, r); addEntity(r); return r;
}
export function dropRemote(id) {
  const r = remotes.get(id); if (!r) return;
  remotes.delete(id); removeEntity(r);
}
