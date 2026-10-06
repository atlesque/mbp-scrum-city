import { charMat } from '../characters/character.js';
import { explosion, fireRocket } from '../combat/combat.js';
import { SIGHT_EVERY, newSight, reactTo } from '../combat/sight.js';
import { Sound } from '../core/audio.js';
import { at } from '../core/spatial.js';
import { G, P, cam } from '../core/state.js';
import { angDiff, clamp, lerp, rnd } from '../core/util.js';
import { addEntity, all, removeEntity } from '../entities/registry.js';
import { reward } from '../game/pickups.js';
import { hurtPlayer } from '../game/player.js';
import { addHeat } from '../game/wanted.js';
import { emit, muzzleFlash } from '../render/effects.js';
import { GB, addGeo, box, cylG, hexa, tube } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { showBig, toast } from '../ui/hud.js';
import { ROADS, blocked, pushOutOBB, rayBox } from '../world/collision.js';
import { burntMat } from './materials.js';

// ================= TANK =================
// The army's five-star tank: it rolls along the middle of the roads towards the player, shoving the traffic aside, and
// stops to shell them with its cannon once it has them in sight. Bullets barely scratch the armour; it takes about four
// direct rockets (or a few cars going up beside it) to stop. It goes up bigger than the chopper and leaves a burnt-out
// wreck in the road, its turret blown off its ring.
export const TANK_HP = 2400;
// bullets glance off: a rifle round does a tenth of its damage
export const BULLET_ARMOR = 0.1;
// half width and half length of the hull, and the turret: where it turns, how high, and how big it is
export const HW = 1.8, HL = 3.6;
const TURRET_Z = -0.3, TURRET_Y = 2.05, TUR_HW = 1.25, TUR_HL = 1.5, TUR_Y0 = 1.55, TUR_Y1 = 2.5, BARREL_L = 4.6;
// on the road: top speed, acceleration and how fast it turns on the spot at a junction (rad/s)
export const TOP = 7, ACCEL = 3, PIVOT = 0.9;
// how fast the turret traverses (rad/s), and how far off the aim it may still fire
export const TRAVERSE = 1.0, ON_TARGET = 0.06;
// the cannon: it sees and fires out to FIRE_RANGE, stops to fire inside HOLD_RANGE, and never fires closer than
// MIN_RANGE (well clear of its own blast: the shell goes off ROCKET_BLAST_R * SHELL.blastMul wide)
export const FIRE_RANGE = 85, HOLD_RANGE = 60, MIN_RANGE = 18;
export const SHELL = { dmg: 90, blastMul: 1.2, reload: [3.5, 4.5] };
// it blows up bigger than the chopper (r 12, dmg 300)
export const TANK_BLAST = { y: 1.2, r: 14, dmg: 340, power: 1.6 };
// after one is destroyed or drives off, the next may come this many seconds later
export const TANK_COOLDOWN = 45;
// how it treats what is in its way: cars are shoved ahead of it and dented every CRUSH_EVERY seconds it keeps pushing
const CRUSH_DMG = 45, CRUSH_EVERY = 0.4, RUN_OVER = 400, PLAYER_HURT = 35;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], EDGE = ROADS[ROADS.length - 1], STEP = ROADS[1] - ROADS[0];
const nearestRoad = v => ROADS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
// The way to drive from junction (x, z): the road whose next junction is nearest the target (or furthest from it
// when `away`), and only back the way it came when nothing else will do.
export function nextDir(x, z, tx, tz, back, away = false) {
  let best = null, bestS = Infinity;
  for (const [dx, dz] of DIRS) {
    const nx = x + dx * STEP, nz = z + dz * STEP; if (Math.abs(nx) > EDGE || Math.abs(nz) > EDGE) continue;
    let s = Math.hypot(nx - tx, nz - tz); if (away) s = -s;
    if (back && dx === back[0] && dz === back[1]) s += 1000;
    if (s < bestS) { bestS = s; best = [dx, dz]; }
  }
  return best;
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = { x: 0, z: 0 };
// a ray into a frame centred on (x, z) and turned to `yaw`, against an axis-aligned box there
function rayLocalBox(o, d, x, z, yaw, x0, y0, z0, x1, y1, z1) {
  const c = Math.cos(yaw), s = Math.sin(yaw), rx = o.x - x, rz = o.z - z;
  return rayBox(rx * c - rz * s, o.y, rx * s + rz * c, d.x * c - d.z * s, d.y, d.x * s + d.z * c, x0, y0, z0, x1, y1, z1);
}

const Tank = {
  kind: 'tank',
  blipLayer: 3,
  update(dt) {
    const t = this;
    if (t.dead) { wreckStep(t, dt); return; }
    // damage shows: grey smoke off the engine deck below half, black smoke and flames below a quarter
    const hpF = t.hp / TANK_HP, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    if (hpF < 0.5 && Math.random() < (hpF < 0.25 ? 0.9 : 0.4)) {
      emit(t.x - fx * 2.6, 1.8, t.z - fz * 2.6, 1, hpF < 0.25 ? '#2a2430' : '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
      if (hpF < 0.25 && Math.random() < 0.3) emit(t.x - fx * 2.6, 1.7, t.z - fz * 2.6, 1, '#ff8a3a', 2, 0.3, 0.25, 0, 1);
    }
    // it pulls out once the army stands down, and turns back if they are called in again
    if ((G.wanted < 5) !== t.leaving) { t.leaving = G.wanted < 5; t.sight = newSight(); }
    const dist = Math.hypot(P.x - t.x, P.z - t.z), pivot = turretPivot(t);
    t.losT -= dt;
    if (t.losT <= 0) { t.los = P.alive && !t.leaving && dist < FIRE_RANGE + 10 && !blocked(pivot.x, pivot.y, pivot.z, P.x, P.y + 1, P.z); t.losT = SIGHT_EVERY; }
    // stop and fight once it has a shot; otherwise roll on towards the player (or away, leaving)
    const hold = t.los && dist < HOLD_RANGE && dist > MIN_RANGE;
    drive(t, dt, hold);
    shoveAside(t, dt);
    aimTurret(t, dt);
    // the cannon fires only at a player it can see, after a short reaction, with the turret on them and a round loaded
    const ready = reactTo(t.sight, t.los && dist < FIRE_RANGE && dist > MIN_RANGE, dt);
    t.reloadT -= dt;
    if (ready && t.reloadT <= 0 && Math.abs(angDiff(t.turretYaw, t.aimYaw)) < ON_TARGET) fire(t);
    if (t.los) G.seenNow = true;
    if (t.leaving && dist > 110) removeTank(TANK_COOLDOWN);
    pose(t, dt);
  },
  raycast(o, d, maxT) {
    const t = this;
    let hit = rayLocalBox(o, d, t.x, t.z, t.yaw, -HW, 0, -HL, HW, TUR_Y0, HL);
    const tp = turretPivot(t);
    if (!t.turretOff) hit = Math.min(hit, rayLocalBox(o, d, tp.x, tp.z, t.turretYaw, -TUR_HW, TUR_Y0, -TUR_HL, TUR_HW, TUR_Y1, TUR_HL));
    return hit < maxT ? { t: hit } : null;
  },
  onShot(hit, dmg) {
    const t = this; emit(hit.p.x, hit.p.y, hit.p.z, 5, '#ffe9a8', 6, 0.2, 0.05); Sound.ting(1, hit.p);
    if (t.dead) return { head: false };
    t.damage(dmg * BULLET_ARMOR);
    if (!t.warned) { t.warned = true; toast('Bullets bounce off the tank. Hit it with <em>rockets</em> or blow up the cars around it.', 4); }
    return { head: false };
  },
  onRocket(dmg) { this.damage(dmg); },
  // only the player's blasts count: the army's own shells and rockets don't hurt it
  blast(x, y, z, R, dmg, byPlayer) {
    if (!byPlayer) return;
    const d = Math.hypot(this.x - x, this.z - z), r = R + HW; if (d < r) this.damage(dmg * (1 - d / r) * 0.6);
  },
  damage(dmg) {
    const t = this; if (t.dead) return;
    t.hp -= dmg; emit(t.x, 1.6, t.z, 4, '#ffd23e', 7, 0.3, 0.16);
    if (t.hp <= 0) destroy(t);
  },
  pushOut(o, r) { return pushOutOBB(o, r, this.x, this.z, this.yaw, HW, HL); },
  blip(radar) { if (!this.dead) radar.dot(this.x, this.z, radar.flash ? '#ffd23e' : '#ff3b4e', 12, true, 'sq'); },
  shouldDespawn() { const d = Math.hypot(this.x - P.x, this.z - P.z); return this.dead && ((this.deadT > 40 && d > 50) || d > 160); },
  dispose() { scene.remove(this.grp); if (G.tank === this) G.tank = null; },
};

// where the turret turns, in the world
function turretPivot(t) { _o.set(t.x + Math.sin(t.yaw) * TURRET_Z, TURRET_Y, t.z + Math.cos(t.yaw) * TURRET_Z); return _o; }

// Along the middle of the road from junction to junction; at each one it turns on the spot onto the road that gets
// it nearest the player. Holding, it brakes to a stop wherever it is.
function drive(t, dt, hold) {
  const want = Math.atan2(t.dirX, t.dirZ), turn = angDiff(t.yaw, want);
  if (Math.abs(turn) > 0.02) {
    t.v = Math.max(0, t.v - ACCEL * 2 * dt);
    if (t.v < 0.5) t.yaw += clamp(turn, -PIVOT * dt, PIVOT * dt);
  } else {
    t.yaw = want;
    t.v = hold ? Math.max(0, t.v - ACCEL * 2 * dt) : Math.min(TOP, t.v + ACCEL * dt);
  }
  if (t.v <= 0) return;
  const rem = (t.toX - t.x) * t.dirX + (t.toZ - t.z) * t.dirZ, step = t.v * dt;
  if (step < rem) { t.x += t.dirX * step; t.z += t.dirZ * step; return; }
  // at the junction: pick the next road
  t.x = t.toX; t.z = t.toZ;
  const d = nextDir(t.x, t.z, P.x, P.z, [-t.dirX, -t.dirZ], t.leaving);
  t.dirX = d[0]; t.dirZ = d[1]; t.toX = t.x + d[0] * STEP; t.toZ = t.z + d[1] * STEP;
}

// whatever is in its way: vehicles get shoved ahead of it and crushed if it keeps pushing, people get run over
function shoveAside(t, dt) {
  const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), vx = fx * t.v, vz = fz * t.v, moving = t.v > 1;
  for (const v of all('vehicle')) {
    if (!v.K.ram || Math.abs(v.x - t.x) > 8 || Math.abs(v.z - t.z) > 8) continue;
    const [off, r] = v.K.ram.hull, vf = Math.sin(v.yaw), vg = Math.cos(v.yaw);
    let px = 0, pz = 0;
    for (const s of [1, -1]) {
      _p.x = v.x + vf * off * s; _p.z = v.z + vg * off * s; const cx = _p.x, cz = _p.z;
      if (pushOutOBB(_p, r, t.x, t.z, t.yaw, HW, HL) && Math.hypot(_p.x - cx, _p.z - cz) > Math.hypot(px, pz)) { px = _p.x - cx; pz = _p.z - cz; }
    }
    if (!px && !pz) continue;
    v.x += px; v.z += pz;
    const l = Math.hypot(px, pz), nx = px / l, nz = pz / l;
    if (v === P.vehicle) {
      // the player's own ride is pushed back, and dented while the tank keeps rolling into it
      if (v.v * (Math.sin(v.yaw) * -nx + Math.cos(v.yaw) * -nz) > 0) v.v *= 0.3;
      if (moving && !(v.tankT > G.time)) { v.tankT = G.time + CRUSH_EVERY; v.damage(CRUSH_DMG * 0.6, false); cam.shake = Math.max(cam.shake, 0.4); Sound.thud(0.9, at(v, 0.7)); }
      continue;
    }
    if (!moving) { v.v = 0; continue; }
    if (v.K.slide) { v.kvx = vx * 1.4 + nx * 2.5; v.kvz = vz * 1.4 + nz * 2.5; v.kspin = (v.kspin || 0) + rnd(-0.8, 0.8); v.v = 0; if (v.mode === 'traffic') v.dazeT = 2; }
    else if (v.K.knock) { if (v.driver) v.ejectDriver(false); v.K.knock(v, vx * 1.6 + nx * 4, vz * 1.6 + nz * 4, 2.5); }
    if (!(v.tankT > G.time)) {
      v.tankT = G.time + CRUSH_EVERY; v.damage(CRUSH_DMG, false);
      Sound.thud(0.8, at(v, 0.7)); emit(v.x - nx * 1.2, 0.8, v.z - nz * 1.2, 6, '#ffd23e', 5, 0.3, 0.06);
    }
  }
  if (!moving) return;
  // anyone on foot in front of the tracks goes under them
  for (const n of all('npc')) {
    if (!n.alive || n.vehicle || Math.abs(n.x - t.x) > 6 || Math.abs(n.z - t.z) > 6) continue;
    _p.x = n.x; _p.z = n.z;
    if (pushOutOBB(_p, 0.5, t.x, t.z, t.yaw, HW, HL)) n.hurt(RUN_OVER, new THREE.Vector3(fx, 0, fz), false);
  }
  if (P.alive && !P.vehicle && P.y < 2 && !(t.hurtT > G.time)) {
    _p.x = P.x; _p.z = P.z;
    if (pushOutOBB(_p, 0.7, t.x, t.z, t.yaw, HW, HL)) { t.hurtT = G.time + 1; P.x = _p.x; P.z = _p.z; hurtPlayer(PLAYER_HURT); cam.shake = Math.max(cam.shake, 0.5); }
  }
}

// the turret swings round towards the player at its own pace, the gun lifting to them
function aimTurret(t, dt) {
  const tp = turretPivot(t), dx = P.x - tp.x, dz = P.z - tp.z, h = Math.hypot(dx, dz);
  t.aimYaw = t.leaving ? t.yaw : Math.atan2(dx, dz);
  t.turretYaw += clamp(angDiff(t.turretYaw, t.aimYaw), -TRAVERSE * dt, TRAVERSE * dt);
  const pitch = t.leaving ? 0 : clamp(Math.atan2(P.y + 1 - tp.y, h), -0.12, 0.5);
  t.pitch = lerp(t.pitch, pitch, Math.min(1, dt * 2));
}

function fire(t) {
  const tp = turretPivot(t), cp = Math.cos(t.pitch);
  _d.set(Math.sin(t.turretYaw) * cp, Math.sin(t.pitch), Math.cos(t.turretYaw) * cp);
  const muzzle = tp.clone().addScaledVector(_d, BARREL_L);
  const dir = new THREE.Vector3(P.x + rnd(-1, 1), P.y + 1, P.z + rnd(-1, 1)).sub(muzzle).normalize();
  fireRocket(muzzle, dir, SHELL.dmg, SHELL.blastMul, t);
  muzzleFlash(muzzle, true); emit(muzzle.x, muzzle.y, muzzle.z, 12, '#c8c0c8', 3, 0.9, 0.4, 0.5, 0.6);
  Sound.shot('cannon', 1.2, muzzle);
  t.reloadT = rnd(SHELL.reload[0], SHELL.reload[1]); t.recoil = 1;
}

function destroy(t) {
  t.dead = true; t.hp = 0; t.v = 0; t.deadT = 0;
  for (const m of t.meshes) m.material = burntMat;
  explosion(t.x, TANK_BLAST.y, t.z, TANK_BLAST.r, TANK_BLAST.dmg, true, TANK_BLAST.power);
  // the turret is blown up off its ring
  t.turretOff = true; t.tvy = 9; t.tspin = rnd(-2, 2); t.tlift = 0;
  reward(t.x, t.z, 5000, 'Tank destroyed'); addHeat(10);
  if (G.tank === t) { G.tank = null; G.tankT = TANK_COOLDOWN; }
}
// the wreck smokes, and its turret comes back down askew on the hull
function wreckStep(t, dt) {
  t.deadT += dt;
  if (Math.random() < dt * 5) emit(t.x, 2, t.z, 1, '#3a3240', 1.5, 2.2, 0.8, 2, 1);
  if (t.tvy || t.tlift > 0) {
    t.tvy -= 20 * dt; t.tlift = Math.max(0, t.tlift + t.tvy * dt); t.turret.rotation.y += t.tspin * dt;
    if (t.tlift === 0 && t.tvy < 0) { t.tvy = 0; t.turret.rotation.z = 0.18; t.turret.position.x += 0.4; Sound.thud(0.8, at(t, 2)); }
    t.turret.position.y = TUR_Y0 + t.tlift;
  }
}

function pose(t, dt) {
  t.recoil = Math.max(0, (t.recoil || 0) - dt * 3);
  // the hull rocks back on a shot and pitches a touch as it pulls away or brakes
  const acc = dt ? (t.v - (t.lastV || 0)) / dt : 0; t.lastV = t.v;
  t.rock = lerp(t.rock || 0, clamp(-acc * 0.01, -0.03, 0.03) + t.recoil * 0.04, Math.min(1, dt * 6));
  t.grp.position.set(t.x, 0, t.z); t.grp.rotation.set(-t.rock, t.yaw, 0, 'YXZ');
  t.turret.rotation.y = t.turretYaw - t.yaw; t.gun.rotation.x = -t.pitch; t.gun.position.z = 0.55 - t.recoil * 0.5;
  if (t.v > 2 && Math.random() < dt * 8) {
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    for (const s of [-1, 1]) emit(t.x - fx * HL + fz * s * 1.4, 0.2, t.z - fz * HL - fx * s * 1.4, 1, '#bfb6a8', 1, 0.9, 0.35, 0.5, 0.5);
  }
}

// ---- the model: an original low-poly main battle tank in olive drab, +z forward ----
const OLIVE = '#4b5a32', DARK = '#36422a', TRACK = '#1d1e1b', WHEEL = '#2c2e2a', METAL = '#55574f';
function hullGeometry() {
  const g = new GB();
  for (const s of [-1, 1]) {
    // the tracks, their road wheels and drive sprockets, under a side skirt
    box(g, 0.7, 0.85, 6.9, s * 1.42, 0.5, 0, TRACK);
    for (let i = 0; i < 6; i++) addGeo(g, cylG(10), s * 1.79, 0.42, -2.55 + i * 1.02, 0.78, 0.06, 0.78, 0, 0, Math.PI / 2, WHEEL);
    addGeo(g, cylG(10), s * 1.79, 0.7, 3.25, 0.6, 0.06, 0.6, 0, 0, Math.PI / 2, WHEEL);
    addGeo(g, cylG(10), s * 1.79, 0.7, -3.25, 0.6, 0.06, 0.6, 0, 0, Math.PI / 2, WHEEL);
    box(g, 0.08, 0.42, 6.2, s * 1.79, 1.06, 0.1, DARK);
  }
  // the hull: a low box with a sloped glacis at the front and a slight slope down at the back
  hexa(g, [[-1.8, 0.95, -3.55], [1.8, 0.95, -3.55], [1.8, 1.5, -3.35], [-1.8, 1.5, -3.35],
    [-1.8, 0.85, 3.6], [1.8, 0.85, 3.6], [1.8, 1.55, 2.3], [-1.8, 1.55, 2.3]], OLIVE);
  box(g, 2.2, 0.6, 6.8, 0, 0.6, 0, DARK);
  // engine deck grilles, tow hooks, headlights and a stowage box
  for (let i = 0; i < 3; i++) box(g, 2.6, 0.03, 0.18, 0, 1.53, -2.2 - i * 0.35, '#2a3020');
  for (const s of [-1, 1]) { box(g, 0.2, 0.2, 0.16, s * 1.1, 0.9, 3.62, METAL); box(g, 0.24, 0.16, 0.1, s * 1.45, 1.42, 2.62, '#e8e2b0'); }
  box(g, 2.6, 0.45, 0.5, 0, 1.75, -3.3, DARK);
  return g.geometry();
}
function turretGeometry() {
  const g = new GB();
  // a flat, angular turret with a bustle out the back
  hexa(g, [[-1.15, 0, -1.6], [1.15, 0, -1.6], [0.95, 0.85, -1.5], [-0.95, 0.85, -1.5],
    [-1.25, 0, 1.4], [1.25, 0, 1.4], [0.85, 0.85, 1.05], [-0.85, 0.85, 1.05]], OLIVE);
  hexa(g, [[-1.25, 0, 1.4], [1.25, 0, 1.4], [0.85, 0.85, 1.05], [-0.85, 0.85, 1.05],
    [-0.6, 0.1, 1.75], [0.6, 0.1, 1.75], [0.45, 0.6, 1.6], [-0.45, 0.6, 1.6]], OLIVE);
  // commander's cupola and hatch, a roof machine gun, smoke dischargers and the radio aerial
  addGeo(g, cylG(8), 0.45, 1.0, -0.4, 0.7, 0.3, 0.7, 0, 0, 0, DARK);
  addGeo(g, cylG(8), 0.45, 1.17, -0.4, 0.6, 0.06, 0.6, 0, 0, 0, OLIVE);
  tube(g, [-0.4, 1.0, -0.2], [-0.4, 1.0, 0.7], 0.04, TRACK, 6); box(g, 0.14, 0.18, 0.3, -0.4, 0.95, -0.25, TRACK);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) tube(g, [s * 1.0, 0.55, 0.6 - i * 0.22], [s * 1.25, 0.75, 0.75 - i * 0.22], 0.06, DARK, 6);
  tube(g, [-0.7, 0.85, -1.3], [-0.7, 3.2, -1.3], 0.02, TRACK, 4);
  return g.geometry();
}
function gunGeometry() {
  const g = new GB();
  // mantlet, the long barrel with a fume extractor half way along, and the muzzle
  box(g, 0.75, 0.55, 0.5, 0, 0, 0, DARK);
  tube(g, [0, 0, 0.2], [0, 0, BARREL_L - 0.55], 0.11, OLIVE, 10);
  tube(g, [0, 0, 1.6], [0, 0, 2.3], 0.17, OLIVE, 10);
  tube(g, [0, 0, BARREL_L - 0.85], [0, 0, BARREL_L - 0.55], 0.15, DARK, 10);
  return g.geometry();
}
let GEOS = null;
export function buildTank() {
  if (!GEOS) GEOS = { hull: hullGeometry(), turret: turretGeometry(), gun: gunGeometry() };
  const grp = new THREE.Group(), hull = new THREE.Mesh(GEOS.hull, charMat);
  const turret = new THREE.Group(), tm = new THREE.Mesh(GEOS.turret, charMat);
  turret.position.set(0, TUR_Y0, TURRET_Z); turret.add(tm);
  const gun = new THREE.Group(), gm = new THREE.Mesh(GEOS.gun, charMat);
  gun.position.set(0, TURRET_Y - TUR_Y0, 0.55); gun.add(gm); turret.add(gun);
  grp.add(hull, turret);
  return { grp, turret, gun, meshes: [hull, tm, gm] };
}

