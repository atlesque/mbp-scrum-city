import { bulletImpact, castBullet, fireRocket } from '../combat/combat.js';
import { rollZone, zoneDamage } from '../combat/hitzones.js';
import { Sound } from '../core/audio.js';
import { at } from '../core/spatial.js';
import { G, P } from '../core/state.js';
import { lerp, rnd } from '../core/util.js';
import { animateChar, muzzleOf } from '../characters/character.js';
import { startSwing, tickSwing } from '../characters/swing.js';
import { SIGHT_EVERY, aimFalloff, newSight, reactTo } from '../combat/sight.js';
import { removeEntity } from '../entities/registry.js';
import { hurtPlayer } from '../game/player.js';
import { setGun } from '../characters/character.js';
import { TRUCK, spray } from '../vehicles/firetruck.js';
import { emit, muzzleFlash, tracer } from '../render/effects.js';
import { WBY } from '../data/weapons.js';
import { blocked, isFree, onRoad } from '../world/collision.js';
import { faceTo, moveActor } from './npc.js';

// What people do each frame. An NPC type names its behaviour; each behaviour may define:
//   init(n)              set up the fields it needs (also called when an NPC switches behaviour)
//   update(n, dt)        move, animate and act while alive
//   onHurt(n, byPlayer)  react to being hit
//   onAlarm(n, x, z)     react to gunfire or a crash nearby
export const BEHAVIOURS = {
  // someone the player punched who punches back: squares up, closes in and throws jabs until they've had
  // enough, then runs
  brawl: {
    init(n) { n.timer = rnd(8, 13); n.swingCd = rnd(0.25, 0.6); n.panic = false; n.aiming = true; n.aimPitch = 0; n.melee = 'punch'; n.swing = null; n.stuck = 0; },
    update(n, dt) {
      const dx = P.x - n.x, dz = P.z - n.z, d = Math.hypot(dx, dz) || 1;
      n.timer -= dt;
      if (n.timer <= 0 || !P.alive || P.vehicle || d > 25 || n.hp < n.def.hp * 0.3) { n.aiming = false; n.melee = null; n.swing = null; n.become('wander'); BEHAVIOURS.wander.onHurt(n); return; }
      if (d > 1.0) moveActor(n, dx / d, dz / d, n.def.runSpeed * 0.7, dt); else n.moveSpeed = lerp(n.moveSpeed, 0, 0.3);
      faceTo(n, Math.atan2(dx, dz), dt, 12);
      n.swingCd -= dt;
      if (!n.swing && n.swingCd <= 0 && d < 1.4) { n.swingCd = rnd(0.7, 1.2); n.combo = ((n.combo || 0) + 1) % 2; startSwing(n, 'punch', 0.42, n.combo); Sound.swing(0.4, at(n, 1.3)); }
      if (n.swing) tickSwing(n, dt, () => {
        if (!P.alive || P.vehicle || Math.hypot(P.x - n.x, P.z - n.z) > 1.5) return;
        hurtPlayer(n.def.punch || 5, 'torso'); Sound.smack('fist', 0.8, at(n, 1.3));
      });
      animateChar(n, dt); n.place();
    },
    onHurt(n) { n.timer = Math.max(n.timer, 4); },
  },

  // stroll between random spots on the pavement; run from danger
  wander: {
    init(n) { n.state = 'walk'; n.tx = n.x; n.tz = n.z; n.timer = 0; n.stuck = 0; },
    update(a, dt) {
      let speed = a.def.walkSpeed, dx = 0, dz = 0;
      if (a.state === 'flee') {
        a.timer -= dt; if (a.timer <= 0) { a.state = 'walk'; a.panic = false; a.tx = a.x; a.tz = a.z; }
        dx = a.x - a.fx; dz = a.z - a.fz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        if (a.stuck > 0.4) { const t = dx; dx = -dz * (a.side || 1); dz = t * (a.side || 1); if (a.stuck > 1.2) { a.side = -(a.side || 1); a.stuck = 0; } }
        speed = a.def.runSpeed;
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
      animateChar(a, dt); a.place();
    },
    onHurt(a) { if (a.state !== 'flee') { a.state = 'flee'; a.timer = 10; a.fx = P.x; a.fz = P.z; a.panic = true; } },
    onAlarm(a, x, z) {
      if (a.state === 'flee') return;
      a.state = 'flee'; a.timer = rnd(6, 10); a.fx = x; a.fz = z; a.panic = Math.random() < 0.7;
      if (Math.random() < 0.25) Sound.scream(0.6, at(a, 1.5));
    },
  },

  // close in on the player, strafe at range and shoot in bursts; walk off once the heat is gone
  hunt: {
    init(e) { Object.assign(e, { los: false, losT: 0, sight: newSight(), fireT: rnd(0.8, 1.6), burst: 0, burstT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rnd(1, 3), stuck: 0, detourT: 0, dx: 0, dz: 0, leaving: false }); },
    update(e, dt) {
      const def = e.def, dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 1;
      if (def.leaveBelow && G.wanted < def.leaveBelow) e.leaving = true;
      e.losT -= dt;
      if (e.losT <= 0) { e.los = P.alive && dist < 90 && !blocked(e.x, 1.5, e.z, P.x, P.y + 1.3, P.z); e.losT = SIGHT_EVERY; }
      if (e.leaving) {
        e.aiming = false; moveActor(e, -dx / dist, -dz / dist, def.speed * 0.8, dt, e.r); faceTo(e, Math.atan2(-dx, -dz), dt);
        animateChar(e, dt); e.place();
        if (dist > 75 || (dist > 40 && !e.los)) removeEntity(e);
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
        if (dist < (def.minRange || 6)) { mx -= dx / dist; mz -= dz / dist; }
      }
      if (moveActor(e, mx, mz, spd, dt, e.r)) { e.stuck += dt; if (e.stuck > 0.4 && e.detourT <= 0) { const s = Math.random() < 0.5 ? 1 : -1; e.dx = -dz / dist * s; e.dz = dx / dist * s; e.detourT = rnd(0.8, 1.6); e.stuck = 0; } }
      else e.stuck = 0;
      e.aiming = e.los && dist < def.range * 1.15 && P.alive;
      if (e.aiming) { faceTo(e, Math.atan2(dx, dz), dt, 12); e.aimPitch = Math.atan2(P.y + 1.2 - 1.4, dist); }
      else if (Math.abs(mx) + Math.abs(mz) > 0.01) faceTo(e, Math.atan2(mx, mz), dt, 8);
      // firing: only at a player in view, after a short reaction; at most five people open fire at once
      const ready = reactTo(e.sight, e.aiming, dt);
      if (!e.aiming) e.burst = 0;
      e.fireT -= dt;
      if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = def.gap; shootAtPlayer(e, dist); } }
      else if (e.fireT <= 0 && ready && dist < def.range && dist > (def.minRange || 0) && G.shootersNow < 5) { G.shootersNow++; e.burst = def.burst; e.burstT = 0; e.fireT = def.rate * rnd(0.8, 1.3); }
      animateChar(e, dt); e.place();
    },
    onHurt(e) { e.los = true; e.losT = 0.3; },
  },

  // A fireman off the fire truck (n.truck, see vehicles/firetruck.js): he runs his hose out to the burning vehicle nearest
  // the truck, stands a few metres off it on the truck's side (the two of them a little apart) and hoses it down until the
  // fire is out, then takes the next one. With nothing left burning he walks back and climbs aboard. Hurt, he drops it
  // all and runs for a bit, then goes back to work.
  douse: {
    init(n) { n.state = 'go'; n.job = null; n.stuck = 0; n.aiming = false; n.panic = false; },
    update(n, dt) {
      const t = n.truck;
      if (!t || t.removed || t.dead) { n.truck = null; setGun(n.c, null); n.become('wander'); return; }
      if (n.state === 'flee') { BEHAVIOURS.wander.update(n, dt); if (n.state !== 'flee') n.state = 'go'; return; }
      if (!n.job || n.job.removed || n.job.dead || !(n.job.burnT > 0)) n.job = t.fireNear();
      const job = n.job;
      let tx, tz, sprayNow = false;
      if (job) {
        const a = Math.atan2(t.x - job.x, t.z - job.z) + n.side * 0.6;
        tx = job.x + Math.sin(a) * DOUSE_AT; tz = job.z + Math.cos(a) * DOUSE_AT;
        const d = Math.hypot(job.x - n.x, job.z - n.z);
        sprayNow = d < TRUCK.reach && (Math.hypot(tx - n.x, tz - n.z) < 0.7 || n.stuck > 1 || d < DOUSE_AT);
      } else {
        const door = t.doorAt(n.side), way = t.wayToDoor(n.x, n.z, n.side); tx = way.x; tz = way.z;
        if (Math.hypot(door.x - n.x, door.z - n.z) < 0.9) { t.board(n); return; }
      }
      if (sprayNow) {
        setGun(n.c, 'nozzle'); n.aiming = true; n.twoHand = true; n.aimPitch = 0.12;
        n.moveSpeed = lerp(n.moveSpeed, 0, 0.3); faceTo(n, Math.atan2(job.x - n.x, job.z - n.z), dt, 8);
        spray(n, job, dt); if (job.douse(dt)) n.job = null;
      } else {
        setGun(n.c, 'fireaxe'); n.aiming = false;
        let dx = tx - n.x, dz = tz - n.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        if (n.stuck > 0.4) { const k = dx; dx = -dz * (n.sideStep || 1); dz = k * (n.sideStep || 1); if (n.stuck > 1.6) { n.sideStep = -(n.sideStep || 1); n.stuck = 0.5; } }
        if (moveActor(n, dx, dz, job ? n.def.runSpeed : n.def.walkSpeed, dt)) n.stuck += dt; else n.stuck = Math.max(0, n.stuck - dt);
        faceTo(n, Math.atan2(dx, dz), dt, 8);
      }
      animateChar(n, dt); n.place();
    },
    onHurt(n) {
      if (n.state === 'flee') return;
      setGun(n.c, null); n.aiming = false;
      n.state = 'flee'; n.timer = rnd(5, 8); n.fx = P.x; n.fz = P.z; n.panic = true;
    },
  },

  // coming down a UFO's tractor beam (vehicles/ufo.js): sinks slowly, turning, then lands and does what its type does
  beamdown: {
    init(n) { n.aiming = false; n.panic = false; n.svx = n.svz = 0; n.vy = 0; },
    update(n, dt) {
      n.y = Math.max(0, (n.y || 0) - BEAM_SINK * dt); n.yaw += dt * 2.5; n.moveSpeed = 0;
      animateChar(n, dt); n.place();
      if (n.y === 0) n.become(n.def.behaviour);
    },
  },

  // sitting on a vehicle that steers itself; a wounded rider guns it
  ride: {
    update() {},
    onHurt(n) { if (n.vehicle) n.vehicle.top = Math.min(24, n.vehicle.H.boostTop ?? 24); },
  },
};

