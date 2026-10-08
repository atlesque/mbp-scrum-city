import { SKIN, charMat, makeCharacter, seatedLegs } from '../characters/character.js';
import { PGEO, pmat } from '../render/effects.js';
import { GB, box } from '../render/geometry.js';
import { lightRed } from './materials.js';

// ================= CHOPPER MESH =================
// The police chopper, shared by the one hunting the player (vehicles/heli.js) and one the player flies (kinds/heli.js).
// Chopper space: the nose points along +z, +x is its left (the pilot's door side) and y 0 is the middle of the cabin.
// The skids hang SKID below that, so a chopper standing on the ground has its middle SKID metres up.
export const SKID = 1.15;
// where the pilot sits (a seated character, scaled down to fit under the canopy), and the guns' muzzles
export const SEAT = { x: 0.42, y: -0.82, z: 1.3, scale: 0.8 };
export const GUN_TIP = { x: 0, y: -0.86, z: 3.1 }; // the minigun under the nose
export const PODS = [{ x: 1.45, y: -0.62, z: 1.0 }, { x: -1.45, y: -0.62, z: 1.0 }]; // the rocket pods' mouths, left and right
const NAVY = '#1b2a4a', DARK = '#222', METAL = '#2a2e36';
const glassMat = new THREE.MeshPhongMaterial({ color: '#9cc2e6', transparent: true, opacity: 0.32, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });

// { grp, rotor, rotor2, lr, seat, solid, lit }: the body (rotors spinning round y), the blinking red light underneath,
// and the seat group a character sits in (see seatPilot)
export function buildHeliMesh() {
  const g = new GB();
  box(g, 1.8, 1.6, 2.9, 0, 0, -0.55, NAVY); // the cabin behind the cockpit
  box(g, 2.06, 0.3, 1.2, 0, 0.1, -0.3, '#f4f4f4'); // the white band
  box(g, 1.8, 0.26, 1.8, 0, -0.67, 1.8, NAVY); // the cockpit floor
  box(g, 1.4, 0.4, 0.5, 0, -0.6, 2.75, NAVY); // the chin
  box(g, 1.8, 0.08, 1.7, 0, 0.8, 1.75, NAVY); // the cockpit roof
  for (const s of [1, -1]) box(g, 0.08, 1.4, 0.08, s * 0.86, 0.1, 2.62, NAVY); // the front pillars
  box(g, 0.08, 1.4, 0.08, 0, 0.1, 2.62, NAVY);
  box(g, 0.3, 0.3, 0.3, 0, 0.95, 0, DARK); // the rotor mast
  box(g, 0.4, 0.4, 4, 0, 0.3, -3.8, NAVY); box(g, 0.1, 1.2, 0.8, 0, 0.8, -5.6, NAVY); // tail boom and fin
  box(g, 0.1, 0.1, 3.4, 0.9, -1.1, 0.2, DARK); box(g, 0.1, 0.1, 3.4, -0.9, -1.1, 0.2, DARK); // skids
  for (const s of [1, -1]) for (const z of [1.0, -0.6]) box(g, 0.1, 0.5, 0.1, s * 0.9, -0.85, z, DARK);
  // the minigun under the nose, and a rocket pod on a stub wing each side
  box(g, 0.34, 0.26, 0.5, 0, -0.84, 2.45, METAL); box(g, 0.12, 0.12, 0.7, 0, -0.86, 2.8, '#15161a');
  for (const p of PODS) { box(g, 0.75, 0.08, 0.5, Math.sign(p.x) * 1.2, -0.45, 0.2, NAVY); box(g, 0.34, 0.34, 1.2, p.x, p.y, p.z - 0.6, METAL); box(g, 0.26, 0.26, 0.02, p.x, p.y, p.z, '#0c0c10'); }
  const grp = new THREE.Group(), body = new THREE.Mesh(g.geometry(), charMat); grp.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.32, 1.6), glassMat); glass.position.set(0, 0.12, 1.82); grp.add(glass);
  const rotor = new THREE.Mesh(PGEO, pmat('#141418')); rotor.scale.set(9, 0.06, 0.35); rotor.position.y = 1.0; grp.add(rotor);
  const rotor2 = new THREE.Mesh(PGEO, pmat('#141418')); rotor2.scale.set(0.35, 0.06, 9); rotor2.position.y = 1.0; grp.add(rotor2);
  const lr = new THREE.Mesh(PGEO, lightRed); lr.scale.setScalar(0.25); lr.position.set(0, -0.85, 1); grp.add(lr);
  const seat = new THREE.Group(); seat.position.set(SEAT.x, SEAT.y, SEAT.z); seat.scale.setScalar(SEAT.scale); seat.userData.knees = -1.3; grp.add(seat);
  return { grp, body, glass, rotor, rotor2, lr, seat, solid: [body, rotor, rotor2], lit: [lr] };
}

// sit a character in the pilot's seat, hands forward on the controls
export function seatPilot(seat, ch) {
  seat.add(ch.root); ch.root.position.set(0, 0, 0); ch.root.rotation.set(0, 0, 0);
  ch.shadow.visible = false; ch.legL.geometry = ch.legR.geometry = seatedLegs(ch);
  const knees = seat.userData.knees ?? -1;
  ch.body.position.y = 0; ch.body.rotation.set(0, 0, 0); ch.legL.rotation.set(knees, 0, 0); ch.legR.rotation.set(knees, 0, 0);
  ch.armL.rotation.set(-1.0, 0, 0.1); ch.armR.rotation.set(-1.0, 0, -0.1, 'XYZ');
}
// the police pilot: a navy flight suit and a white helmet with the visor down
export function makePilot() {
  const skin = SKIN[Math.random() * SKIN.length | 0];
  return makeCharacter({ skin, shirt: NAVY, pants: NAVY, hair: '#1d1410', hairStyle: 'short', hat: 'helmet', hatColor: '#e8e8ec', glasses: true, longSleeve: true, gloves: '#111', shoes: '#111' });
}
// shot dead at the controls: slumped forward over the stick, head down
export function slump(ch) { ch.body.rotation.x = 0.45; ch.head.rotation.x = 0.5; ch.armL.rotation.set(-0.3, 0, 0.3); ch.armR.rotation.set(-0.3, 0, -0.3, 'XYZ'); }

// a point given in chopper space, in the world: for a chopper whose middle is at (x, y, z) facing yaw (its tilt left out)
export function heliPoint(x, y, z, yaw, p, out = new THREE.Vector3()) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return out.set(x + p.x * c + p.z * s, y + p.y, z - p.x * s + p.z * c);
}
