import { disposeChar, makeCharacter, randomLook, shadowGeo, shadowMat } from '../characters/character.js';
import { damageActor, explosion } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { G, I, P, bikes, cam, cars, enemies, keys, peds, riders } from '../core/state.js';
import { $, angDiff, clamp, lerp, pick, rnd } from '../core/util.js';
import { addHeat } from '../game/wanted.js';
import { alarm, hurtPlayer, pan3d, vol3d } from '../npcs/actors.js';
import { emit } from '../render/effects.js';
import { GB, box, boxAB } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { toast } from '../ui/hud.js';
import { blockedAhead, burntMat, laneFor } from './cars.js';
import { GS, gsDecalMat, gsGeos, gsWheelGeo } from './models/gs.js';
import { T7, t7DecalMat, t7Geos, t7WheelGeo } from './models/t7.js';
import { groundAt } from '../world/city.js';
import { ROADS, collide } from '../world/collision.js';

const bikeMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x2e2e36 });
const bikeMatteMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const bikeGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const bikeGlassMat = new THREE.MeshPhongMaterial({ color: '#b5cce0', transparent: true, opacity: 0.32, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });

// every rideable model; traffic picks one at random
const BIKE_MODELS = {
  gs: { name: 'BMW R 1300 GS', short: 'R 1300 GS', tag: 'GS', spec: GS, geos: gsGeos, wheel: gsWheelGeo, decal: gsDecalMat, decalAt: [0.152, 0.81, -0.44], rev: 1 },
  t7: { name: 'Yamaha Ténéré 700 Rally', short: 'Ténéré 700', tag: 'Ténéré', spec: T7, geos: t7Geos, wheel: t7WheelGeo, decal: t7DecalMat, decalAt: [0.249, 0.88, 0.38], rev: 1.12 },
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

// ---- riders ----
function seatedLegs(c) {
  if (c.sitGeo) return c.sitGeo;
  const L = c.look, g = new GB();
  boxAB(g, [0, 0, 0], [0, -0.06, 0.42], 0.2, 0.22, L.pants);
  boxAB(g, [0, -0.06, 0.4], [0, -0.56, 0.3], 0.17, 0.18, L.shorts ? L.skin : L.pants);
  box(g, 0.21, 0.1, 0.3, 0, -0.6, 0.36, L.shoes || '#2a2226');
  return (c.sitGeo = g.geometry());
}
export function riderArms(c, aimYaw, pitch) {
  c.armL.rotation.set(-0.95, 0, 0.12);
  if (aimYaw == null) c.armR.rotation.set(-0.95, 0, -0.12, 'XYZ');
  else c.armR.rotation.set(-Math.PI / 2 - pitch + 0.1, aimYaw, 0, 'YXZ');
}
function seatChar(c, b) {
  b.mesh.seat.add(c.root); c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0);
  c.shadow.visible = false; c.legL.geometry = c.legR.geometry = seatedLegs(c);
  c.body.position.y = 0; c.body.rotation.set(0.1, 0, 0);
  c.legL.rotation.set(0, 0, 0.14); c.legR.rotation.set(0, 0, -0.14);
  riderArms(c, null, 0);
}
function unseatChar(c) {
  scene.add(c.root); c.shadow.visible = true; c.legL.geometry = c.legR.geometry = c.legGeo;
  c.body.rotation.set(0, 0, 0); c.legL.rotation.set(0, 0, 0); c.legR.rotation.set(0, 0, 0);
  c.armL.rotation.set(0, 0, 0, 'XYZ'); c.armR.rotation.set(0, 0, 0, 'XYZ');
}

