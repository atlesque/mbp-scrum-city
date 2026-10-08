import { Sound } from '../core/audio.js';
import { kb } from '../core/controls.js';
import { G, P, inv, stats } from '../core/state.js';
import { GUNS, WBY, WEAPONS, wStat } from '../data/weapons.js';
import { charMat, gunGeo } from '../characters/character.js';
import { toast } from '../ui/hud.js';
import { $, lerp } from '../core/util.js';
import { addEntity, removeEntity } from '../entities/registry.js';
import { PGEO } from '../render/effects.js';
import { scene } from '../render/scene.js';

// ================= PICKUPS & MONEY =================
const cashGeo = new THREE.BoxGeometry(0.55, 0.28, 0.08), cashMat = new THREE.MeshBasicMaterial({ color: '#5cff6a' });
const hpMat = new THREE.MeshBasicMaterial({ color: '#ff3b5c' });

// A plate-carrier armor vest: front and back panels (the front with a scooped neck), shoulder straps over the top,
// cummerbund straps round the sides, three mag pouches and a light ID patch. Lit, with some glow so it reads at night.
// Built once at 0.9 m tall; armorVest(s) hands out a scaled copy that shares the geometry.
const vestMat = new THREE.MeshLambertMaterial({ color: '#2f86dc', emissive: '#0c3460' });
const strapMat = new THREE.MeshLambertMaterial({ color: '#132438', emissive: '#060e18' });
const patchMat = new THREE.MeshBasicMaterial({ color: '#d8f1ff' });
function vestPanel(neckDip) {
  const s = new THREE.Shape(), w = 0.34;
  s.moveTo(-w, -0.42); s.lineTo(w, -0.42); s.lineTo(w + 0.02, 0);
  s.quadraticCurveTo(0.21, 0.04, 0.21, 0.3); s.lineTo(0.21, 0.44); s.lineTo(0.1, 0.44);
  s.quadraticCurveTo(0, 0.44 - neckDip * 2, -0.1, 0.44);
  s.lineTo(-0.21, 0.44); s.lineTo(-0.21, 0.3); s.quadraticCurveTo(-0.21, 0.04, -w - 0.02, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.022, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.035); return g;
}
const VEST = (() => {
  const m = new THREE.Group(), gap = 0.13;
  const front = new THREE.Mesh(vestPanel(0.16), vestMat), back = new THREE.Mesh(vestPanel(0.05), vestMat);
  front.position.z = gap; back.position.z = -gap; m.add(front, back);
  const strap = (w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), strapMat); b.position.set(x, y, z); m.add(b); };
  for (const x of [-0.155, 0.155]) strap(0.09, 0.05, 2 * gap + 0.13, x, 0.46, 0);           // over the shoulders
  for (const y of [-0.12, -0.3]) for (const x of [-0.36, 0.36]) strap(0.05, 0.1, 2 * gap, x, y, 0); // round the sides
  for (const x of [-0.18, 0, 0.18]) {                                                       // mag pouches with flaps
    strap(0.15, 0.17, 0.07, x, -0.27, gap + 0.08);
    strap(0.16, 0.05, 0.085, x, -0.18, gap + 0.085);
  }
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.02), patchMat); patch.position.set(0, 0.06, gap + 0.07); m.add(patch);
  return m;
})();
const armorVest = s => { const m = VEST.clone(); m.scale.setScalar(s); return m; };

// Pickups that sit on the street and come back after a while. stat is the field on the player they top up.
export const PICKUP_TYPES = {
  health: { stat: 'hp', amount: 50, respawn: 45, label: '+50 health', color: '#ff7a9a', radar: '#ff5a7a',
    mesh() { const m = new THREE.Group(), a = new THREE.Mesh(PGEO, hpMat), b = new THREE.Mesh(PGEO, hpMat); a.scale.set(0.7, 0.22, 0.22); b.scale.set(0.22, 0.7, 0.22); m.add(a, b); return m; } },
  armor: { stat: 'armor', amount: 50, respawn: 60, label: '+50 armor', color: '#5ec8ff', radar: '#5ec8ff',
    mesh() { return armorVest(1.2); } },
};

