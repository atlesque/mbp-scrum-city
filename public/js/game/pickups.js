import { Sound } from '../core/audio.js';
import { G, P, inv, stats } from '../core/state.js';
import { $, lerp } from '../core/util.js';
import { addEntity, removeEntity } from '../entities/registry.js';
import { PGEO } from '../render/effects.js';
import { scene } from '../render/scene.js';

// ================= PICKUPS & MONEY =================
const cashGeo = new THREE.BoxGeometry(0.55, 0.28, 0.08), cashMat = new THREE.MeshBasicMaterial({ color: '#5cff6a' });
const hpMat = new THREE.MeshBasicMaterial({ color: '#ff3b5c' }), arMat = new THREE.MeshBasicMaterial({ color: '#3fb0ff' });

// Pickups that sit on the street and come back after a while. stat is the field on the player they top up.
export const PICKUP_TYPES = {
  health: { stat: 'hp', amount: 50, respawn: 45, label: '+50 health', color: '#ff7a9a', radar: '#ff5a7a',
    mesh() { const m = new THREE.Group(), a = new THREE.Mesh(PGEO, hpMat), b = new THREE.Mesh(PGEO, hpMat); a.scale.set(0.7, 0.22, 0.22); b.scale.set(0.22, 0.7, 0.22); m.add(a, b); return m; } },
  armor: { stat: 'armor', amount: 50, respawn: 60, label: '+50 armor', color: '#5ec8ff', radar: '#5ec8ff',
    mesh() { const m = new THREE.Group(), a = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), arMat); a.scale.set(1, 1.2, 0.45); m.add(a); return m; } },
};

const Pickup = {
  kind: 'pickup',
  blipLayer: 0,
  update(dt) {
    const p = this, def = p.def;
    if (!p.active) { p.respawnT -= dt; if (p.respawnT <= 0) { p.active = true; p.m.visible = true; } return; }
    p.m.rotation.y += dt * 2.5; p.m.position.y = 0.95 + Math.sin(G.time * 3 + p.x) * 0.12;
    if (Math.hypot(P.x - p.x, P.z - p.z) < 1.4 && P.alive && P[def.stat] < 100) {
      P[def.stat] = Math.min(100, P[def.stat] + def.amount); Sound.pickup(); feed(def.label, false, def.color);
      p.active = false; p.m.visible = false; p.respawnT = def.respawn;
    }
  },
  blip(radar) { if (this.active) radar.dot(this.x, this.z, this.def.radar, 6, false, 'sq'); },
  dispose() { scene.remove(this.m); },
};
export function makePickup(type, x, z) {
  const def = PICKUP_TYPES[type], m = def.mesh();
  m.position.set(x, 0.9, z); scene.add(m);
  return addEntity(Object.assign(Object.create(Pickup), { type, def, x, z, m, active: true, respawnT: 0 }));
}

// dropped cash: drifts to the player when close, vanishes after 40 s
const Cash = {
  kind: 'pickup',
  update(dt) {
    const p = this, d = Math.hypot(P.x - p.x, P.z - p.z);
    p.m.rotation.y += dt * 2.5; p.m.position.y = 0.45 + Math.sin(G.time * 3 + p.x) * 0.12;
    p.life -= dt; if (p.life <= 0) { removeEntity(p); return; }
    if (d < 5 && P.alive) { p.x = lerp(p.x, P.x, dt * 6); p.z = lerp(p.z, P.z, dt * 6); p.m.position.x = p.x; p.m.position.z = p.z; }
    if (d < 1.2 && P.alive) { reward(p.x, p.z, p.val); removeEntity(p); }
  },
  dispose() { scene.remove(this.m); },
};
export function dropCash(x, z, val) {
  const m = new THREE.Group(); const a = new THREE.Mesh(cashGeo, cashMat), b = new THREE.Mesh(cashGeo, cashMat); b.position.set(0.05, 0.08, 0.04); b.rotation.z = 0.3; m.add(a, b);
  m.position.set(x, 0.5, z); scene.add(m);
  return addEntity(Object.assign(Object.create(Cash), { x, z, val, m, life: 40 }));
}
export function reward(x, z, val, label) { inv.money += val; stats.earned += val; Sound.cash(); feed((label ? label + '  ' : '') + '+$' + val); }
function feed(text, bad, color) {
  const el = document.createElement('div'); el.className = 'outline' + (bad ? ' bad' : ''); el.textContent = text; if (color) el.style.color = color;
  const f = $('cashFeed'); f.appendChild(el); while (f.children.length > 5) f.firstChild.remove(); setTimeout(() => el.remove(), 1700);
}
