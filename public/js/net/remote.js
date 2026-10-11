import { animateChar, deathAnim, disposeChar, makeCharacter, muzzleOf, setGun } from '../characters/character.js';
import { Sound } from '../core/audio.js';
import { P } from '../core/state.js';
import { addEntity, removeEntity } from '../entities/registry.js';
import { emit, muzzleFlash, tracer } from '../render/effects.js';
import { clubScene, LAYOUT } from '../game/club.js';
import { scene } from '../render/scene.js';
import { spawnVehicle } from '../vehicles/vehicle.js';
import { VEHICLE_MODELS } from '../vehicles/models/index.js';
import { aimFromSeat, rideHooks, seatAt, seatsOf } from '../vehicles/seats.js';
import { crew } from '../game/crew.js';
import { LAG, lookFor, sample, trim } from './protocol.js';

// ================= MULTIPLAYER: OTHER PLAYERS =================
// Someone else in the shared city, drawn from the states their game sends (net/protocol.js), a moment in the past so
// they glide between them. They are an entity (kind 'remote') like any other: the radar and the world map show them, the
// player bumps into them, the law hunts them. They're the player's crew, so bullets go past them. The vehicle they ride
// is a local copy of the same model, posed where they say it is.
const remotes = new Map();
export const CREW_COLOR = '#b8ff3e';
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
  damage() {}, blast() {}, fling() {}, onRocket() {}, // the crew can't hurt each other, and their own game feels any blast
  repair() { return false; }, shouldDespawn() { return false; }, blip() {},
  interaction(p) { return rideHooks.board ? rideHooks.board(this, p) : null; }, // a seat in it for the rest of the crew (net/ride.js)
  // a passenger's own shots go out through it
  raycast(o, d, maxT) { return P.ride && P.ride.v === this ? null : Object.getPrototypeOf(this).raycast.call(this, o, d, maxT); },
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
    // where they are (w: 1 the city, 2 the club's floor) has to be where this player is to see them; the club is a scene
    // of its own (game/club.js)
    const here = P.club === LAYOUT ? 2 : P.club ? -1 : 1;
    this.where = s ? s.w : 0;
    if (!s || s.w !== here) { this.hide(); return; }
    const sc = here === 2 ? clubScene() : scene;
    // (not out of the seat of whatever they ride, which carries them)
    if (this.tag.parent !== sc) sc.add(this.tag);
    if (c.root.parent !== sc && !this.vehicle && !this.seated) sc.add(c.root);
    c.root.visible = true; this.tag.visible = true;
    const wasAlive = this.alive;
    this.alive = !!s.al; if (wasAlive && !this.alive) this.deadT = 0;
    if (!this.alive) { this.c.body.rotation.y = 0; }
    else if (!wasAlive) { c.body.rotation.x = 0; c.body.position.y = 0; }
    setGun(c, this.alive ? s.g : null);
    this.twoHand = !!s.th; this.melee = s.m || null; this.aiming = !!s.a; this.aimPitch = s.p || 0;
    this.rd = this.alive && Array.isArray(s.rd) ? s.rd : null;
    if (s.v && this.alive) { this.unseat(); this.ride(s.v, dt); return; }
    this.dismount();
    if (this.rd && this.passenger(s)) return;
    this.unseat();
    this.x = s.x; this.y = s.y || 0; this.z = s.z; this.yaw = s.yaw; this.moveSpeed = s.ms || 0; this.jumpY = s.j || 0;
    if (this.alive) animateChar(this, dt); else deathAnim(this, dt);
    c.root.position.set(this.x, this.y - this.jumpY, this.z); c.root.rotation.y = this.yaw;
    this.tag.position.set(this.x, this.y + 2.35, this.z);
  },
  hide() { this.c.root.visible = false; this.tag.visible = false; this.dismount(); this.unseat(); this.alive = false; this.rd = null; },
  // riding with someone (net/ride.js): in seat rd[1] of the driver's vehicle, this player's own or a copy of a crewmate's
  passenger(s) {
    const [owner, k] = this.rd, v = owner === crew.me() ? P.vehicle : remotes.get(owner)?.vehicle;
    if (!v || !(k >= 1 && k < seatsOf(v))) return false;
    if (this.seated !== v || this.seatK !== k || (this.seatAim && s.ay == null)) { this.unseat(); seatAt(v, this.c, k); this.seated = v; this.seatK = k; this.seatAim = false; }
    if (s.ay != null && Number.isFinite(s.ay)) { aimFromSeat(this.c, s.ay, this.aimPitch); this.seatAim = true; }
    this.x = v.x; this.z = v.z; this.y = v.K.flies ? v.y : 0; this.yaw = v.yaw;
    this.tag.position.set(this.x, this.y + 2.6, this.z);
    return true;
  },
  unseat() {
    const v = this.seated; if (!v) return;
    this.seated = null; v.K.unseat(v, this.c);
  },
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
    if (rideHooks.carry) rideHooks.carry(v); // this player riding along in it
  },
  dismount() {
    const v = this.vehicle; if (!v) return;
    this.vehicle = null; v.K.unseat(v, this.c); v.driver = null; // (unseat puts the body back in the street)
    removeEntity(v);
  },
  blast() {}, fling() {},
  // people don't walk through each other
  pushOut(o, r) {
    if (!this.alive || this.vehicle || o !== P || Math.abs((P.y || 0) - this.y) > 1.2) return false;
    const dx = o.x - this.x, dz = o.z - this.z, d = Math.hypot(dx, dz), min = r + 0.35;
    if (d >= min || d < 1e-4) return false;
    o.x = this.x + dx / d * min; o.z = this.z + dz / d * min; return true;
  },
  // on the radar, and on the world map with their name (worked out here, as the game doesn't move them while the map is open)
  blip(radar) {
    const now = performance.now() / 1000; trim(this.buf, now - LAG);
    const s = sample(this.buf, now - LAG); if (!s || s.w !== 1) return;
    const x = s.v ? s.v.x : s.x, z = s.v ? s.v.z : s.z;
    radar.dot(x, z, CREW_COLOR, 9, true);
    if (radar.label) radar.label(x, z, this.name, CREW_COLOR);
  },
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
    this.dismount(); this.unseat(); disposeChar(this.c); this.c.root.removeFromParent(); // (it may be in the club's scene)
    this.tag.removeFromParent(); this.tag.material.map.dispose(); this.tag.material.dispose();
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