// how far off a burning vehicle a fireman stands to hose it
const DOUSE_AT = 4;
// how fast someone sinks down a UFO's beam, m/s
export const BEAM_SINK = 5;

function shootAtPlayer(e, dist) {
  if (!P.alive) return;
  const from = muzzleOf(e.c).clone();
  const sprint = P.moveSpeed > 6 ? 0.55 : P.moveSpeed > 1 ? 0.8 : 1;
  const chance = e.def.acc * 1.1 * aimFalloff(dist) * sprint;
  const target = new THREE.Vector3(P.x, P.y + 1.2, P.z);
  const hit = Math.random() < chance && !blocked(from.x, from.y, from.z, target.x, target.y, target.z);
  if (!hit) target.add(new THREE.Vector3(rnd(-1.6, 1.6), rnd(-0.9, 1.2), rnd(-1.6, 1.6)));
  const laser = WBY[e.def.gun].laser;
  if (laser) emit(from.x, from.y, from.z, 3, '#6dff8a', 2, 0.15, 0.06); else muzzleFlash(from, !!e.def.bigFlash);
  Sound.shot(e.def.gun, 0.7, at(e, 1.3));
  // a rocket flies at where they aim, on target or off; the blast does the damage
  if (e.def.rocket) { fireRocket(from, target.sub(from).normalize(), e.def.dmg, 1, e); return; }
  if (hit) { tracer(from, target, true, laser); const zone = rollZone(); hurtPlayer(zoneDamage(e.def.dmg, zone), zone); Sound.impact('flesh', 1, target); return; }
  // a miss flies on past the player into whatever is behind them, and lands there with its own sound
  const d = target.clone().sub(from), h = castBullet(from, d.normalize(), from.distanceTo(target) + 40, e);
  tracer(from, h.kind === 'none' ? target : h.p, true, laser); bulletImpact(h);
  if (dist < 12) Sound.ting(0.5, at(target, 1.3));
}
