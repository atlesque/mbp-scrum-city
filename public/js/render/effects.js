import { rnd } from '../core/util.js';
import { boomLight, muzzleLight, scene } from './scene.js';

// ================= EFFECTS =================
export const PGEO = new THREE.BoxGeometry(1, 1, 1), pmats = {};
export const pmat = col => pmats[col] || (pmats[col] = new THREE.MeshBasicMaterial({ color: col }));
const parts = [], partPool = [];
export function emit(x, y, z, n, col, spd, life, size, grav = -12, up = 2) {
  for (let i = 0; i < n && parts.length < 600; i++) {
    const m = partPool.pop() || new THREE.Mesh(PGEO, pmat(col)); m.material = pmat(col);
    const s = size * rnd(0.6, 1.3); m.scale.setScalar(s); m.position.set(x, y, z); m.rotation.set(rnd(0, 3), rnd(0, 3), 0); scene.add(m);
    const a = rnd(0, Math.PI * 2), e = rnd(-0.3, 1);
    parts.push({ m, vx: Math.cos(a) * spd * rnd(0.3, 1), vy: up + e * spd, vz: Math.sin(a) * spd * rnd(0.3, 1), life: life * rnd(0.6, 1.2), max: life, s, grav });
  }
}
export function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.m); partPool.push(p.m); parts.splice(i, 1); continue; }
    p.vy += p.grav * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    p.m.scale.setScalar(p.s * (p.grav > 0 ? 1 + (1 - p.life / p.max) * 2 : Math.min(1, p.life / p.max * 2)));
  }
}
const tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const tracerMatE = new THREE.MeshBasicMaterial({ color: '#ff9a7a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const tracers = [], tracerPool = [];
export function tracer(a, b, enemy) {
  const len = a.distanceTo(b); if (len < 0.3) return;
  const m = tracerPool.pop() || new THREE.Mesh(PGEO, tracerMat); m.material = enemy ? tracerMatE : tracerMat;
  m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); m.scale.set(0.05, 0.05, len); scene.add(m); tracers.push({ m, life: 0.06 });
}
// point lights fall off with the square of distance since r155; these scale them back to their r128
// brightness at a typical distance (2 m from the gun, 8 m from a blast)
const MUZZLE_I = 9, BOOM_I = 150;
const flashGeo = new THREE.OctahedronGeometry(0.22, 0), flashMat = new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const flashes = [];
export function muzzleFlash(p, big) {
  const m = new THREE.Mesh(flashGeo, flashMat); m.position.copy(p); m.scale.setScalar(big ? 2 : 1); m.rotation.set(rnd(0, 3), rnd(0, 3), 0); scene.add(m); flashes.push({ m, life: 0.05 });
  muzzleLight.position.copy(p); muzzleLight.intensity = (big ? 3 : 2) * MUZZLE_I;
}
const bloodGeo = new THREE.CircleGeometry(1, 8); bloodGeo.rotateX(-Math.PI / 2);
const bloodMat = new THREE.MeshBasicMaterial({ color: '#7a0a18', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const pools = [];
export function bloodPool(x, z) {
  let p = pools.length >= 30 ? pools.shift() : null;
  if (!p) { p = { m: new THREE.Mesh(bloodGeo, bloodMat) }; scene.add(p.m); }
  p.m.position.set(x + rnd(-0.3, 0.3), 0.2, z + rnd(-0.3, 0.3)); p.t = 0; p.max = rnd(0.6, 1.0); p.m.scale.setScalar(0.1); pools.push(p);
}
const booms = [];
export function boomFx(x, y, z, r) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 1, depthWrite: false }));
  m.position.set(x, y, z); scene.add(m); booms.push({ m, t: 0, r });
  emit(x, y + 0.5, z, 26, '#ff7a2a', 12, 0.8, 0.5, -6, 6); emit(x, y + 0.5, z, 18, '#ffd23e', 16, 0.5, 0.3, -8, 8); emit(x, y, z, 16, '#2a2230', 7, 1.2, 0.5, -10, 6);
  emit(x, y + 1, z, 14, '#5a5060', 2, 2.2, 0.9, 2.5, 1);
  boomLight.position.set(x, y + 2, z); boomLight.intensity = 6 * BOOM_I;
}
export function updateFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.life -= dt; t.m.scale.x = t.m.scale.y = 0.05 * Math.max(0.2, t.life / 0.06); if (t.life <= 0) { scene.remove(t.m); tracerPool.push(t.m); tracers.splice(i, 1); } }
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.life -= dt; if (f.life <= 0) { scene.remove(f.m); flashes.splice(i, 1); } }
  for (const p of pools) if (p.t < 1) { p.t += dt * 0.5; p.m.scale.setScalar(p.max * Math.min(1, p.t * 1.5)); }
  for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.t += dt; const k = b.t / 0.5; b.m.scale.setScalar(b.r * (0.3 + k * 0.9)); b.m.material.opacity = Math.max(0, 1 - k); b.m.material.color.setHSL(0.08 - k * 0.06, 1, 0.6 - k * 0.3); if (k >= 1) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); booms.splice(i, 1); } }
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 40 * MUZZLE_I);
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 9 * BOOM_I);
}
