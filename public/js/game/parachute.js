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
// the canopy: eight gores in two colours and the lines down to the shoulders, drawn round the origin at the feet
const GORES = 8, R = 2.8, LIFT = 4.2;
const goreMats = [new THREE.MeshLambertMaterial({ color: '#ff5a3c', side: THREE.DoubleSide }), new THREE.MeshLambertMaterial({ color: '#f4efe4', side: THREE.DoubleSide })];
const goreGeos = Array.from({ length: GORES }, (_, i) => new THREE.SphereGeometry(R, 4, 5, (i / GORES) * Math.PI * 2, Math.PI * 2 / GORES, 0, Math.PI * 0.42));
const lineMat = new THREE.LineBasicMaterial({ color: '#30323a' });
const lineGeo = (() => {
  const pts = [], rim = Math.sin(Math.PI * 0.42) * R, low = Math.cos(Math.PI * 0.42) * R;
  for (let i = 0; i < GORES; i++) {
    const a = (i / GORES) * Math.PI * 2;
    pts.push(Math.sin(a) * rim, LIFT + (low - R) * 0.62, Math.cos(a) * rim, Math.sin(a) > 0 ? 0.2 : -0.2, 1.45, -0.1);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
})();
function canopyMesh() {
  const g = new THREE.Group(), dome = new THREE.Group();
  goreGeos.forEach((geo, i) => dome.add(new THREE.Mesh(geo, goreMats[i % 2])));
  dome.scale.y = 0.62; dome.position.y = LIFT - R * 0.62; g.add(dome);
  g.add(new THREE.LineSegments(lineGeo, lineMat));
  return g;
}

// quiet: no toast (the one that comes with flying a chopper, kinds/heli.js, which opens by itself on bailing out)
export function strapOnChute(quiet) {
  if (P.chute) return;
  P.chute = { open: false, t: 0, mesh: packMesh(), canopy: null };
  P.chute.mesh.position.set(0, 1.1, -0.24); P.c.body.add(P.chute.mesh);
  if (!quiet) toast(`Got a <em>parachute</em>. Jump off, then press <em>${kb('jump')}</em> again in the air to open it. One jump only.`, 7);
}
// pull the cord: the pack empties and the canopy blooms over the head
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
// the canopy unfolding and swaying, and the HUD tag while one is packed
export function chuteFx(dt) {
  const c = P.chute, tag = $('chuteVital');
  const packed = !!c && !c.open;
  if (tag.hidden === packed) tag.hidden = !packed;
  if (!c || !c.open) return;
  c.t += dt;
  const k = Math.min(1, c.t / 0.45), s = 1 - (1 - k) ** 3;
  c.canopy.scale.set(s, 0.3 + 0.7 * s, s); c.canopy.position.y = P.jumpY || 0; // the root stays at the floor; the body rises
  c.canopy.rotation.z = Math.sin(G.time * 1.3) * 0.05 - (P.vx || 0) * 0.01; c.canopy.rotation.x = Math.sin(G.time * 0.9) * 0.04;
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