// ---- bikes ----
function spawnBike(x, z, yaw, M) {
  M = M || BIKE_MODELS[pick(Object.keys(BIKE_MODELS))];
  const mesh = makeBikeMesh(M), b = { M, x, z, yaw, v: 0, steer: 0, lean: -0.12, hp: 160, dead: false, burnT: 0, deadT: 0, mode: 'parked', rider: null, mesh, dirX: Math.round(Math.sin(yaw)), dirZ: Math.round(Math.cos(yaw)), top: rnd(14, 18), ignoreT: 0, waitT: 0, hornT: 0, turnCd: 0, fallen: false, fallSide: 1, byPlayer: false };
  scene.add(mesh.grp); bikes.push(b); poseBike(b, 0); return b;
}
function spawnBiker(x, z, dx, dz) {
  const b = spawnBike(x, z, Math.atan2(dx, dz)); b.dirX = dx; b.dirZ = dz; b.mode = 'traffic'; b.v = b.top * 0.7; b.lean = 0;
  const look = Object.assign(randomLook(), { pa: null, pb: null, shirt: pick(['#1b1c22', '#2e323c', '#4a5260', '#5b4a3a', '#20283a']), pants: pick(['#1d1e24', '#2b2f38', '#3b3f45']), shorts: false, longSleeve: true, gloves: '#121214', hat: 'helmet', hatColor: pick(['#111114', '#f2f2f2', '#c8102e', '#1c69d4', '#ffd23e']), glasses: true, shoes: '#18171a' });
  const c = makeCharacter(look), a = { kind: 'ped', c, x, z, yaw: b.yaw, hp: 50, alive: true, state: 'walk', tx: x, tz: z, timer: 0, stuck: 0, moveSpeed: 0, deadT: 0, panic: false, bike: b };
  seatChar(c, b); b.rider = a; riders.push(a); return b;
}
export function spawnBikerNear() {
  const roads = ROADS.slice(1, -1).concat([200]);
  for (let i = 0; i < 12; i++) {
    const vertical = Math.random() < 0.5, near = roads.filter(r => Math.abs(r - (vertical ? P.x : P.z)) < 130); if (!near.length) continue;
    const road = pick(near), s = Math.random() < 0.5 ? 1 : -1, along = clamp((vertical ? P.z : P.x) + rnd(-130, 130), -195, 195);
    const dx = vertical ? 0 : s, dz = vertical ? s : 0, L = laneFor(road, dx, dz), x = vertical ? L.x : along, z = vertical ? along : L.z;
    if (Math.hypot(x - P.x, z - P.z) < 55) continue;
    if (cars.some(c => Math.abs(c.x - x) < 8 && Math.abs(c.z - z) < 8) || bikes.some(o => Math.abs(o.x - x) < 8 && Math.abs(o.z - z) < 8)) continue;
    return spawnBiker(x, z, dx, dz);
  }
}
export function removeBike(b) {
  const i = bikes.indexOf(b); if (i >= 0) bikes.splice(i, 1);
  if (b.rider && b.rider !== 'player') { const j = riders.indexOf(b.rider); if (j >= 0) riders.splice(j, 1); disposeChar(b.rider.c); }
  scene.remove(b.mesh.grp);
}
export function ejectRider(b, survive) {
  const a = b.rider; if (!a || a === 'player') return;
  b.rider = null; a.bike = null; const i = riders.indexOf(a); if (i >= 0) riders.splice(i, 1);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  a.x = b.x + fx * b.M.spec.seat; a.z = b.z + fz * b.M.spec.seat; a.yaw = b.yaw; unseatChar(a.c); a.c.root.position.set(a.x, 0, a.z); a.c.root.rotation.y = a.yaw;
  a.svx = survive ? 0 : fx * b.v * 0.7; a.svz = survive ? 0 : fz * b.v * 0.7;
  if (survive) { a.state = 'flee'; a.timer = 9; a.fx = P.x; a.fz = P.z; a.panic = true; }
  peds.push(a);
  b.mode = 'fallen'; b.fallen = true; b.fallSide = Math.random() < 0.5 ? 1 : -1;
}
export function damageBike(b, dmg, byPlayer) {
  if (b.dead || b.burnT > 0) return;
  b.hp -= dmg; if (byPlayer) b.byPlayer = true;
  if (b.rider && b.rider !== 'player') b.top = 24;
  if (b.hp <= 0) {
    b.burnT = byPlayer === 'boom' ? 0.2 : 1.4;
    if (b.rider === 'player') { dismountBike(true); toast(`Bail! The ${b.M.tag} is going up.`, 3); }
    else if (b.rider) ejectRider(b, true);
  }
}
function explodeBike(b) {
  b.dead = true; b.burnT = 0; b.v = 0; b.fallen = true; b.lean = -1.35 * b.fallSide;
  for (const m of b.mesh.solid) m.material = burntMat; for (const m of b.mesh.lit) m.visible = false;
  explosion(b.x, 0.6, b.z, 6, 120, b.byPlayer);
  if (b.byPlayer) addHeat(2);
}
function bikeCollide(b) {
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), F = { x: b.x + fx * 0.62, z: b.z + fz * 0.62 }, R = { x: b.x - fx * 0.62, z: b.z - fz * 0.62 };
  const h1 = collide(F, 0.42, b), h2 = collide(R, 0.42, b);
  b.x = (F.x + R.x) / 2; b.z = (F.z + R.z) / 2; return h1 || h2;
}
function poseBike(b, dt) {
  const m = b.mesh, S = b.M.spec, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  // ride up onto kerbs: each wheel follows the ground under it, eased so a kerb reads as a quick hop
  const tF = groundAt(b.x + fx * S.zF, b.z + fz * S.zF), tR = groundAt(b.x + fx * S.zR, b.z + fz * S.zR), k = Math.min(1, dt * 16);
  b.hF = b.hF == null || !dt ? tF : lerp(b.hF, tF, k); b.hR = b.hR == null || !dt ? tR : lerp(b.hR, tR, k);
  m.grp.position.set(b.x, b.hR - (b.hF - b.hR) * S.zR / S.wb, b.z); m.grp.rotation.set(-Math.atan2(b.hF - b.hR, S.wb), b.yaw, 0, 'YXZ');
  m.lean.rotation.z = b.lean; m.lean.position.y = Math.max(0, Math.abs(b.lean) - 0.75) * 0.75; // rest on the cylinder head when down
  m.steer.rotation.y = b.steer;
  m.fw.rotation.x += b.v / b.M.spec.rF * dt; m.rw.rotation.x += b.v / b.M.spec.rR * dt;
  m.stand.visible = b.mode === 'parked' && !b.fallen && !b.dead;
}
const TURN_X = [-150, -100, -50, 0, 50, 100, 150, 200], TURN_Z = [-150, -100, -50, 0, 50, 100, 150];
function driveNpcBike(b, dt) {
  b.ignoreT -= dt; b.hornT -= dt; b.turnCd -= dt;
  const blk = blockedAhead(b, 7, b.ignoreT > 0);
  if (blk) {
    b.v = Math.max(0, b.v - 28 * dt); b.waitT += dt;
    if (blk === 'car' && b.waitT > 2.5) { b.ignoreT = 1.5; b.waitT = 0; }
    if (blk === 'player' && b.waitT > 1.2 && b.hornT <= 0) { Sound.horn(vol3d(b.x, b.z), pan3d(b.x, b.z)); b.hornT = 3; }
  } else { b.v = Math.min(b.top, b.v + 8 * dt); b.waitT = 0; }
  const ox = b.x, oz = b.z;
  b.x += b.dirX * b.v * dt; b.z += b.dirZ * b.v * dt;
  // at a junction, sometimes swing onto the crossing road's lane
  if (b.turnCd <= 0 && b.v > 3) turn: {
    if (b.dirZ) { for (const r of TURN_Z) for (const t of [1, -1]) { const lz = r + 3 * t; if ((oz - lz) * (b.z - lz) < 0 && Math.random() < 0.28) { b.dirX = t; b.dirZ = 0; b.z = lz; b.turnCd = 1.5; b.v *= 0.75; break turn; } } }
    else for (const r of TURN_X) for (const t of [1, -1]) { const lx = r - 3 * t; if ((ox - lx) * (b.x - lx) < 0 && Math.random() < 0.28) { b.dirX = 0; b.dirZ = t; b.x = lx; b.turnCd = 1.5; b.v *= 0.75; break turn; } }
  }
  if (b.x > 204) b.x = -214; else if (b.x < -214) b.x = 204;
  if (b.z > 214) b.z = -214; else if (b.z < -214) b.z = 214;
  const ty = Math.atan2(b.dirX, b.dirZ), dyaw = angDiff(b.yaw, ty);
  if (Math.abs(dyaw) > 2.5) b.yaw = ty; else b.yaw += dyaw * Math.min(1, dt * 5);
  b.steer = lerp(b.steer, clamp(dyaw * 0.6, -0.45, 0.45), Math.min(1, dt * 8));
  b.lean = lerp(b.lean, clamp(-dyaw * 0.9, -0.6, 0.6) * Math.min(1, b.v / 6), Math.min(1, dt * 6));
  const a = b.rider; a.x = b.x + Math.sin(b.yaw) * b.M.spec.seat; a.z = b.z + Math.cos(b.yaw) * b.M.spec.seat; a.yaw = b.yaw;
}
export function updateBike(b, dt) {
  if (b.dead) { b.deadT += dt; if (Math.random() < dt * 3) emit(b.x, 0.8, b.z, 1, '#3a3240', 1.2, 1.8, 0.4, 2, 1); poseBike(b, 0); return; }
  if (b.burnT > 0) {
    b.burnT -= dt; if (Math.random() < 0.5) emit(b.x + rnd(-0.4, 0.4), 0.9, b.z + rnd(-0.4, 0.4), 1, Math.random() < 0.5 ? '#ff7a2a' : '#ffd23e', 1, 0.5, 0.25, 4, 1);
    if (b.burnT <= 0) { explodeBike(b); poseBike(b, 0); return; }
  }
  if (b.rider === 'player') { poseBike(b, dt); return; } // driven from updatePlayer
  if (b.rider) driveNpcBike(b, dt);
  else {
    // riderless: slide or roll to a stop, then rest on the stand or on its side
    if (Math.abs(b.v) > 0) {
      const dec = (b.fallen ? 9 : 5) * dt; b.v = Math.abs(b.v) <= dec ? 0 : b.v - Math.sign(b.v) * dec;
      b.x += Math.sin(b.yaw) * b.v * dt; b.z += Math.cos(b.yaw) * b.v * dt; if (bikeCollide(b)) b.v *= 0.5;
      if (b.fallen && Math.abs(b.v) > 2 && Math.random() < 0.7) emit(b.x + rnd(-0.5, 0.5), 0.1, b.z + rnd(-0.5, 0.5), 1, '#ffd23e', 3, 0.25, 0.05, -12, 1.5);
    } else if (b.mode === 'fallen') b.mode = 'parked';
    b.steer = lerp(b.steer, 0, Math.min(1, dt * 3));
    b.lean = lerp(b.lean, b.fallen ? -1.35 * b.fallSide : -0.12, Math.min(1, dt * 4));
  }
  poseBike(b, dt);
}
export function nearestFreeBike() {
  let best = null, bd = 2.8;
  for (const b of bikes) { if (b.rider || b.dead || b.burnT > 0) continue; const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < bd) { bd = d; best = b; } }
  return best;
}
export function mountBike(b) {
  P.bike = b; b.rider = 'player'; b.mode = 'player'; b.fallen = false; b.v = 0; b.steer = 0;
  seatChar(P.c, b); P.x = b.x; P.z = b.z; P.y = 0; P.vy = 0; P.grounded = true; P.lookT = -9;
  $('prompt').hidden = true; G.hudCache = ''; $('bikeName').textContent = b.M.short;
  if (!mountBike.told) mountBike.told = {};
  if (!mountBike.told[b.M.short]) { mountBike.told[b.M.short] = true; toast(b.M.name + '. <em>W</em>/<em>S</em> throttle and brake, <em>A</em>/<em>D</em> lean, <em>Shift</em> boost, <em>Space</em> rear brake, <em>F</em> to get off. Guns still work.', 7); }
}
export function dismountBike(crash) {
  const b = P.bike; if (!b) return;
  P.bike = null; b.rider = null; unseatChar(P.c);
  const sp = Math.abs(b.v);
  P.x = b.x + Math.cos(b.yaw) * 0.95; P.z = b.z - Math.sin(b.yaw) * 0.95; collide(P, 0.38);
  P.y = 0; P.vy = 0; P.grounded = true; P.yaw = b.yaw; P.vx = P.vz = 0; P.moveSpeed = 0;
  P.c.root.position.set(P.x, 0, P.z); P.c.root.rotation.y = P.yaw;
  if (crash || sp > 9) { b.mode = 'fallen'; b.fallen = true; b.fallSide = -1; if (sp > 9) hurtPlayer(Math.min(60, sp * 1.1)); }
  else { b.mode = 'parked'; b.v = 0; }
  G.hudCache = '';
}
export function ridePlayer(b, dt) {
  const thr = keys.KeyW || keys.ArrowUp, brk = keys.KeyS || keys.ArrowDown, boost = keys.ShiftLeft || keys.ShiftRight;
  const st = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0), top = boost ? 46 : 34;
  if (thr) b.v += b.v < -0.5 ? 22 * dt : (boost ? 15 : 11) * clamp(1 - (b.v / top) ** 2, -0.6, 1) * dt;
  if (brk) b.v = b.v > 0.4 ? b.v - 26 * dt : Math.max(-5, b.v - 7 * dt);
  if (keys.Space) b.v -= Math.sign(b.v) * Math.min(Math.abs(b.v), 32 * dt);
  if (!thr && !brk) b.v -= Math.sign(b.v) * Math.min(Math.abs(b.v), (1.6 + 0.01 * b.v * b.v) * dt);
  // soft steering: cap the turn rate (gentler the faster you go), ease into a lean and settle back a bit quicker
  const sp = Math.abs(b.v), maxYaw = lerp(1.8, 0.9, clamp(sp / 40, 0, 1)), maxSteer = sp < 0.5 ? 0.5 : Math.min(0.5, Math.atan(maxYaw * b.M.spec.wb / sp));
  b.steer = lerp(b.steer, st * maxSteer, Math.min(1, dt * (st ? 3.5 : 5)));
  const yawRate = b.v * Math.tan(b.steer) / b.M.spec.wb; b.yaw += yawRate * dt;
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  b.x += fx * b.v * dt; b.z += fz * b.v * dt;
  const nx = b.x, nz = b.z;
  if (bikeCollide(b)) {
    // how squarely we hit: the push-out direction against our direction of travel
    const px = b.x - nx, pz = b.z - nz, pl = Math.hypot(px, pz) || 1, head = Math.max(0, -(px * fx + pz * fz) / pl * Math.sign(b.v)), impact = Math.abs(b.v) * head;
    b.v = impact > 7 ? -Math.sign(b.v) * impact * 0.12 : b.v * (1 - head * 0.9);
    if (impact > 7) {
      Sound.thud(clamp(impact / 25, 0.3, 1), 0); cam.shake = Math.max(cam.shake, clamp(impact / 40, 0.1, 0.7));
      damageBike(b, impact * 1.6, false); if (impact > 15 && P.bike === b) hurtPlayer((impact - 13) * 1.4);
      if (P.bike !== b) return;
    }
  }
  // running people over
  if (Math.abs(b.v) > 4) for (const list of [peds, enemies, riders]) for (const a of list.slice()) {
    if (!a.alive || (a.bumpT || 0) > G.time) continue;
    const rx = a.x - b.x, rz = a.z - b.z, ah = (rx * fx + rz * fz) * Math.sign(b.v), la = Math.abs(rx * fz - rz * fx);
    if (ah > -0.6 && ah < 1.35 && la < 0.7) {
      a.bumpT = G.time + 0.8; damageActor(a, Math.abs(b.v) * 6, new THREE.Vector3(fx, 0, fz), true);
      if (a.alive && !a.bike) { a.x += fx * Math.sign(b.v) * 1.2; a.z += fz * Math.sign(b.v) * 1.2; }
      b.v *= 0.82; Sound.thud(0.6, 0); cam.shake = Math.max(cam.shake, 0.2); alarm(b.x, b.z, 25);
    }
  }
  b.lean = lerp(b.lean, -clamp(Math.atan(b.v * yawRate / 9.8), -0.7, 0.7), Math.min(1, dt * 6));
  // camera swings in behind the bike when the mouse is idle
  if (G.time - (P.lookT || 0) > 1.2 && Math.abs(b.v) > 3 && !I.mouseR) cam.yaw += angDiff(cam.yaw, b.yaw) * Math.min(1, dt * 2.2);
  P.x = b.x; P.z = b.z; P.y = 0; P.vy = 0; P.grounded = true; P.yaw = b.yaw; P.moveSpeed = Math.abs(b.v); P.vx = fx * b.v; P.vz = fz * b.v;
}
const GEARS = [0, 7, 13, 19, 26, 34, 50];
export function updateEngineSound() {
  let vol = 0, v = 0, thr = false, rev = 1;
  if (G.state === 'play') {
    if (P.bike) { rev = P.bike.M.rev; v = Math.abs(P.bike.v); thr = !!(keys.KeyW || keys.ArrowUp); vol = 0.16 + (thr ? 0.06 : 0); }
    else { let bd = 45; for (const b of bikes) if (b.rider && b.rider !== 'player') { const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < bd) { bd = d; rev = b.M.rev; v = b.v; thr = true; vol = 0.14 * vol3d(b.x, b.z); } } }
  }
  let rpm = 1050;
  if (v > 0.5) { let g = 0; while (g < 5 && v > GEARS[g + 1]) g++; rpm = 2600 + clamp((v - GEARS[g]) / (GEARS[g + 1] - GEARS[g]), 0, 1) * 5600 + (thr ? 300 : 0); }
  Sound.setEngine(vol, rpm * rev);
}