const Pickup = {
  kind: 'pickup',
  blipLayer: 0,
  update(dt) {
    const p = this, def = p.def;
    if (!p.active) { p.respawnT -= dt; if (p.respawnT <= 0) { p.active = true; p.m.visible = true; } return; }
    p.m.rotation.y += dt * 2.5; p.m.position.y = 0.95 + Math.sin(G.time * 3 + p.x) * 0.12;
    if (Math.hypot(P.x - p.x, P.z - p.z) < 1.4 && P.alive && P.y < 2 && P[def.stat] < 100) {
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
// says whether it was new. Every weapon handed over this way counts as found, so getting wasted takes it back
// (loseFound in data/weapons.js); only what the player buys at the gun shop stays.
export const WEAPON_PICKUP_RESPAWN = 90;
export function takeWeapon(inv, id) {
  if (inv.owned[id]) return false;
  inv.owned[id] = true; inv.lvl[id] = inv.lvl[id] || 0; inv.mag[id] = 0; (inv.found ||= {})[id] = true; return true;
}
// A weapon dropped by a fallen enemy (`weaponDrops` in npcs/types.js). A new one is found (see takeWeapon) and comes
// loaded with a pack of ammo; a gun the player already has gives the pack, thrown weapons stack. A melee weapon the
// player already has is no use and stays put (null). Otherwise returns the feed label.
export function pickUpWeapon(inv, id) {
  const w = WBY[id], had = !!inv.owned[id];
  if (had && w.melee) return null;
  if (!had) takeWeapon(inv, id);
  if (w.melee) return w.name;
  if (!had && !w.thrown) inv.mag[id] = wStat(w, 0).mag;
  inv.ammo[id] = (inv.ammo[id] || 0) + w.ammoPack;
  return w.thrown ? `${w.name} ×${w.ammoPack}` : had ? `+${w.ammoPack} ${w.name} ammo` : w.name;
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
    if (!P.alive || P.vehicle || P.y > 2 || Math.hypot(P.x - p.x, P.z - p.z) > 1.3 || !takeWeapon(inv, p.id)) return;
    Sound.pickup(); feed(WBY[p.id].name, false, '#ffd23e');
    if (!toldMelee) { toldMelee = true; toast(`Got a <em>${WBY[p.id].name}</em>. Hold <em>${kb('melee')}</em> for the weapon wheel, or tap it to switch between your fists and melee weapons.`, 6); }
    p.onTaken && p.onTaken(p.id);
    p.active = false; p.m.visible = p.glow.visible = false; p.respawnT = WEAPON_PICKUP_RESPAWN;
  },
  dispose() { scene.remove(this.m); scene.remove(this.glow); },
};
export function makeWeaponPickup(id, x, z, onTaken) { return weaponMesh(id, x, z, WeaponPickup, { onTaken }); }
function weaponMesh(id, x, z, proto, extra, y = 0) {
  const inner = new THREE.Mesh(gunGeo(id).geo, charMat), tilt = gunGeo(id).tilt || 0;
  inner.rotation.x = tilt; // stand it upright again (models tip forward to sit in a hand)
  const hold = new THREE.Group(); hold.add(inner); hold.rotation.z = Math.PI / 2; hold.scale.setScalar(1.5); // lie it on its side
  const box = new THREE.Box3().setFromObject(hold), c = box.getCenter(new THREE.Vector3()); hold.position.sub(c);
  const m = new THREE.Group(); m.add(hold); m.position.set(x, y + 1, z); scene.add(m);
  const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.set(x, y + 0.05, z); scene.add(glow);
  return addEntity(Object.assign(Object.create(proto), { id, x, y, z, m, glow, active: true, respawnT: 0 }, extra));
}
// A gun waiting up on a roof (world/rooftops.js: a sniper rifle on every roof with a door, the rocket launcher on the
// Herman Teirlinck), y metres up. Taken like an enemy's drop (pickUpWeapon): a new one is found, so it is lost when you
// get wasted, and one you have already gives a pack of ammo. It is back a while after it's taken.
export const ROOF_GUN_RESPAWN = 120;
const RoofGun = {
  kind: 'pickup',
  update(dt) {
    const p = this;
    if (!p.active) { p.respawnT -= dt; if (p.respawnT <= 0) { p.active = true; p.m.visible = p.glow.visible = true; } return; }
    p.m.rotation.y += dt * 1.8; p.m.position.y = p.y + 1.0 + Math.sin(G.time * 2.4 + p.x) * 0.1;
    if (!P.alive || P.vehicle || Math.abs(P.y - p.y) > 2 || Math.hypot(P.x - p.x, P.z - p.z) > 1.3) return;
    const had = !!inv.owned[p.id], label = pickUpWeapon(inv, p.id); if (!label) return;
    Sound.pickup(); feed(label, false, '#ffd23e');
    const w = WBY[p.id], key = w.melee ? kb('melee') : String((GUNS.indexOf(w) + 1) % 10);
    if (!had) { toast(`Got a <em>${w.name}</em>. Press <em>${key}</em> to use it. Picked-up weapons are lost when you get wasted.`, 6); p.onTaken && p.onTaken(p.id); }
    p.active = false; p.m.visible = p.glow.visible = false; p.respawnT = ROOF_GUN_RESPAWN;
  },
  dispose() { scene.remove(this.m); scene.remove(this.glow); },
};
export function makeRoofGun(id, x, y, z, onTaken) { return weaponMesh(id, x, z, RoofGun, { onTaken }, y); }
// a weapon left by a fallen enemy: like a street pickup, but only the one, and gone after a minute
let toldFound = false;
const DroppedWeapon = {
  kind: 'pickup',
  blipLayer: 0,
  update(dt) {
    const p = this;
    p.m.rotation.y += dt * 1.8; p.m.position.y = 1.0 + Math.sin(G.time * 2.4 + p.x) * 0.1;
    p.life -= dt; if (p.life <= 0) { removeEntity(p); return; }
    if (!P.alive || P.vehicle || P.y > 2 || Math.hypot(P.x - p.x, P.z - p.z) > 1.3) return;
    const label = pickUpWeapon(inv, p.id); if (!label) return;
    Sound.pickup(); feed(label, false, '#ffd23e');
    const w = WBY[p.id], key = w.melee ? kb('melee') : String((GUNS.indexOf(w) + 1) % 10);
    if (!toldFound) { toldFound = true; toast(`Got ${w.thrown ? '' : 'a '}<em>${w.name}</em>${key ? `. Press <em>${key}</em> to ${w.thrown ? 'pull one out' : 'use it'}` : ''}. Picked-up weapons are lost when you get wasted; only bought ones stay.`, 6); }
    removeEntity(p);
  },
  blip(radar) { radar.dot(this.x, this.z, '#ffd23e', 4, false, 'sq'); },
  dispose() { scene.remove(this.m); scene.remove(this.glow); },
};
export function dropWeapon(id, x, z) { return weaponMesh(id, x, z, DroppedWeapon, { life: 60 }); }

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
const ammoGuns = inv => WEAPONS.filter(w => inv.owned[w.id] && !w.infinite && !w.thrown); // grenades and molotovs only come as weapon drops
export const DROP_TYPES = {
  armor: { color: '#5ec8ff',
    useful: player => player.armor < 100,
    take(player) { player.armor = Math.min(100, player.armor + 25); return '+25 armor'; },
    mesh() { return armorVest(0.85); } },
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
