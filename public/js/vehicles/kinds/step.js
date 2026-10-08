import { kb } from '../../core/controls.js';
import { shadowGeo, shadowMat } from '../../characters/character.js';
import { collide, pushOutSeg } from '../../world/collision.js';
import { arcadeDrive } from '../drive.js';
import { wheelAt } from '../wheels.js';
import { bike } from './bike.js';

const stepMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, specular: 0x2a2a30 });
const stepMatteMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const stepGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

// E-steps: stand-up electric kick scooters (models/estep.js). They are bikes in miniature, so this kind takes the
// bike's riding, falling, carjacking and traffic code (see kinds/bike.js for what each field means) and changes the
// numbers: 25 km/h flat out (30 with boost), quick to turn, light enough for anything bigger to send flying, too
// small to ride up over a car, no wheelie, and a battery that goes up with a pop rather than a bang. The rider
// stands on the deck. In traffic they keep to the right by the kerb, out of the cars' lane, so cars pass them.
export const step = {
  ...bike,
  hull: { half: 0.36, r: 0.28 },
  front: 0.55,
  handling: { top: 6.9, boostTop: 8.3, accel: 2.8, boostAccel: 3.4, brake: 9, reverseBrake: 8, reverseTop: 1.2, reverseAccel: 1.5, handbrake: 7, coast: 0.5, drag: 0.01, turnLow: 2.6, turnHigh: 1.6, maxSteer: 0.62 },
  // no horn on a step (hornAfter): it just waits, then goes round
  traffic: { look: 5, decel: 12, accel: 2.5, patience: 2.5, hornAfter: Infinity },
  fx: { smokeRate: 2, smokeY: 0.25, smokeSpeed: 1, smokeLife: 1.4, smokeSize: 0.25, fireRate: 0.4, fireY: 0.22, fireSize: 0.16, spread: 0.25, fuse: 1.2, boomFuse: 0.2, crashFuse: 20 },
  blast: { y: 0.2, r: 3.5, dmg: 50 },
  wreckReward: { heat: 1, cash: 0 },
  bumper: { back: -0.35, front: 0.75, half: 0.45, slow: 0.6 },
  crash: { exitSpeed: 6, hurt: 1.2 },
  ram: { mass: 0.5, hull: [0.36, 0.28], heavierAt: 3, sameAt: 6 },
  ridesOver: 0, // the little wheels can't climb a car: it just bumps into it
  wheelie: undefined,
  camera: { dist: 4.6, aimDist: 2.7, height: 1.95, fovPerSpeed: 0.6, minArm: 1.8 },
  lane: 5, // by the kerb (the road is 6 m either side of its middle), clear of the cars at 3
  lamp: { y: 0.83, pool: 0.5 },
  sideLift: 0, // nothing sticks out: on its side it lies flat
  laneHalf: 0.6, trafficDespawn: 150, reachMax: 2.2, ambientEngine: false,
  tip: M => `${M.name}. <em>${kb('forward')}</em>/<em>${kb('back')}</em> throttle and brake, <em>${kb('left')}</em>/<em>${kb('right')}</em> steer, <em>${kb('sprint')}</em> sport mode, <em>${kb('ride')}</em> to step off. 25 km/h, silent, and guns still work.`,

  build(v) { return makeStepMesh(v.model); },
  drive(v, dt, c) { arcadeDrive(v, dt, c, v.model.spec.wb); },
  afterDrive(b, dt) { bike.afterDrive(b, dt); b.lean *= 0.85; }, // a step leans less into a turn
  collideSelf(b) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), H = step.hull, F = { x: b.x + fx * H.half, z: b.z + fz * H.half }, R = { x: b.x - fx * H.half, z: b.z - fz * H.half };
    const h1 = collide(F, H.r, b), h2 = collide(R, H.r, b);
    b.x = (F.x + R.x) / 2; b.z = (F.z + R.z) / 2; return h1 || h2;
  },
  // standing on the deck, one foot ahead of the other, both hands on the bars
  seat(b, c) {
    b.mesh.seat.add(c.root); c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0);
    c.shadow.visible = false; c.legL.geometry = c.legR.geometry = c.legGeo;
    c.body.position.y = 0; c.body.rotation.set(0.1, 0, 0);
    c.legL.rotation.set(-0.16, 0, -0.07); c.legR.rotation.set(0.1, 0, 0.07);
    step.aim(b, c, null, 0);
  },
  aim(b, c, aimYaw, pitch) {
    c.armL.rotation.set(-0.5, 0, -0.16);
    if (aimYaw == null) c.armR.rotation.set(-0.5, 0, 0.16, 'XYZ');
    else c.armR.rotation.set(-Math.PI / 2 - pitch + 0.1, aimYaw, 0, 'YXZ');
  },
  exitAt: b => ({ x: b.x + Math.cos(b.yaw) * 0.65, z: b.z - Math.sin(b.yaw) * 0.65 }),
  hitBox(b) { const sy = Math.abs(Math.sin(b.yaw)), cy = Math.abs(Math.cos(b.yaw)); return { hx: sy * 0.6 + cy * 0.28, hz: cy * 0.6 + sy * 0.28, h: b.fallen ? 0.3 : 1.1 }; },
  pushOut(b, o, r) { return Math.abs(b.x - o.x) <= 2 && Math.abs(b.z - o.z) <= 2 && pushOutSeg(o, r + 0.15, b.x, b.z, b.yaw, -0.5, 0.5); },
  blip(b, radar) { if (b.driver) radar.dot(b.x, b.z, '#f4f4f4', 3, false); else radar.dot(b.x, b.z, '#3ef0ff', 4, true, 'sq'); },
};

// the same rig as a bike's (see makeBikeMesh in kinds/bike.js): a lean group, and the stem turning on the rake axis
function makeStepMesh(M) {
  const S = M.spec, G = M.geos(), grp = new THREE.Group(), lean = new THREE.Group(); grp.add(lean);
  const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.scale.set(0.45, 1, 1.5); sh.position.y = 0.03; grp.add(sh);
  const body = new THREE.Mesh(G.body, stepMat), matte = new THREE.Mesh(G.matte, stepMatteMat), glow = new THREE.Mesh(G.glow, stepGlowMat), stand = new THREE.Mesh(G.stand, stepMat);
  const rw = wheelAt(M.wheel(false), stepMat, 0, S.rR, S.zR, S.rR);
  lean.add(body, matte, glow, stand, rw);
  const outer = new THREE.Group(), steer = new THREE.Group(), inner = new THREE.Group();
  outer.position.copy(S.H); outer.rotation.x = -S.rake; inner.rotation.x = S.rake; outer.add(steer); steer.add(inner); lean.add(outer);
  const stB = new THREE.Mesh(G.st, stepMat), stG = new THREE.Mesh(G.stGlow, stepGlowMat), fw = wheelAt(M.wheel(true), stepMat, 0, S.rF - S.H.y, S.zF - S.H.z, S.rF); inner.add(stB, stG, fw);
  const seat = new THREE.Group(); seat.position.set(0, S.seatY, S.seat); lean.add(seat);
  return { grp, lean, shadow: sh, steer, fw, rw, wheels: [fw, rw], seat, stand, solid: [body, matte, stand, rw, stB, fw], lit: [glow, stG] };
}
