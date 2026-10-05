import { charMat } from '../characters/character.js';
import { explosion } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { G, P, bikes, cars, enemies, peds } from '../core/state.js';
import { pick, rnd } from '../core/util.js';
import { WANTED } from '../data/wanted.js';
import { dropCash } from '../game/pickups.js';
import { addHeat, mixPick } from '../game/wanted.js';
import { pan3d, spawnEnemy, vol3d } from '../npcs/actors.js';
import { PGEO, emit } from '../render/effects.js';
import { GB, box } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { ROADS, isFree } from '../world/collision.js';

// ================= CARS =================
const CAR_COLORS = ['#f4f0e8', '#ff7eb6', '#3fd6c8', '#ffe8b0', '#e8354a', '#7a5cff', '#ffb347', '#2f6fcf', '#1f1f28', '#b8f0e6'];
export const burntMat = new THREE.MeshLambertMaterial({ color: '#2a2428' });
export const lightRed = new THREE.MeshBasicMaterial({ color: '#ff2340' }), lightBlue = new THREE.MeshBasicMaterial({ color: '#2a6bff' });
function carMesh(color, cop) {
  const g = new GB(), body = cop ? '#16161c' : color;
  box(g, 2.0, 0.62, 4.3, 0, 0.62, 0, body);
  if (cop) box(g, 2.02, 0.5, 1.9, 0, 0.66, 0.1, '#f4f4f4');
  box(g, 1.72, 0.56, 2.1, 0, 1.2, -0.2, '#2a3f5a');
  box(g, 1.78, 0.08, 2.2, 0, 1.5, -0.2, body);
  box(g, 2.04, 0.06, 4.34, 0, 0.98, 0, cop ? '#16161c' : '#ffffff');
  for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) box(g, 0.3, 0.62, 0.62, sx * 0.94, 0.31, sz, '#141218');
  box(g, 0.4, 0.16, 0.05, 0.62, 0.72, 2.16, '#fff7c8'); box(g, 0.4, 0.16, 0.05, -0.62, 0.72, 2.16, '#fff7c8');
  box(g, 0.4, 0.14, 0.05, 0.62, 0.72, -2.16, '#ff2a40'); box(g, 0.4, 0.14, 0.05, -0.62, 0.72, -2.16, '#ff2a40');
  box(g, 2.06, 0.12, 0.2, 0, 0.42, 2.18, '#c9c9d4'); box(g, 2.06, 0.12, 0.2, 0, 0.42, -2.18, '#c9c9d4');
  const grp = new THREE.Group(), m = new THREE.Mesh(g.geometry(), charMat); grp.add(m);
  let lr = null, lb = null;
  if (cop) { lr = new THREE.Mesh(PGEO, lightRed); lr.scale.set(0.6, 0.18, 0.3); lr.position.set(0.35, 1.62, -0.2); lb = new THREE.Mesh(PGEO, lightBlue); lb.scale.set(0.6, 0.18, 0.3); lb.position.set(-0.35, 1.62, -0.2); grp.add(lr, lb); }
  return { grp, m, lr, lb };
}
export function spawnCar(x, z, dirX, dirZ, mode, cop) {
  const mesh = carMesh(pick(CAR_COLORS), cop);
  const c = { x, z, dirX, dirZ, mode, cop: !!cop, hp: 130, dead: false, burnT: 0, speed: mode === 'traffic' ? 10 : 0, top: rnd(9, 13), waitT: 0, ignoreT: 0, byPlayer: false, mesh, hx: dirX ? 2.15 : 1.0, hz: dirX ? 1.0 : 2.15, deadT: 0, hornT: 0 };
  mesh.grp.position.set(x, 0, z); mesh.grp.rotation.y = Math.atan2(dirX, dirZ); scene.add(mesh.grp); cars.push(c); return c;
}
export function laneFor(roadPos, dirX, dirZ) {
  // drive on the right
  if (dirZ) return { x: roadPos - 3 * dirZ, z: null };
  return { x: null, z: roadPos + 3 * dirX };
}
export function spawnTraffic(far) {
  for (let i = 0; i < 20; i++) {
    const vertical = Math.random() < 0.5, road = pick(ROADS.slice(1, -1).concat([200])), s = Math.random() < 0.5 ? 1 : -1;
    const along = rnd(-195, 195);
    const dx = vertical ? 0 : s, dz = vertical ? s : 0, L = laneFor(road, dx, dz);
    const x = vertical ? L.x : along, z = vertical ? along : L.z;
    if (far && Math.hypot(x - P.x, z - P.z) < 70) continue;
    if (cars.some(c => Math.abs(c.x - x) < 8 && Math.abs(c.z - z) < 8)) continue;
    return spawnCar(x, z, dx, dz, 'traffic');
  }
}
export function blockedAhead(c, range, ignoreCars) {
  const fx = c.dirX, fz = c.dirZ;
  const test = (x, z, lat) => { const rx = x - c.x, rz = z - c.z, ah = rx * fx + rz * fz, la = Math.abs(rx * -fz + rz * fx); return ah > 0 && ah < range && la < lat; };
  if (P.alive && test(P.x, P.z, 1.8)) return 'player';
  for (const p of peds) if (p.alive && test(p.x, p.z, 1.6)) return 'ped';
  for (const e of enemies) if (e.alive && test(e.x, e.z, 1.6)) return 'ped';
  if (!ignoreCars) for (const o of cars) if (o !== c && test(o.x, o.z, 1.7)) return 'car';
  if (!ignoreCars) for (const o of bikes) if (o !== c && o !== P.bike && test(o.x, o.z, 1.4)) return 'car';
  return null;
}
export function damageCar(c, dmg, byPlayer) {
  if (c.dead) return; c.hp -= dmg; if (byPlayer) c.byPlayer = true;
  if (c.hp <= 0 && !c.burnT) { c.burnT = byPlayer === 'boom' ? 0.25 : 1.6; c.speed = 0; }
}
function explodeCar(c) {
  c.dead = true; c.burnT = 0; c.mesh.m.material = burntMat; if (c.mesh.lr) { c.mesh.lr.visible = c.mesh.lb.visible = false; }
  c.mesh.grp.position.y = 0; c.mesh.grp.rotation.z = rnd(-0.15, 0.15);
  explosion(c.x, 0.8, c.z, 7, 140, c.byPlayer);
  if (c.byPlayer) { addHeat(3); dropCash(c.x + rnd(-2, 2), c.z + rnd(-2, 2), Math.round(rnd(40, 160))); }
}
export function updateCar(c, dt) {
  if (c.dead) { c.deadT += dt; if (Math.random() < dt * 4) emit(c.x, 1.2, c.z, 1, '#3a3240', 1.5, 2, 0.6, 2, 1); return; }
  if (c.burnT > 0) { c.burnT -= dt; if (Math.random() < 0.6) emit(c.x + rnd(-0.6, 0.6), 1.3, c.z + rnd(-0.6, 0.6), 1, Math.random() < 0.5 ? '#ff7a2a' : '#ffd23e', 1, 0.5, 0.35, 4, 1); if (c.burnT <= 0) explodeCar(c); return; }
  else if (c.hp < 50 && Math.random() < dt * 6) emit(c.x, 1.1, c.z + c.dirZ * 1.8, 1, '#8a8090', 1, 1.4, 0.4, 2, 1);
  if (c.cop && c.mesh.lr) { const on = (G.time * 6 | 0) % 2 === 0; c.mesh.lr.visible = on; c.mesh.lb.visible = !on; }
  if (c.mode === 'traffic') {
    if (c.ignoreT > 0) c.ignoreT -= dt;
    const b = blockedAhead(c, 7.5, c.ignoreT > 0);
    if (b) { c.speed = Math.max(0, c.speed - 30 * dt); c.waitT += dt; if (b === 'car' && c.waitT > 3) { c.ignoreT = 1.5; c.waitT = 0; } if (b === 'player' && c.waitT > 1.5 && c.hornT <= 0) { Sound.horn(vol3d(c.x, c.z), pan3d(c.x, c.z)); c.hornT = 3; } }
    else { c.speed = Math.min(c.top, c.speed + 6 * dt); c.waitT = 0; }
    c.hornT -= dt;
    c.x += c.dirX * c.speed * dt; c.z += c.dirZ * c.speed * dt;
    if (c.x > 204) c.x = -214; else if (c.x < -214) c.x = 204;
    if (c.z > 214) c.z = -214; else if (c.z < -214) c.z = 214;
  } else if (c.mode === 'respond') {
    c.respT += dt;
    const along = c.dirZ ? c.z : c.x, pAlong = c.dirZ ? P.z : P.x, rem = (pAlong - along) * (c.dirZ || c.dirX);
    const b = blockedAhead(c, 6, false);
    if (rem < 12 || c.respT > 10 || (b && (c.blockT = (c.blockT || 0) + dt) > 1)) { c.mode = 'parked'; deployCops(c); }
    else if (!b) { c.speed = Math.min(20, c.speed + 14 * dt); c.x += c.dirX * c.speed * dt; c.z += c.dirZ * c.speed * dt; }
    else c.speed = 0;
  }
  c.mesh.grp.position.set(c.x, 0, c.z);
}
function deployCops(c) {
  const lvl = WANTED[Math.max(1, G.wanted)];
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1, x = c.x + (c.dirZ ? side * 2.2 : side * 0.8), z = c.z + (c.dirX ? side * 2.2 : side * 0.8);
    if (isFree(x, z, 0.5) && G.wanted > 0) spawnEnemy(mixPick(lvl.mix), x, z);
  }
}
export function spawnCopCar() {
  const vertical = Math.abs(P.x - nearestRoad(P.x)) < Math.abs(P.z - nearestRoad(P.z));
  const road = vertical ? nearestRoad(P.x) : nearestRoad(P.z);
  if (road >= 200 && vertical === true && P.x > 206) return;
  const pAlong = vertical ? P.z : P.x, s = Math.random() < 0.5 ? 1 : -1;
  let start = pAlong - s * 75; if (start < -200 || start > 200) start = pAlong + s * 75;
  const dir = Math.sign(pAlong - start) || 1, dx = vertical ? 0 : dir, dz = vertical ? dir : 0, L = laneFor(road, dx, dz);
  const x = vertical ? L.x : start, z = vertical ? start : L.z;
  if (Math.abs(x) > 205 || Math.abs(z) > 205) return;
  const c = spawnCar(x, z, dx, dz, 'respond', true); c.respT = 0; c.speed = 18;
}
const nearestRoad = v => ROADS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
export function removeCar(c) { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); scene.remove(c.mesh.grp); c.mesh.m.geometry.dispose(); }