// Rolls in at a junction 90 to 140 m from the player, out of their sight if it can, facing the way towards them.
export function spawnTank() {
  const spots = [];
  for (const x of ROADS) for (const z of ROADS) {
    const d = Math.hypot(x - P.x, z - P.z); if (d < 90 || d > 140) continue;
    spots.push({ x, z, seen: !blocked(x, 2, z, P.x, P.y + 1.6, P.z) });
  }
  if (!spots.length) {
    const x = nearestRoad(P.x + (P.x > 0 ? -100 : 100)), z = nearestRoad(P.z);
    spots.push({ x, z, seen: true });
  }
  const hidden = spots.filter(s => !s.seen), s = (hidden.length ? hidden : spots)[Math.floor(Math.random() * (hidden.length || spots.length))];
  const d = nextDir(s.x, s.z, P.x, P.z, null), m = buildTank();
  const t = Object.assign(Object.create(Tank), m, {
    x: s.x, z: s.z, yaw: Math.atan2(d[0], d[1]), dirX: d[0], dirZ: d[1], toX: s.x + d[0] * STEP, toZ: s.z + d[1] * STEP, v: 0,
    hp: TANK_HP, alive: true, dead: false, leaving: false, los: false, losT: 0, sight: newSight(), reloadT: 2, recoil: 0, pitch: 0,
  });
  t.turretYaw = t.aimYaw = t.yaw;
  scene.add(t.grp); pose(t, 0);
  G.tank = addEntity(t);
  showBig('Tank incoming');
  return t;
}
// clear the tank away, and its wrecks too with `wrecks`; the next one may come `cooldown` seconds later
export function removeTank(cooldown, wrecks = false) {
  if (G.tank) removeEntity(G.tank);
  if (wrecks) for (const t of all('tank')) removeEntity(t);
  G.tank = null;
  if (cooldown != null) G.tankT = cooldown;
}
