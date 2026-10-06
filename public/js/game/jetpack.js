import { Sound } from '../core/audio.js';
import { G, P } from '../core/state.js';
import { $ } from '../core/util.js';
import { addEntity } from '../entities/registry.js';
import { emit as emitFx } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { toast } from '../ui/hud.js';

// ================= JETPACK =================
// One waits on the roof of the Belpaire. Wear it and hold Space in the air to climb; let go and it lets you
// down gently instead of dropping you. Climbing burns fuel, which comes back once you are on your feet.
// It is a found item, so it is gone when you die (respawn() calls takeOffJetpack) and the roof has it again.
export const JET = {
  thrust: 30, // m/s² up while Space is held, against gravity's 18
  climb: 8, // fastest climb, m/s
  sink: 6, // fastest fall while wearing it and not climbing, m/s: slow enough to land without a scratch
  fuel: 8, // seconds of climbing on a full tank
  refill: 2, // seconds of fuel back per second on the ground
  air: 10, // m/s across the ground while flying (on foot it's 5, sprinting 8.2)
};

// One frame of the pack for an airborne wearer: returns the new vertical speed. held: Space is down.
export function jetStep(jet, vy, held, dt, gravity) {
  const burn = held && jet.fuel > 0;
  jet.on = burn;
  if (burn) jet.fuel = Math.max(0, jet.fuel - dt);
  vy += ((burn ? JET.thrust : 0) - gravity) * dt;
  return Math.max(-JET.sink, Math.min(JET.climb, vy));
}
export function refuel(jet, dt) { jet.on = false; jet.fuel = Math.min(JET.fuel, jet.fuel + JET.refill * dt); }

// the pack: two tanks and nozzles on the back (the character faces +z)
const tankMat = new THREE.MeshLambertMaterial({ color: '#c9ccd4' }), darkMat = new THREE.MeshLambertMaterial({ color: '#33343c' }), redMat = new THREE.MeshLambertMaterial({ color: '#d8323c' });
const tankGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), capGeo = new THREE.SphereGeometry(0.1, 10, 6), nozGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.12, 8), plateGeo = new THREE.BoxGeometry(0.34, 0.42, 0.06);
function packMesh() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(plateGeo, darkMat); plate.position.set(0, 0, 0.06); g.add(plate);
  for (const x of [-0.11, 0.11]) {
    const t = new THREE.Mesh(tankGeo, x < 0 ? tankMat : redMat); t.position.set(x, 0, -0.05); g.add(t);
    const c = new THREE.Mesh(capGeo, x < 0 ? tankMat : redMat); c.position.set(x, 0.25, -0.05); c.scale.y = 0.6; g.add(c);
    const n = new THREE.Mesh(nozGeo, darkMat); n.position.set(x, -0.31, -0.05); g.add(n);
  }
  return g;
}

export function putOnJetpack() {
  if (P.jetpack) return;
  P.jetpack = { fuel: JET.fuel, on: false, mesh: packMesh() };
  P.jetpack.mesh.position.set(0, 1.2, -0.25); P.c.body.add(P.jetpack.mesh);
  toast('Got the <em>jetpack</em>. Hold <em>Space</em> in the air to fly; let go to float down.', 7);
}
export function takeOffJetpack() {
  if (!P.jetpack) return;
  P.c.body.remove(P.jetpack.mesh); P.jetpack = null;
  $('jetVital').hidden = true;
}
// flames out of the nozzles while it burns, and the fuel gauge
export function jetFx() {
  const jet = P.jetpack, gauge = $('jetVital');
  if (gauge.hidden === !!jet) gauge.hidden = !jet;
  if (!jet) return;
  $('jetFill').style.width = (jet.fuel / JET.fuel * 100).toFixed(1) + '%';
  if (!jet.on) return;
  const bx = -Math.sin(P.yaw) * 0.3, bz = -Math.cos(P.yaw) * 0.3, rx = Math.cos(P.yaw) * 0.11, rz = -Math.sin(P.yaw) * 0.11;
  for (const s of [-1, 1]) emitFx(P.x + bx + rx * s, P.y + 0.8, P.z + bz + rz * s, 1, Math.random() < 0.5 ? '#ffd23e' : '#ff7a2a', 1.2, 0.22, 0.13, 0, -5);
  if (G.time - (jetFx.t || 0) > 0.1) { jetFx.t = G.time; Sound.jet(); }
}

// the pack lying on the roof: walk over it to put it on. It shows whenever the player isn't wearing one.
const glowGeo = new THREE.CircleGeometry(0.8, 20); glowGeo.rotateX(-Math.PI / 2);
const glowMat = new THREE.MeshBasicMaterial({ color: '#ff9a3e', transparent: true, opacity: 0.35, depthWrite: false });
const JetpackPickup = {
  kind: 'pickup',
  blipLayer: 1,
  update(dt) {
    const p = this, show = !P.jetpack;
    p.m.visible = p.glow.visible = show;
    if (!show) return;
    p.m.rotation.y += dt * 1.6; p.m.position.y = p.y + 1.0 + Math.sin(G.time * 2.4) * 0.1;
    if (P.alive && !P.vehicle && Math.abs(P.y - p.y) < 2 && Math.hypot(P.x - p.x, P.z - p.z) < 1.3) { Sound.pickup(); putOnJetpack(); }
  },
  blip(radar) { if (!P.jetpack) radar.dot(this.x, this.z, '#ff9a3e', 6, false, 'sq'); },
  dispose() { scene.remove(this.m); scene.remove(this.glow); },
};
export function makeJetpackPickup(x, y, z) {
  const m = new THREE.Group(), pack = packMesh(); pack.scale.setScalar(1.6); m.add(pack); m.position.set(x, y + 1, z); scene.add(m);
  const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.set(x, y + 0.05, z); scene.add(glow);
  return addEntity(Object.assign(Object.create(JetpackPickup), { x, y, z, m, glow }));
}
