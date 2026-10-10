import { Sound } from '../core/audio.js';
import { kb } from '../core/controls.js';
import { G, P } from '../core/state.js';
import { $ } from '../core/util.js';
import { addEntity } from '../entities/registry.js';
import { scene } from '../render/scene.js';
import { toast } from '../ui/hud.js';

// ================= PARACHUTE =================
// One waits on each of the three high roofs (VAC Gent, the Belpaire and the Herman Teirlinck's tower). Walk over it to
// strap it on, jump off, and press Space in the air once the double jump is spent (or while falling fast) to open it.
// The canopy brakes the fall to a soft PARA.sink and lets you steer at PARA.air; it is used up when you land.
// The roof gets a fresh one PARA.respawn seconds after it was taken. A packed one is lost when you die, like the jetpack.
export const PARA = {
  sink: 4, // m/s down under the canopy, well below a landing that hurts (13.5)
  brake: 3, // how fast the canopy slows a fast fall, per second
  air: 6, // m/s across the ground under the canopy
  openFall: 6, // falling faster than this, Space opens it even with the double jump left
  respawn: 60, // seconds until a roof has a new one
};

// One frame of vertical speed under the open canopy: plain gravity until it reaches the sink rate, then held there;
// a faster fall is braked towards it, quickly but not in one frame.
export function chuteStep(vy, dt, gravity) {
  if (vy >= -PARA.sink) return Math.max(-PARA.sink, vy - gravity * dt);
  return vy + (-PARA.sink - vy) * Math.min(1, PARA.brake * dt);
}
// Space in the air opens a packed chute when the jump can't do anything else: the double jump is spent, or the player
// is already dropping fast. jets: the jetpack is worn with fuel left, so Space flies instead.
export const opensChute = (chute, jumps, vy, jets) => !!chute && !chute.open && !jets && (jumps >= 2 || vy < -PARA.openFall);

