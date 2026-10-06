import { lerp, pick } from '../core/util.js';
import { GB, UNIT, box, boxAB, tube } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { shirtMat } from '../render/textures.js';
import { meleeModel } from './melee-models.js';
import { READY, swingPose, swingWeight } from './swing.js';

// ================= CHARACTERS =================
export const charMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const SKIN = ['#f3c9a8', '#e3ad86', '#c98b62', '#93603e', '#5e3b26', '#f6d6bd'];
export const HAIR = ['#1d1410', '#4a2e1a', '#d8b26a', '#a33a1e', '#efe6d4', '#2b1a12'];
const PANTS = ['#f5f0e6', '#2b2b3a', '#5c7fa8', '#c8b08a', '#ff7eb6', '#3a6d8c', '#e9e3ff', '#7a4e8f'];
const SHIRTS = ['#ff7eb6', '#57d9c7', '#ffb347', '#9b7bff', '#f6f1e7', '#ff6b6b', '#4fb3ff', '#ffe066', '#7cf29a'];
export const shadowGeo = new THREE.CircleGeometry(0.5, 10); shadowGeo.rotateX(-Math.PI / 2);
export const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1a0a20, transparent: true, opacity: 0.35, depthWrite: false });
const GUN_DEF = {};
// the mesh for a weapon in the hand (a gun or a melee weapon), or null for bare fists
export function gunGeo(id) {
  if (GUN_DEF[id]) return GUN_DEF[id];
  const melee = meleeModel(id); if (melee) return (GUN_DEF[id] = melee);
  if (id === 'fist') return null;
  const g = new GB(), dark = '#22212a', mid = '#4a4a55';
  let muzzle = -0.3;
  if (id === 'pistol') { box(g, 0.06, 0.26, 0.09, 0, -0.11, 0.07, dark); box(g, 0.05, 0.08, 0.15, 0, 0.0, 0.0, '#3a2a22'); muzzle = -0.24; }
  if (id === 'smg') { box(g, 0.07, 0.36, 0.11, 0, -0.12, 0.07, dark); box(g, 0.045, 0.07, 0.2, 0, -0.05, -0.05, mid); box(g, 0.03, 0.12, 0.03, 0, -0.34, 0.09, mid); muzzle = -0.4; }
  if (id === 'shotgun') { box(g, 0.06, 0.72, 0.07, 0, -0.27, 0.09, dark); box(g, 0.07, 0.32, 0.12, 0, 0.17, 0.05, '#7a4a2a'); box(g, 0.08, 0.16, 0.08, 0, -0.33, 0.02, '#7a4a2a'); muzzle = -0.62; }
  if (id === 'rifle') { box(g, 0.07, 0.62, 0.1, 0, -0.18, 0.07, dark); box(g, 0.05, 0.08, 0.2, 0, -0.1, -0.06, mid); box(g, 0.06, 0.24, 0.12, 0, 0.2, 0.05, dark); box(g, 0.03, 0.2, 0.03, 0, -0.55, 0.08, mid); muzzle = -0.64; }
  if (id === 'minigun') { box(g, 0.22, 0.5, 0.22, 0, -0.12, 0.1, '#5b5d66'); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; box(g, 0.04, 0.55, 0.04, Math.cos(a) * 0.06, -0.62, 0.1 + Math.sin(a) * 0.06, dark); } box(g, 0.06, 0.1, 0.18, 0, 0.05, 0.25, dark); muzzle = -0.9; }
  if (id === 'rpg') { box(g, 0.15, 0.95, 0.15, 0, -0.15, 0.13, '#5b6a3a'); box(g, 0.2, 0.12, 0.2, 0, -0.64, 0.13, '#3f4a28'); box(g, 0.05, 0.1, 0.16, 0, 0.0, 0.0, dark); muzzle = -0.7; }
  if (id === 'sniper') muzzle = sniperGeo(g, dark);
  return (GUN_DEF[id] = { geo: g.geometry(), muzzle: new THREE.Vector3(0, muzzle, 0.08) });
}
// a long-range bolt-action in the style of the classic arctic-warfare sniper: olive thumbhole stock, long
// fluted barrel with a muzzle brake, and a big scope on top. -y points down the barrel, +z is up.
function sniperGeo(g, dark) {
  const olive = '#66763f', oliveDk = '#4a5630', steel = '#2c2d33', glass = '#3f8fb0';
  // stock: butt pad, cheek comb, the lower bar that closes the thumbhole, pistol grip, then the forend
  box(g, 0.075, 0.05, 0.22, 0, 0.5, 0.02, '#1c1c20');
  box(g, 0.07, 0.32, 0.07, 0, 0.32, 0.1, olive);
  box(g, 0.068, 0.3, 0.05, 0, 0.33, -0.06, olive);
  box(g, 0.07, 0.06, 0.2, 0, 0.45, 0.02, olive);
  boxAB(g, [0, 0.17, 0.08], [0, 0.11, -0.08], 0.06, 0.07, oliveDk);
  box(g, 0.08, 0.3, 0.075, 0, -0.18, 0.06, olive);
  box(g, 0.082, 0.1, 0.075, 0, 0.1, 0.07, olive);
  // action, bolt handle, magazine and trigger guard
  box(g, 0.055, 0.22, 0.06, 0, -0.02, 0.12, steel);
  boxAB(g, [-0.03, 0.06, 0.13], [-0.1, 0.07, 0.1], 0.018, 0.018, steel); box(g, 0.035, 0.035, 0.035, -0.105, 0.07, 0.095, dark);
  box(g, 0.05, 0.08, 0.1, 0, -0.03, -0.01, dark);
  box(g, 0.02, 0.09, 0.012, 0, 0.06, -0.02, dark);
  // fluted barrel (a thick shank, then a thinner run with dark flutes) and the slotted muzzle brake
  tube(g, [0, -0.1, 0.12], [0, -0.38, 0.12], 0.024, steel, 8);
  tube(g, [0, -0.38, 0.12], [0, -0.86, 0.12], 0.019, steel, 8);
  for (const [x, z] of [[0.019, 0.12], [-0.019, 0.12], [0, 0.139]]) box(g, Math.abs(x) ? 0.004 : 0.01, 0.4, Math.abs(x) ? 0.01 : 0.004, x, -0.6, z, dark);
  box(g, 0.05, 0.1, 0.05, 0, -0.91, 0.12, steel);
  for (const y of [-0.89, -0.93]) box(g, 0.054, 0.016, 0.02, 0, y, 0.12, '#111114');
  // scope: rings, tube, wide objective bell, eyepiece, turrets and a glint of lens at each end
  for (const y of [0.03, -0.11]) box(g, 0.03, 0.03, 0.06, 0, y, 0.17, dark);
  tube(g, [0, 0.12, 0.215], [0, -0.17, 0.215], 0.028, '#18181c', 10);
  tube(g, [0, -0.17, 0.215], [0, -0.27, 0.215], 0.042, '#18181c', 10);
  tube(g, [0, 0.12, 0.215], [0, 0.19, 0.215], 0.036, '#18181c', 10);
  tube(g, [0, -0.04, 0.24], [0, -0.04, 0.27], 0.017, '#26262c', 8);
  tube(g, [-0.025, -0.04, 0.215], [-0.055, -0.04, 0.215], 0.017, '#26262c', 8);
  box(g, 0.06, 0.004, 0.06, 0, -0.272, 0.215, glass); box(g, 0.04, 0.004, 0.04, 0, 0.192, 0.215, '#1d3440');
  return -0.97;
}
export function makeCharacter(L) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.position.y = 0.03; root.add(sh);
  const skin = L.skin, shoes = L.shoes || '#2a2226';
  const lg = new GB(), pl = L.shorts ? 0.42 : 0.8;
  box(lg, 0.2, pl, 0.22, 0, -pl / 2, 0, L.pants);
  if (L.shorts) box(lg, 0.16, 0.8 - pl, 0.17, 0, -pl - (0.8 - pl) / 2, 0, skin);
  box(lg, 0.21, 0.1, 0.3, 0, -0.85, 0.04, shoes);
  const legGeo = lg.geometry();
  const legL = new THREE.Mesh(legGeo, charMat), legR = new THREE.Mesh(legGeo, charMat);
  legL.position.set(0.12, 0.9, 0); legR.position.set(-0.12, 0.9, 0); body.add(legL, legR);
  const torso = new THREE.Mesh(UNIT, shirtMat(L.shirt, L.pa, L.pb)); torso.scale.set(0.52, 0.6, 0.3); torso.position.y = 1.2; body.add(torso);
  const core = new GB();
  box(core, 0.48, 0.16, 0.27, 0, 0.93, 0, L.pants);
  if (L.vest) { box(core, 0.56, 0.44, 0.36, 0, 1.24, 0, L.vest); box(core, 0.2, 0.08, 0.02, 0, 1.3, 0.185, '#e8e0c0'); }
  if (L.tie) { box(core, 0.16, 0.5, 0.02, 0, 1.24, 0.151, '#f2f2f2'); box(core, 0.06, 0.42, 0.02, 0, 1.24, 0.162, '#b3122a'); }
  if (L.badge) box(core, 0.07, 0.08, 0.02, 0.13, 1.36, 0.155, '#ffd23e');
  body.add(new THREE.Mesh(core.geometry(), charMat));
  const ag = new GB(), sl = L.longSleeve ? 0.52 : 0.24;
  box(ag, 0.17, sl, 0.18, 0, -sl / 2 + 0.04, 0, L.sleeve || L.shirt);
  box(ag, 0.13, 0.62 - sl, 0.14, 0, -sl - (0.62 - sl) / 2 + 0.04, 0, skin);
  box(ag, 0.14, 0.12, 0.15, 0, -0.64, 0, L.gloves || skin);
  const armGeo = ag.geometry();
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.add(new THREE.Mesh(armGeo, charMat)); armR.add(new THREE.Mesh(armGeo, charMat));
  armL.position.set(0.35, 1.46, 0); armR.position.set(-0.35, 1.46, 0); body.add(armL, armR);
  const gunHolder = new THREE.Group(); gunHolder.position.set(0, -0.64, 0.02); armR.add(gunHolder);
  const hg = new GB();
  box(hg, 0.14, 0.12, 0.14, 0, 0.04, 0, skin);
  box(hg, 0.3, 0.32, 0.29, 0, 0.24, 0, skin);
  box(hg, 0.06, 0.05, 0.05, 0, 0.21, 0.16, skin);
  if (L.glasses) box(hg, 0.27, 0.06, 0.03, 0, 0.27, 0.15, '#0c0c12');
  else { box(hg, 0.05, 0.04, 0.02, 0.07, 0.27, 0.148, '#1a1222'); box(hg, 0.05, 0.04, 0.02, -0.07, 0.27, 0.148, '#1a1222'); }
  box(hg, 0.1, 0.025, 0.02, 0, 0.14, 0.148, '#8a3a3a');
  const hs = L.hairStyle;
  if (hs !== 'bald' && L.hat !== 'helmet') {
    box(hg, 0.32, 0.09, 0.31, 0, 0.42, -0.005, L.hair);
    box(hg, 0.32, hs === 'long' ? 0.42 : hs === 'mullet' ? 0.36 : 0.2, 0.07, 0, hs === 'long' ? 0.2 : hs === 'mullet' ? 0.23 : 0.31, -0.15, L.hair);
    if (hs === 'afro') box(hg, 0.42, 0.24, 0.4, 0, 0.46, -0.02, L.hair);
    box(hg, 0.04, 0.16, 0.25, 0.155, 0.33, -0.02, L.hair); box(hg, 0.04, 0.16, 0.25, -0.155, 0.33, -0.02, L.hair);
  }
  if (L.hat === 'cap') { box(hg, 0.33, 0.1, 0.32, 0, 0.45, 0, L.hatColor); box(hg, 0.28, 0.03, 0.13, 0, 0.41, 0.2, L.hatColor); box(hg, 0.06, 0.05, 0.02, 0, 0.46, 0.165, '#ffd23e'); }
  if (L.hat === 'helmet') { box(hg, 0.36, 0.2, 0.36, 0, 0.42, -0.01, L.hatColor); box(hg, 0.37, 0.06, 0.04, 0, 0.33, 0.17, L.hatColor); }
  const head = new THREE.Mesh(hg.geometry(), charMat); head.position.y = 1.5; body.add(head);
  if (L.scale) root.scale.setScalar(L.scale);
  return { root, body, legL, legR, armL, armR, head, gunHolder, gun: null, gunId: null, shadow: sh, legGeo, look: L };
}
export function setGun(c, id) {
  if (c.gunId === id) return;
  if (c.gun) { c.gunHolder.remove(c.gun); c.gun = null; }
  c.gunId = id; const g = id && gunGeo(id); if (!g) return;
  c.gun = new THREE.Mesh(g.geo, charMat); c.gunHolder.add(c.gun);
}
export function randomLook() {
  const shirt = pick(SHIRTS), hawaii = Math.random() < 0.5;
  return { skin: pick(SKIN), shirt, pa: hawaii ? pick(['#ffffff', '#ffe066', '#ff4fa3', '#3fd6c8']) : null, pb: hawaii ? pick(['#2f8f55', '#1e6f6a', '#5b3fa0']) : null,
    pants: pick(PANTS), shorts: Math.random() < 0.5, hair: pick(HAIR), hairStyle: pick(['short', 'short', 'long', 'mullet', 'bald', 'afro', 'long']), glasses: Math.random() < 0.35, shoes: pick(['#2a2226', '#f4f0f6', '#7a4e2a', '#ff7eb6']) };
}
export function disposeChar(c) { if (c.sitGeo) c.sitGeo.dispose(); c.legGeo.dispose(); c.root.traverse(o => { if (o.isMesh && o.geometry !== UNIT && o.geometry !== shadowGeo && !Object.values(GUN_DEF).some(g => g.geo === o.geometry)) o.geometry.dispose(); }); scene.remove(c.root); }
export function animateChar(a, dt) {
  const c = a.c, sp = a.moveSpeed || 0;
  a.phase = (a.phase || 0) + dt * (sp * 2.3 + (sp > 0.1 ? 2 : 0));
  const amp = Math.min(1, sp / 5) * 0.8, s = Math.sin(a.phase);
  c.legL.rotation.x = s * amp; c.legR.rotation.x = -s * amp;
  c.body.position.y = (a.jumpY || 0) + Math.abs(Math.cos(a.phase)) * 0.06 * amp;
  if (a.aiming && a.melee) {
    // squared up with a melee weapon (or fists): its ready pose instead of pointing a gun
    const p = READY[a.melee]; c.armR.rotation.set(...p.r);
    if (p.l) c.armL.rotation.set(...p.l); else c.armL.rotation.set(s * amp * 0.7, 0, 0);
  } else if (a.aiming) {
    const p = a.aimPitch || 0;
    c.armR.rotation.set(-Math.PI / 2 - p, 0, 0);
    if (a.twoHand) c.armL.rotation.set(-Math.PI / 2 * 0.95 - p, 0, -0.62); else c.armL.rotation.set(s * amp * 0.7, 0, 0);
  } else if (a.panic) {
    c.armR.rotation.set(-2.85 + Math.sin(a.phase * 1.7) * 0.25, 0, -0.3); c.armL.rotation.set(-2.85 - Math.sin(a.phase * 1.7) * 0.25, 0, 0.3);
  } else {
    c.armR.rotation.set(-s * amp * 0.8, 0, 0); c.armL.rotation.set(s * amp * 0.8, 0, 0);
  }
  c.body.rotation.y = 0; if (c.gun) c.gun.rotation.x = 0;
  if (a.swing) poseSwing(c, a.swing);
}
// lay a melee swing (characters/swing.js) over the walking pose
const _r = new THREE.Euler();
function poseSwing(c, sw) {
  const p = swingPose(sw.anim, sw.t / sw.dur, sw.step), w = sw.anim === 'saw' ? 1 : swingWeight(sw);
  const blend = (arm, to) => { if (!to) return; _r.set(...to); arm.rotation.set(lerp(arm.rotation.x, _r.x, w), lerp(arm.rotation.y, _r.y, w), lerp(arm.rotation.z, _r.z, w)); };
  blend(c.armR, p.r); blend(c.armL, p.l);
  if (p.leg != null) c.legR.rotation.x = lerp(c.legR.rotation.x, p.leg, w);
  c.body.rotation.y = p.tw * w; if (c.gun) c.gun.rotation.x = p.wr * w;
  if (sw.anim === 'saw') { c.armR.rotation.x += Math.sin(sw.t * 90) * 0.03; c.armL.rotation.x += Math.cos(sw.t * 80) * 0.03; }
}
export function deathAnim(a, dt) {
  a.deadT += dt; const k = Math.min(1, a.deadT / 0.45);
  a.c.body.rotation.x = -Math.PI / 2 * (k * k);
  a.c.body.position.y = 0.12 * k;
  a.c.legL.rotation.x = lerp(a.c.legL.rotation.x, 0.2, k); a.c.legR.rotation.x = lerp(a.c.legR.rotation.x, -0.15, k);
  a.c.armR.rotation.x = lerp(a.c.armR.rotation.x, -2.6, k); a.c.armL.rotation.x = lerp(a.c.armL.rotation.x, -2.9, k);
}
const _mz = new THREE.Vector3();
// world position of the gun muzzle (shared vector: clone it to keep it)
export function muzzleOf(c) { return c.gunHolder.localToWorld(_mz.copy(((c.gunId && gunGeo(c.gunId)) || gunGeo('pistol')).muzzle)); }
// legs bent forward for sitting on a bike or in a car, built once per character
export function seatedLegs(c) {
  if (c.sitGeo) return c.sitGeo;
  const L = c.look, g = new GB();
  boxAB(g, [0, 0, 0], [0, -0.06, 0.42], 0.2, 0.22, L.pants);
  boxAB(g, [0, -0.06, 0.4], [0, -0.56, 0.3], 0.17, 0.18, L.shorts ? L.skin : L.pants);
  box(g, 0.21, 0.1, 0.3, 0, -0.6, 0.36, L.shoes || '#2a2226');
  return (c.sitGeo = g.geometry());
}
