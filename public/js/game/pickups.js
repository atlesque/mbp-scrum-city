import { Sound } from '../core/audio.js';
import { G, P, inv, stats } from '../core/state.js';
import { WBY, WEAPONS } from '../data/weapons.js';
import { charMat, gunGeo } from '../characters/character.js';
import { toast } from '../ui/hud.js';
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

// Melee weapons lying in the street, Vice City style: a slowly turning bat or blade over a soft glow. Walk over one
// you don't have yet to pick it up; it comes back a while after it's taken. takeWeapon(inv, id) hands it over and
// says whether it was new.
export const WEAPON_PICKUP_RESPAWN = 90;
export function takeWeapon(inv, id) {
  if (inv.owned[id]) return false;
  inv.owned[id] = true; inv.lvl[id] = inv.lvl[id] || 0; inv.mag[id] = 0; return true;
}
const glowGeo = new THREE.CircleGeometry(0.75, 20); glowGeo.rotateX(-Math.PI / 2);
const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd23e', transparent: true, opacity: 0.32, depthWrite: false });
let toldMelee = false;
const WeaponPickup = {
  kind: 'pickup',
  update(dt) {
    const p = this;
    if (!p.active) { p.respawnT -= dt; if (p.respawnT <= 0) { p.active = true; p.m.visible = p.glow.visible = true; } return; }
    p.m.rotation.y += dt * 1.8; p.m.position.y = 1.0 + Math.sin(G.time * 2.4 + p.x) * 0.1;
    if (!P.alive || P.vehicle || Math.hypot(P.x - p.x, P.z - p.z) > 1.3 || !takeWeapon(inv, p.id)) return;
    Sound.pickup(); feed(WBY[p.id].name, false, '#ffd23e');
    if (!toldMelee) { toldMelee = true; toast(`Got a <em>${WBY[p.id].name}</em>. Press <em>Q</em> to switch between your fists and melee weapons.`, 6); }
    p.onTaken && p.onTaken(p.id);
    p.active = false; p.m.visible = p.glow.visible = false; p.respawnT = WEAPON_PICKUP_RESPAWN;
  },
  dispose() { scene.remove(this.m); scene.remove(this.glow); },
};
export function makeWeaponPickup(id, x, z, onTaken) {
  const inner = new THREE.Mesh(gunGeo(id).geo, charMat), tilt = gunGeo(id).tilt || 0;
  inner.rotation.x = tilt; // stand it upright again (models tip forward to sit in a hand)
  const hold = new THREE.Group(); hold.add(inner); hold.rotation.z = Math.PI / 2; hold.scale.setScalar(1.5); // lie it on its side
  const box = new THREE.Box3().setFromObject(hold), c = box.getCenter(new THREE.Vector3()); hold.position.sub(c);
  const m = new THREE.Group(); m.add(hold); m.position.set(x, 1, z); scene.add(m);
  const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.set(x, 0.05, z); scene.add(glow);
  return addEntity(Object.assign(Object.create(WeaponPickup), { id, x, z, m, glow, active: true, respawnT: 0, onTaken }));
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
// What fallen enemies leave behind (see `drops` in npcs/types.js). useful(player, inv) says whether the
// player can use it right now (if not, it stays put); take(player, inv) applies it and returns the feed label.
const ammoMat = new THREE.MeshBasicMaterial({ color: '#ffd23e' }), ammoGeo = new THREE.BoxGeometry(0.5, 0.3, 0.3);
const ammoGuns = inv => WEAPONS.filter(w => inv.owned[w.id] && !w.infinite);
export const DROP_TYPES = {
  armor: { color: '#5ec8ff',
    useful: player => player.armor < 100,
    take(player) { player.armor = Math.min(100, player.armor + 25); return '+25 armor'; },
    mesh() { const m = new THREE.Group(), a = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), arMat); a.scale.set(1, 1.2, 0.45); m.add(a); return m; } },
  // a quarter of a shop pack for every gun the player owns that uses ammo
  ammo: { color: '#ffd23e',
    useful: (player, inv) => ammoGuns(inv).length > 0,
    take(player, inv) { for (const w of ammoGuns(inv)) inv.ammo[w.id] = (inv.ammo[w.id] || 0) + Math.max(1, Math.round(w.ammoPack / 4)); return '+ammo'; },
    mesh() { const m = new THREE.Group(); m.add(new THREE.Mesh(ammoGeo, ammoMat)); return m; } },
};

// a dropped armor vest or ammo box: like cash, drifts to the player when close and vanishes after 40 s
const Drop = {
  kind: 'pickup',
  blipLayer: 0,
  update(dt) {
    const p = this, d = Math.hypot(P.x - p.x, P.z - p.z);
    p.m.rotation.y += dt * 2.5; p.m.position.y = 0.55 + Math.sin(G.time * 3 + p.x) * 0.12;
    p.life -= dt; if (p.life <= 0) { removeEntity(p); return; }
    if (d > 5 || !P.alive || !p.def.useful(P, inv)) return;
    if (d < 1.2) { Sound.pickup(); feed(p.def.take(P, inv), false, p.def.color); removeEntity(p); return; }
    p.x = lerp(p.x, P.x, dt * 6); p.z = lerp(p.z, P.z, dt * 6); p.m.position.x = p.x; p.m.position.z = p.z;
  },
  blip(radar) { radar.dot(this.x, this.z, this.def.color, 4, false, 'sq'); },
  dispose() { scene.remove(this.m); },
};
export function dropItem(type, x, z) {
  const def = DROP_TYPES[type], m = def.mesh();
  m.position.set(x, 0.55, z); scene.add(m);
  return addEntity(Object.assign(Object.create(Drop), { type, def, x, z, m, life: 40 }));
}

export function reward(x, z, val, label) { inv.money += val; stats.earned += val; Sound.cash(); feed((label ? label + '  ' : '') + '+$' + val); }
function feed(text, bad, color) {
  const el = document.createElement('div'); el.className = 'outline' + (bad ? ' bad' : ''); el.textContent = text; if (color) el.style.color = color;
  const f = $('cashFeed'); f.appendChild(el); while (f.children.length > 5) f.firstChild.remove(); setTimeout(() => el.remove(), 1700);
}