// the pack on the back (the character faces +z)
const packMat = new THREE.MeshLambertMaterial({ color: '#4f5b3a' }), strapMat = new THREE.MeshLambertMaterial({ color: '#1f2228' }), tagMat = new THREE.MeshLambertMaterial({ color: '#ff5a3c' });
const packGeo = new THREE.BoxGeometry(0.36, 0.3, 0.16), flapGeo = new THREE.BoxGeometry(0.38, 0.08, 0.17), tagGeo = new THREE.BoxGeometry(0.08, 0.06, 0.04);
function packMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(packGeo, packMat); g.add(b);
  const f = new THREE.Mesh(flapGeo, strapMat); f.position.y = 0.12; g.add(f);
  const t = new THREE.Mesh(tagGeo, tagMat); t.position.set(0.12, -0.08, -0.09); g.add(t); // the ripcord handle
  return g;
}
// the canopy: a yellow paraglider wing, cells along an arch across the shoulders (the character faces +z, so the span
// runs along x), its lines gathered to the two risers at the shoulders; drawn round the origin at the feet
const CELLS = 13, ARC = 5.2, SPREAD = 1.05, CHORD = 2.4, LIFT = 6.2; // arch radius, half the angle it spans (rad), metres
// a little glow of their own so the underside, all you see from below, still reads yellow and not brown
const cellMats = [['#ffe03a', '#6b5600'], ['#ffc400', '#5c4300']].map(([color, emissive]) => new THREE.MeshLambertMaterial({ color, emissive }));
const tipMat = new THREE.MeshLambertMaterial({ color: '#2b2d33' });
const cellW = 2 * ARC * Math.sin(SPREAD / CELLS) + 0.02;
const cellGeo = new THREE.BoxGeometry(cellW, 0.32, CHORD), noseGeo = new THREE.BoxGeometry(cellW, 0.2, 0.25);
// where a cell sits on the arch: angle from straight up, its centre, and its underside
const cellAt = i => { const a = ((i + 0.5) / CELLS - 0.5) * 2 * SPREAD; return { a, x: Math.sin(a) * ARC, y: LIFT - ARC + Math.cos(a) * ARC }; };
const lineMat = new THREE.LineBasicMaterial({ color: '#30323a' });
const lineGeo = (() => {
  const pts = [];
  for (let i = 0; i < CELLS; i += 2) {
    const c = cellAt(i), sx = c.x > 0 ? 0.2 : -0.2;
    for (const z of [CHORD * 0.3, -CHORD * 0.3]) pts.push(c.x - Math.sin(c.a) * 0.16, c.y - Math.cos(c.a) * 0.16, z, sx, 1.45, -0.05);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
})();
function canopyMesh() {
  const g = new THREE.Group();
  for (let i = 0; i < CELLS; i++) {
    const c = cellAt(i), cell = new THREE.Mesh(cellGeo, cellMats[i % 2]);
    cell.position.set(c.x, c.y, 0); cell.rotation.set(0.08, 0, -c.a); g.add(cell); // nose tipped up a little into the air
    if (i === 0 || i === CELLS - 1) { const tip = new THREE.Mesh(noseGeo, tipMat); tip.position.set(0, 0, CHORD / 2 - 0.12); cell.add(tip); }
  }
  g.add(new THREE.LineSegments(lineGeo, lineMat));
  return g;
}

// quiet: no toast (the one that comes with flying a chopper, kinds/heli.js, which opens by itself on bailing out)
export function strapOnChute(quiet) {
  if (P.chute) return;
  P.chute = { open: false, t: 0, mesh: packMesh(), canopy: null };
  P.chute.mesh.position.set(0, 1.1, -0.24); P.c.body.add(P.chute.mesh);
  if (!quiet) toast(`Got a <em>paraglider</em>. Jump off, then press <em>${kb('jump')}</em> again in the air to open it. One jump only.`, 7);
}
// pull the cord: the pack empties and the wing opens over the head
export function openChute() {
  const c = P.chute; if (!c || c.open) return;
  c.open = true; c.t = 0;
  P.c.body.remove(c.mesh);
  c.canopy = canopyMesh(); c.canopy.scale.setScalar(0.15); P.c.root.add(c.canopy);
  Sound.chute();
}
// landed, wasted or respawned: the chute is spent
export function dropChute() {
  const c = P.chute; if (!c) return;
  if (c.open) P.c.root.remove(c.canopy); else P.c.body.remove(c.mesh);
  P.chute = null; $('chuteVital').hidden = true;
}
// the wing filling out and swaying, and the HUD tag while one is packed
export function chuteFx(dt) {
  const c = P.chute, tag = $('chuteVital');
  const packed = !!c && !c.open;
  if (tag.hidden === packed) tag.hidden = !packed;
  if (!c || !c.open) return;
  c.t += dt;
  const k = Math.min(1, c.t / 0.45), s = 1 - (1 - k) ** 3;
  c.canopy.scale.set(s, 0.3 + 0.7 * s, s); c.canopy.position.y = P.jumpY || 0; // the root stays at the floor; the body rises
  const side = (P.vx || 0) * Math.cos(P.yaw) - (P.vz || 0) * Math.sin(P.yaw); // sideways speed, banks the wing
  c.canopy.rotation.z = Math.sin(G.time * 1.3) * 0.04 + side * 0.03; c.canopy.rotation.x = Math.sin(G.time * 0.9) * 0.04;
}

// Hanging in the harness: no walking under the wing. The legs hang together, swung a little forward as if sitting in
// the harness, and swaying slowly; the hands are up on the brake lines by the risers, the one on the side you steer
// towards pulled a little lower. Arm x: 0 hangs down, -PI points straight up (characters/character.js).
export const HANG = { leg: -0.45, sway: 0.06, arm: -2.75, out: 0.22, brake: 0.25 };
// the pose at time t with sideways speed side (m/s, + towards the left hand, the body's +x): leg swing and both arms as [x, y, z]
export function hangPose(t, side = 0) {
  const pull = Math.max(-1, Math.min(1, side / PARA.air)) * HANG.brake;
  return {
    leg: HANG.leg + Math.sin(t * 1.1) * HANG.sway,
    armR: [HANG.arm + Math.max(0, -pull), 0, -HANG.out],
    armL: [HANG.arm + Math.max(0, pull), 0, HANG.out],
  };
}
// lay the hanging pose over the walk animateChar just set, eased in as the wing opens. A gun being aimed, a swing or a
// reload keeps the arms; the legs always hang.
export function poseHang(a, k = 1) {
  const c = a.c, side = (a.vx || 0) * Math.cos(a.yaw || 0) - (a.vz || 0) * Math.sin(a.yaw || 0);
  const p = hangPose(G.time, side), mix = (from, to) => from + (to - from) * k;
  c.legL.rotation.x = mix(c.legL.rotation.x, p.leg); c.legR.rotation.x = mix(c.legR.rotation.x, p.leg + 0.04);
  c.body.position.y = a.jumpY || 0; // no step bob in the air
  if (a.aiming || a.swing || a.reload) return;
  for (const [arm, to] of [[c.armR, p.armR], [c.armL, p.armL]]) arm.rotation.set(mix(arm.rotation.x, to[0]), mix(arm.rotation.y, to[1]), mix(arm.rotation.z, to[2]));
}

// the pack lying on the roof: walk over it to take it. Once taken the spot stays empty for PARA.respawn seconds.
const glowGeo = new THREE.CircleGeometry(0.8, 20); glowGeo.rotateX(-Math.PI / 2);
const glowMat = new THREE.MeshBasicMaterial({ color: '#ff5a3c', transparent: true, opacity: 0.35, depthWrite: false });
const ParachutePickup = {
  kind: 'pickup',
  blipLayer: 1,
  update(dt) {
    const p = this, show = G.time >= p.readyT;
    p.m.visible = p.glow.visible = show;
    if (!show) return;
    p.m.rotation.y += dt * 1.6; p.m.position.y = p.y + 1.0 + Math.sin(G.time * 2.4) * 0.1;
    if (!P.chute && P.alive && !P.vehicle && Math.abs(P.y - p.y) < 2 && Math.hypot(P.x - p.x, P.z - p.z) < 1.3) {
      Sound.pickup(); strapOnChute(); p.readyT = G.time + PARA.respawn;
    }
  },
  blip(radar) { if (G.time >= this.readyT) radar.dot(this.x, this.z, '#ff5a3c', 6, false, 'sq'); },
  dispose() { scene.remove(this.m); scene.remove(this.glow); },
};
export function makeParachutePickup(x, y, z) {
  const m = new THREE.Group(), pack = packMesh(); pack.scale.setScalar(1.8); m.add(pack); m.position.set(x, y + 1, z); scene.add(m);
  const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.set(x, y + 0.05, z); scene.add(glow);
  return addEntity(Object.assign(Object.create(ParachutePickup), { x, y, z, m, glow, readyT: 0 }));
}
