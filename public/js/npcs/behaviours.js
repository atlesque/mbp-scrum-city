import { fireRocket } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { pan3d, vol3d } from '../core/spatial.js';
import { G, P } from '../core/state.js';
import { clamp, rnd } from '../core/util.js';
import { animateChar, muzzleOf } from '../characters/character.js';
import { removeEntity } from '../entities/registry.js';
import { hurtPlayer } from '../game/player.js';
import { muzzleFlash, tracer } from '../render/effects.js';
import { blocked, isFree, onRoad } from '../world/collision.js';
import { faceTo, moveActor } from './npc.js';

// What people do each frame. An NPC type names its behaviour; each behaviour may define:
//   init(n)              set up the fields it needs (also called when an NPC switches behaviour)
//   update(n, dt)        move, animate and act while alive
//   onHurt(n, byPlayer)  react to being hit
//   onAlarm(n, x, z)     react to gunfire or a crash nearby
export const BEHAVIOURS = {
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
      if (Math.random() < 0.25) Sound.scream(vol3d(a.x, a.z) * 0.6, pan3d(a.x, a.z));
    },
  },

  // close in on the player, strafe at range and shoot in bursts; walk off once the heat is gone
  hunt: {
    init(e) { Object.assign(e, { los: false, losT: 0, fireT: rnd(0.8, 1.6), burst: 0, burstT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rnd(1, 3), stuck: 0, detourT: 0, dx: 0, dz: 0, leaving: false }); },
    update(e, dt) {
      const def = e.def, dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 1;
      e.losT -= dt;
      if (e.losT <= 0) { e.los = P.alive && dist < 90 && !blocked(e.x, 1.5, e.z, P.x, P.y + 1.3, P.z); e.losT = rnd(0.15, 0.3); }
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
      // firing: at most five people open fire at once
      e.fireT -= dt;
      if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = def.gap; shootAtPlayer(e, dist); } }
      else if (e.fireT <= 0 && e.aiming && dist < def.range && dist > (def.minRange || 0) && G.shootersNow < 5) { G.shootersNow++; e.burst = def.burst; e.burstT = 0; e.fireT = def.rate * rnd(0.8, 1.3); }
      animateChar(e, dt); e.place();
    },
    onHurt(e) { e.los = true; e.losT = 0.3; },
  },

  // sitting on a vehicle that steers itself; a wounded rider guns it
  ride: {
    update() {},
    onHurt(n) { if (n.vehicle) n.vehicle.top = 24; },
  },
};

function shootAtPlayer(e, dist) {
  if (!P.alive) return;
  const from = muzzleOf(e.c).clone();
  const sprint = P.moveSpeed > 6 ? 0.55 : P.moveSpeed > 1 ? 0.8 : 1;
  const chance = e.def.acc * clamp(1.25 - dist / e.def.range * 0.7, 0.35, 1.1) * sprint;
  const target = new THREE.Vector3(P.x, P.y + 1.2, P.z);
  const hit = Math.random() < chance && !blocked(from.x, from.y, from.z, target.x, target.y, target.z);
  if (!hit) target.add(new THREE.Vector3(rnd(-1.6, 1.6), rnd(-0.9, 1.2), rnd(-1.6, 1.6)));
  muzzleFlash(from, !!e.def.bigFlash); Sound.shot(e.def.gun, vol3d(e.x, e.z) * 0.7, pan3d(e.x, e.z));
  // a rocket flies at where they aim, on target or off; the blast does the damage
  if (e.def.rocket) { fireRocket(from, target.sub(from).normalize(), e.def.dmg, e); return; }
  tracer(from, target, true);
  if (hit) hurtPlayer(e.def.dmg);
  else if (dist < 12) Sound.ting(0.5, pan3d(target.x, target.z));
}
