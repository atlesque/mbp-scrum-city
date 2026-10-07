import { kb } from '../../core/controls.js';
import { clamp, lerp, rnd } from '../../core/util.js';
import { seatedLegs, shadowGeo, shadowMat } from '../../characters/character.js';
import { emit } from '../../render/effects.js';
import { scene } from '../../render/scene.js';
import { groundAt } from '../../world/city.js';
import { collide, pushOutSeg } from '../../world/collision.js';
import { arcadeDrive, followLane, keepOnGrid } from '../drive.js';
import { rolling, spinWheels, wheelAt } from '../wheels.js';

const bikeMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x2e2e36 });
const bikeMatteMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const bikeGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const bikeGlassMat = new THREE.MeshPhongMaterial({ color: '#b5cce0', transparent: true, opacity: 0.32, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
// the ground under a bike's wheel, or the top of the car it is riding over where that is higher (see vehicles/knock.js)
const surfaceAt = (b, x, z) => Math.max(groundAt(x, z), b.over ? b.over.K.topAt(b.over, x, z) : -Infinity);
const TURN_X = [-150, -100, -50, 0, 50, 100, 150, 200], TURN_Z = [-150, -100, -50, 0, 50, 100, 150];

// A vehicle kind: everything about how bikes behave, whatever the model.
//   handling                 defaults for arcadeDrive (a model's `handling` overrides them)
//   build(v) / pose(v, dt)   make the mesh { grp, seat, solid, lit } and place it each frame
//   drive(v, dt, controls)   player physics; collideSelf(v) pushes it out of the world afterwards
//   afterDrive(v, dt)        optional extra after a player-driven step (lean)
//   ai: { mode(v, dt) }      AI per vehicle mode; coast(v, dt) runs when no AI applies
//   seat / unseat / aim      put a character on board, take them off, pose their arms to aim
//   seatZ(v)                 where along the vehicle a rider gets off
//   exitAt(v)                where the player stands after getting off
//   hitBox(v)                axis-aligned box for bullets { hx, hz, h }
//   pushOut(v, o, r)         keep people and other vehicles out
//   reach(v, p), reachMax    how close the player must be to get on
//   jack, shoveOff(v, a, p)  carjacking: the prompt's verb, and optionally where the ejected rider `a` lands
//   onDriverGone(v), wreck(v), blip(v, radar), dispose(v)
//   fx, blast, wreckReward   fire and smoke, explosion size, heat and cash for wrecking one
//                            (fx.fuse: seconds alight before it goes up; crashFuse when a collision set it alight)
//   bumper                   zone ahead that runs people over: back, front, half width, speed kept
//   crash                    exitSpeed above which getting off is a crash, hurt multiplier on big hits
//   ram, knock(v, vx, vz, up) mass and body for ramming, and how it flies when rammed (see vehicles/knock.js)
//   ridesOver, topAt(v, x, z) the closing speed up to which it rides over a car, and the top of a kind ridden over
//   camera                   chase distance, aiming distance and eye height
//   verb, tip(M)             'ride' or 'drive', and the first-time help toast
//   laneHalf, trafficDespawn, ambientEngine, stopsWhileBurning
//   enclosed, occupantHit    riders sit inside (cars): bullets through the windows reach them via occupantHit(v, o, d, maxT)
export const bike = {
  hull: { half: 0.62, r: 0.42 },
  verb: 'ride',
  handling: { top: 34, boostTop: 46, accel: 11, boostAccel: 15, brake: 26, reverseBrake: 22, reverseTop: 5, reverseAccel: 7, handbrake: 32, coast: 1.6, drag: 0.01, turnLow: 1.8, turnHigh: 0.9, maxSteer: 0.5 },
  traffic: { look: 7, decel: 28, accel: 8, patience: 2.5, hornAfter: 1.2 },
  fx: { smokeRate: 3, smokeY: 0.8, smokeSpeed: 1.2, smokeLife: 1.8, smokeSize: 0.4, fireRate: 0.5, fireY: 0.9, fireSize: 0.25, spread: 0.4, fuse: 1.4, boomFuse: 0.2, crashFuse: 40 },
  blast: { y: 0.6, r: 6, dmg: 120 },
  wreckReward: { heat: 2, cash: 0 },
  bumper: { back: -0.6, front: 1.35, half: 0.7, slow: 0.82 },
  crash: { exitSpeed: 9, hurt: 1.4 },
  ram: { mass: 1, hull: [0.62, 0.42], heavierAt: 3, sameAt: 10 },
  ridesOver: 12, // m/s: meet a car slower than this and ride up over it, faster and crash into it
  camera: { dist: 6.2, aimDist: 3.4, height: 1.95, fovPerSpeed: 0.35, minArm: 2.2 }, // minArm: see game/camera.js
  laneHalf: 1.4, trafficDespawn: 170, reachMax: 2.8, ambientEngine: true, jack: 'shove the rider off',
  tip: M => `${M.name}. <em>${kb('forward')}</em>/<em>${kb('back')}</em> throttle and brake, <em>${kb('left')}</em>/<em>${kb('right')}</em> lean, <em>${kb('sprint')}</em> boost, <em>${kb('jump')}</em> rear brake, <em>${kb('ride')}</em> to get off. Guns still work.`,

  init(v) { v.lean = -0.12; v.fallen = false; v.fallSide = 1; },
  build(v) { return makeBikeMesh(v.model); },
  pose(b, dt) {
    const m = b.mesh, S = b.model.spec, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    // ride up onto kerbs and over cars: each wheel follows what's under it, eased so a step up reads as a quick hop,
    // and drops off the far side under gravity
    if (b.over && Math.hypot(b.over.x - b.x, b.over.z - b.z) > 5) b.over = null;
    const tF = surfaceAt(b, b.x + fx * S.zF, b.z + fz * S.zF), tR = surfaceAt(b, b.x + fx * S.zR, b.z + fz * S.zR), k = Math.min(1, dt * 16);
    const wheel = (h, t, fall) => {
      if (h == null || !dt || t >= h) { b[fall] = 0; return h == null || !dt ? t : lerp(h, t, k); }
      b[fall] += 22 * dt; const y = Math.max(t, h - b[fall] * dt);
      if (y === t) { b.landV = Math.max(b.landV || 0, b[fall]); b[fall] = 0; }
      return y;
    };
    b.hF = wheel(b.hF, tF, 'fallF'); b.hR = wheel(b.hR, tR, 'fallR');
    // the hop as it mounts a car, settling back on the suspension
    if (b.hopV || b.hop > 0) { b.hopV -= 22 * dt; b.hop = (b.hop || 0) + b.hopV * dt; if (b.hop <= 0) b.hop = b.hopV = 0; }
    const y = b.hR - (b.hF - b.hR) * S.zR / S.wb + (b.air || 0) + (b.hop || 0);
    b.lift = Math.max(0, (b.hF + b.hR) / 2 + (b.hop || 0) - groundAt(b.x, b.z)); // how far above the road it rides, on a car
    m.grp.position.set(b.x, y, b.z); m.grp.rotation.set(-Math.atan2(b.hF - b.hR, S.wb), b.yaw, 0, 'YXZ');
    m.lean.rotation.z = b.lean; m.lean.position.y = clamp(Math.abs(b.lean) - 0.75, 0, 0.6) * 0.75; // rest on the cylinder head when down
    m.steer.rotation.y = b.steer;
    spinWheels(m.wheels, rolling(b) * dt);
    m.stand.visible = b.mode === 'parked' && !b.fallen && !b.dead;
  },
  drive(v, dt, c) { arcadeDrive(v, dt, c, v.model.spec.wb); },
  afterDrive(b, dt) { b.lean = lerp(b.lean, -Math.max(-0.7, Math.min(0.7, Math.atan(b.v * b.yawRate / 9.8))), Math.min(1, dt * 6)); },
  collideSelf(b) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), F = { x: b.x + fx * 0.62, z: b.z + fz * 0.62 }, R = { x: b.x - fx * 0.62, z: b.z - fz * 0.62 };
    const h1 = collide(F, 0.42, b), h2 = collide(R, 0.42, b);
    b.x = (F.x + R.x) / 2; b.z = (F.z + R.z) / 2; return h1 || h2;
  },
  ai: {
    traffic(b, dt) {
      b.turnCd -= dt;
      const ox = b.x, oz = b.z;
      followLane(b, dt, bike.traffic);
      // at a junction, sometimes swing onto the crossing road's lane
      if (b.turnCd <= 0 && b.v > 3) turn: {
        if (b.dirZ) { for (const r of TURN_Z) for (const t of [1, -1]) { const lz = r + 3 * t; if ((oz - lz) * (b.z - lz) < 0 && Math.random() < 0.28) { b.dirX = t; b.dirZ = 0; b.z = lz; b.turnCd = 1.5; b.v *= 0.75; break turn; } } }
        else for (const r of TURN_X) for (const t of [1, -1]) { const lx = r - 3 * t; if ((ox - lx) * (b.x - lx) < 0 && Math.random() < 0.28) { b.dirX = 0; b.dirZ = t; b.x = lx; b.turnCd = 1.5; b.v *= 0.75; break turn; } }
      }
      keepOnGrid(b, dt);
      const ty = Math.atan2(b.dirX, b.dirZ), dyaw = Math.atan2(Math.sin(ty - b.yaw), Math.cos(ty - b.yaw));
      if (Math.abs(dyaw) > 2.5) b.yaw = ty; else b.yaw += dyaw * Math.min(1, dt * 5);
      b.steer = lerp(b.steer, Math.max(-0.45, Math.min(0.45, dyaw * 0.6)), Math.min(1, dt * 8));
      b.lean = lerp(b.lean, Math.max(-0.6, Math.min(0.6, -dyaw * 0.9)) * Math.min(1, b.v / 6), Math.min(1, dt * 6));
      const a = b.driver; if (a) { a.x = b.x + Math.sin(b.yaw) * b.model.spec.seat; a.z = b.z + Math.cos(b.yaw) * b.model.spec.seat; a.yaw = b.yaw; }
    },
  },
  // rammed: thrown off its wheels with velocity (vx, vz) and an upward kick, tumbling until it lands
  knock(b, vx, vz, up) {
    b.kvx = vx; b.kvz = vz; b.avy = up; b.air = Math.max(b.air || 0, 0.01); b.v = 0;
    b.spin = rnd(-1, 1) * Math.hypot(vx, vz) * 0.15; b.roll = (Math.random() < 0.5 ? 1 : -1) * (4 + up);
    b.mode = 'fallen'; b.fallen = true; b.fallSide = -Math.sign(b.roll);
  },
  // riderless: fly and slide after being rammed, or roll to a stop, then rest on the stand or on its side
  coast(b, dt) {
    if (b.kvx || b.kvz || b.air > 0) {
      if (b.air > 0) {
        b.avy -= 22 * dt; b.air += b.avy * dt; b.yaw += b.spin * dt; b.lean += b.roll * dt;
        if (b.air <= 0) { // lands on its side and skids
          b.air = 0; b.kvx *= 0.6; b.kvz *= 0.6; b.lean = Math.atan2(Math.sin(b.lean), Math.cos(b.lean));
          emit(b.x, 0.2, b.z, 8, '#ffd23e', 4, 0.3, 0.05, -12, 1.5);
        }
      }
      const sp = Math.hypot(b.kvx, b.kvz), dec = b.air > 0 ? 0 : 9 * dt;
      if (!b.air && sp <= dec + 0.3) b.kvx = b.kvz = 0;
      else { const k = 1 - dec / sp; b.kvx *= k; b.kvz *= k; }
      b.x += b.kvx * dt; b.z += b.kvz * dt;
      if (bike.collideSelf(b)) { b.kvx *= 0.4; b.kvz *= 0.4; }
      if (!b.air && sp > 2 && Math.random() < 0.7) emit(b.x + rnd(-0.5, 0.5), 0.1, b.z + rnd(-0.5, 0.5), 1, '#ffd23e', 3, 0.25, 0.05, -12, 1.5);
      if (b.air > 0) return;
    } else if (Math.abs(b.v) > 0) {
      const dec = (b.fallen ? 9 : 5) * dt; b.v = Math.abs(b.v) <= dec ? 0 : b.v - Math.sign(b.v) * dec;
      b.x += Math.sin(b.yaw) * b.v * dt; b.z += Math.cos(b.yaw) * b.v * dt; if (bike.collideSelf(b)) b.v *= 0.5;
      if (b.fallen && Math.abs(b.v) > 2 && Math.random() < 0.7) emit(b.x + rnd(-0.5, 0.5), 0.1, b.z + rnd(-0.5, 0.5), 1, '#ffd23e', 3, 0.25, 0.05, -12, 1.5);
    } else if (b.mode === 'fallen') b.mode = 'parked';
    b.steer = lerp(b.steer, 0, Math.min(1, dt * 3));
    b.lean = lerp(b.lean, b.fallen ? -1.35 * b.fallSide : -0.12, Math.min(1, dt * 4));
  },
  seat(b, c) {
    b.mesh.seat.add(c.root); c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0);
    c.shadow.visible = false; c.legL.geometry = c.legR.geometry = seatedLegs(c);
    c.body.position.y = 0; c.body.rotation.set(0.1, 0, 0);
    c.legL.rotation.set(0, 0, 0.14); c.legR.rotation.set(0, 0, -0.14);
    bike.aim(b, c, null, 0);
  },
  unseat(b, c) {
    scene.add(c.root); c.shadow.visible = true; c.legL.geometry = c.legR.geometry = c.legGeo;
    c.body.rotation.set(0, 0, 0); c.legL.rotation.set(0, 0, 0); c.legR.rotation.set(0, 0, 0);
    c.armL.rotation.set(0, 0, 0, 'XYZ'); c.armR.rotation.set(0, 0, 0, 'XYZ');
  },
  aim(b, c, aimYaw, pitch) {
    c.armL.rotation.set(-0.95, 0, 0.12);
    if (aimYaw == null) c.armR.rotation.set(-0.95, 0, -0.12, 'XYZ');
    else c.armR.rotation.set(-Math.PI / 2 - pitch + 0.1, aimYaw, 0, 'YXZ');
  },
  seatZ: b => b.model.spec.seat,
  exitAt: b => ({ x: b.x + Math.cos(b.yaw) * 0.95, z: b.z - Math.sin(b.yaw) * 0.95 }),
  hitBox(b) { const sy = Math.abs(Math.sin(b.yaw)), cy = Math.abs(Math.cos(b.yaw)); return { hx: sy * 1.05 + cy * 0.32, hz: cy * 1.05 + sy * 0.32, h: b.fallen ? 0.6 : 0.98 }; },
  pushOut(b, o, r) { return Math.abs(b.x - o.x) <= 3 && Math.abs(b.z - o.z) <= 3 && pushOutSeg(o, r + 0.3, b.x, b.z, b.yaw, -0.8, 0.85); },
  reach: (b, p) => Math.hypot(b.x - p.x, b.z - p.z),
  // carjacked: the rider is shoved off the side away from the player, goes down on the road and gets up again
  shoveOff(b, a, p) {
    const sx = Math.cos(b.yaw), sz = -Math.sin(b.yaw), side = (p.x - b.x) * sx + (p.z - b.z) * sz > 0 ? -1 : 1;
    a.x = b.x + sx * side * 0.7; a.z = b.z + sz * side * 0.7; a.svx = sx * side * 5; a.svz = sz * side * 5;
    a.yaw = Math.atan2(-a.svx, -a.svz); a.downT = 1.8; a.stagT = 0; a.place();
  },
  onDriverGone(b) { b.mode = 'fallen'; b.fallen = true; b.fallSide = Math.random() < 0.5 ? 1 : -1; },
  // side: which side the player got off (1 the exitAt side); a bike dropped at speed falls away from them
  onPlayerExit(b, crash, speed, side = 1) {
    if (crash || speed > bike.crash.exitSpeed) { b.mode = 'fallen'; b.fallen = true; b.fallSide = -side; }
    else { b.mode = 'parked'; b.v = 0; }
  },
  onPlayerEnter(b) { b.fallen = false; b.v = 0; b.steer = 0; b.kvx = b.kvz = 0; b.air = 0; },
  wreck(b) { b.fallen = true; b.lean = -1.35 * b.fallSide; b.air = 0; b.kvx = b.kvz = 0; },
  blip(b, radar) { if (b.driver) radar.dot(b.x, b.z, '#f4f4f4', 5, false); else radar.dot(b.x, b.z, '#3ef0ff', 6, true, 'sq'); },
};

