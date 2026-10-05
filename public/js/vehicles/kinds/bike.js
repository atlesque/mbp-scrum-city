import { lerp, rnd } from '../../core/util.js';
import { seatedLegs, shadowGeo, shadowMat } from '../../characters/character.js';
import { emit } from '../../render/effects.js';
import { scene } from '../../render/scene.js';
import { groundAt } from '../../world/city.js';
import { collide, pushOutSeg } from '../../world/collision.js';
import { arcadeDrive, followLane, keepOnGrid } from '../drive.js';

const bikeMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x2e2e36 });
const bikeMatteMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const bikeGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const bikeGlassMat = new THREE.MeshPhongMaterial({ color: '#b5cce0', transparent: true, opacity: 0.32, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
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
//   onDriverGone(v), wreck(v), blip(v, radar), dispose(v)
//   fx, blast, wreckReward   fire and smoke, explosion size, heat and cash for wrecking one
//   bumper                   zone ahead that runs people over: back, front, half width, speed kept
//   crash                    exitSpeed above which getting off is a crash, hurt multiplier on big hits
//   camera                   chase distance, aiming distance and eye height
//   verb, tip(M)             'ride' or 'drive', and the first-time help toast
//   laneHalf, trafficDespawn, ambientEngine, stopsWhileBurning
//   enclosed, occupantHit    riders sit inside (cars): bullets through the windows reach them via occupantHit(v, o, d, maxT)
export const bike = {
  verb: 'ride',
  handling: { top: 34, boostTop: 46, accel: 11, boostAccel: 15, brake: 26, reverseBrake: 22, reverseTop: 5, reverseAccel: 7, handbrake: 32, coast: 1.6, drag: 0.01, turnLow: 1.8, turnHigh: 0.9, maxSteer: 0.5 },
  traffic: { look: 7, decel: 28, accel: 8, patience: 2.5, hornAfter: 1.2 },
  fx: { smokeRate: 3, smokeY: 0.8, smokeSpeed: 1.2, smokeLife: 1.8, smokeSize: 0.4, fireRate: 0.5, fireY: 0.9, fireSize: 0.25, spread: 0.4, fuse: 1.4, boomFuse: 0.2 },
  blast: { y: 0.6, r: 6, dmg: 120 },
  wreckReward: { heat: 2, cash: 0 },
  bumper: { back: -0.6, front: 1.35, half: 0.7, slow: 0.82 },
  crash: { exitSpeed: 9, hurt: 1.4 },
  camera: { dist: 6.2, aimDist: 3.4, height: 1.95, fovPerSpeed: 0.35 },
  laneHalf: 1.4, trafficDespawn: 170, reachMax: 2.8, ambientEngine: true,
  tip: M => M.name + '. <em>W</em>/<em>S</em> throttle and brake, <em>A</em>/<em>D</em> lean, <em>Shift</em> boost, <em>Space</em> rear brake, <em>F</em> to get off. Guns still work.',

  init(v) { v.lean = -0.12; v.fallen = false; v.fallSide = 1; },
  build(v) { return makeBikeMesh(v.model); },
  pose(b, dt) {
    const m = b.mesh, S = b.model.spec, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    // ride up onto kerbs: each wheel follows the ground under it, eased so a kerb reads as a quick hop
    const tF = groundAt(b.x + fx * S.zF, b.z + fz * S.zF), tR = groundAt(b.x + fx * S.zR, b.z + fz * S.zR), k = Math.min(1, dt * 16);
    b.hF = b.hF == null || !dt ? tF : lerp(b.hF, tF, k); b.hR = b.hR == null || !dt ? tR : lerp(b.hR, tR, k);
    m.grp.position.set(b.x, b.hR - (b.hF - b.hR) * S.zR / S.wb, b.z); m.grp.rotation.set(-Math.atan2(b.hF - b.hR, S.wb), b.yaw, 0, 'YXZ');
    m.lean.rotation.z = b.lean; m.lean.position.y = Math.max(0, Math.abs(b.lean) - 0.75) * 0.75; // rest on the cylinder head when down
    m.steer.rotation.y = b.steer;
    m.fw.rotation.x += b.v / S.rF * dt; m.rw.rotation.x += b.v / S.rR * dt;
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
  // riderless: slide or roll to a stop, then rest on the stand or on its side
  coast(b, dt) {
    if (Math.abs(b.v) > 0) {
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
  onDriverGone(b) { b.mode = 'fallen'; b.fallen = true; b.fallSide = Math.random() < 0.5 ? 1 : -1; },
  onPlayerExit(b, crash, speed) {
    if (crash || speed > bike.crash.exitSpeed) { b.mode = 'fallen'; b.fallen = true; b.fallSide = -1; }
    else { b.mode = 'parked'; b.v = 0; }
  },
  onPlayerEnter(b) { b.fallen = false; b.v = 0; b.steer = 0; },
  wreck(b) { b.fallen = true; b.lean = -1.35 * b.fallSide; },
  blip(b, radar) { if (b.driver) radar.dot(b.x, b.z, '#f4f4f4', 5, false); else radar.dot(b.x, b.z, '#3ef0ff', 6, true, 'sq'); },
};

function makeBikeMesh(M) {
  const S = M.spec, G = M.geos(), grp = new THREE.Group(), lean = new THREE.Group(); grp.add(lean);
  const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.scale.set(0.95, 1, 2.6); sh.position.y = 0.03; grp.add(sh);
  const body = new THREE.Mesh(G.body, bikeMat), matte = new THREE.Mesh(G.matte, bikeMatteMat), glow = new THREE.Mesh(G.glow, bikeGlowMat), glass = new THREE.Mesh(G.glass, bikeGlassMat), stand = new THREE.Mesh(G.stand, bikeMat);
  const rw = new THREE.Mesh(M.wheel(false), bikeMat); rw.position.set(0, S.rR, S.zR);
  lean.add(body, matte, glow, glass, stand, rw);
  // steering rig: tilt onto the rake axis, turn, tilt back so the parts keep their modelled pose
  const outer = new THREE.Group(), steer = new THREE.Group(), inner = new THREE.Group();
  outer.position.copy(S.H); outer.rotation.x = -S.rake; inner.rotation.x = S.rake; outer.add(steer); steer.add(inner); lean.add(outer);
  const stB = new THREE.Mesh(G.st, bikeMat), stG = new THREE.Mesh(G.stGlow, bikeGlowMat), fw = new THREE.Mesh(M.wheel(true), bikeMat);
  fw.position.set(0, S.rF - S.H.y, S.zF - S.H.z); inner.add(stB, stG, fw);
  const decals = [-1, 1].map(s => { const m = new THREE.Mesh(G.decal, M.decal()); m.position.set(s * M.decalAt[0], M.decalAt[1], M.decalAt[2]); m.rotation.y = s * Math.PI / 2; lean.add(m); return m; });
  const seat = new THREE.Group(); seat.position.set(0, S.seatY, S.seat); lean.add(seat);
  return { grp, lean, steer, fw, rw, seat, stand, solid: [body, matte, stand, rw, stB, fw], lit: [glow, stG, glass, ...decals] };
}
