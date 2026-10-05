import { Sound } from '../core/audio.js';
import { G, P, inv, pickups, stats } from '../core/state.js';
import { $, lerp } from '../core/util.js';
import { PGEO } from '../render/effects.js';
import { scene } from '../render/scene.js';

// ================= PICKUPS & MONEY =================
const cashGeo = new THREE.BoxGeometry(0.55, 0.28, 0.08), cashMat = new THREE.MeshBasicMaterial({ color: '#5cff6a' });
const hpMat = new THREE.MeshBasicMaterial({ color: '#ff3b5c' }), arMat = new THREE.MeshBasicMaterial({ color: '#3fb0ff' });
export function dropCash(x, z, val) {
  const m = new THREE.Group(); const a = new THREE.Mesh(cashGeo, cashMat), b = new THREE.Mesh(cashGeo, cashMat); b.position.set(0.05, 0.08, 0.04); b.rotation.z = 0.3; m.add(a, b);
  m.position.set(x, 0.5, z); scene.add(m); pickups.push({ type: 'cash', x, z, val, m, active: true, life: 40 });
}
export function makePickup(type, x, z) {
  const m = new THREE.Group(), mat = type === 'health' ? hpMat : arMat;
  if (type === 'health') { const a = new THREE.Mesh(PGEO, mat), b = new THREE.Mesh(PGEO, mat); a.scale.set(0.7, 0.22, 0.22); b.scale.set(0.22, 0.7, 0.22); m.add(a, b); }
  else { const a = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat); a.scale.set(1, 1.2, 0.45); m.add(a); }
  m.position.set(x, 0.9, z); scene.add(m); pickups.push({ type, x, z, m, active: true, respawn: 0 });
}
export function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (!p.active) { p.respawn -= dt; if (p.respawn <= 0) { p.active = true; p.m.visible = true; } continue; }
    p.m.rotation.y += dt * 2.5; p.m.position.y = (p.type === 'cash' ? 0.45 : 0.95) + Math.sin(G.time * 3 + p.x) * 0.12;
    const d = Math.hypot(P.x - p.x, P.z - p.z);
    if (p.type === 'cash') {
      p.life -= dt; if (p.life <= 0) { scene.remove(p.m); pickups.splice(i, 1); continue; }
      if (d < 5 && P.alive) { p.x = lerp(p.x, P.x, dt * 6); p.z = lerp(p.z, P.z, dt * 6); p.m.position.x = p.x; p.m.position.z = p.z; }
      if (d < 1.2 && P.alive) { reward(p.x, p.z, p.val); scene.remove(p.m); pickups.splice(i, 1); }
    } else if (d < 1.4 && P.alive) {
      if (p.type === 'health' && P.hp < 100) { P.hp = Math.min(100, P.hp + 50); Sound.pickup(); feed('+50 health', false, '#ff7a9a'); p.active = false; p.m.visible = false; p.respawn = 45; }
      if (p.type === 'armor' && P.armor < 100) { P.armor = Math.min(100, P.armor + 50); Sound.pickup(); feed('+50 armor', false, '#5ec8ff'); p.active = false; p.m.visible = false; p.respawn = 60; }
    }
  }
}
export function reward(x, z, val, label) { inv.money += val; stats.earned += val; Sound.cash(); feed((label ? label + '  ' : '') + '+$' + val); }
function feed(text, bad, color) {
  const el = document.createElement('div'); el.className = 'outline' + (bad ? ' bad' : ''); el.textContent = text; if (color) el.style.color = color;
  const f = $('cashFeed'); f.appendChild(el); while (f.children.length > 5) f.firstChild.remove(); setTimeout(() => el.remove(), 1700);
}