function makeBikeMesh(M) {
  const S = M.spec, G = M.geos(), grp = new THREE.Group(), lean = new THREE.Group(); grp.add(lean);
  const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.scale.set(0.95, 1, 2.6); sh.position.y = 0.03; grp.add(sh);
  const body = new THREE.Mesh(G.body, bikeMat), matte = new THREE.Mesh(G.matte, bikeMatteMat), glow = new THREE.Mesh(G.glow, bikeGlowMat), glass = new THREE.Mesh(G.glass, bikeGlassMat), stand = new THREE.Mesh(G.stand, bikeMat);
  const rw = wheelAt(M.wheel(false), bikeMat, 0, S.rR, S.zR, S.rR);
  lean.add(body, matte, glow, glass, stand, rw);
  // steering rig: tilt onto the rake axis, turn, tilt back so the parts keep their modelled pose
  const outer = new THREE.Group(), steer = new THREE.Group(), inner = new THREE.Group();
  outer.position.copy(S.H); outer.rotation.x = -S.rake; inner.rotation.x = S.rake; outer.add(steer); steer.add(inner); lean.add(outer);
  const stB = new THREE.Mesh(G.st, bikeMat), stG = new THREE.Mesh(G.stGlow, bikeGlowMat), fw = wheelAt(M.wheel(true), bikeMat, 0, S.rF - S.H.y, S.zF - S.H.z, S.rF); inner.add(stB, stG, fw);
  const decals = [-1, 1].map(s => { const m = new THREE.Mesh(G.decal, M.decal()); m.position.set(s * M.decalAt[0], M.decalAt[1], M.decalAt[2]); m.rotation.y = s * Math.PI / 2; lean.add(m); return m; });
  const seat = new THREE.Group(); seat.position.set(0, S.seatY, S.seat); lean.add(seat);
  return { grp, lean, steer, fw, rw, wheels: [fw, rw], seat, stand, solid: [body, matte, stand, rw, stB, fw], lit: [glow, stG, glass, ...decals] };
}
