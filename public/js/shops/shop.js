import { selectWeapon } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { kb } from '../core/controls.js';
import { emit } from '../core/events.js';
import { requestLock } from '../core/input.js';
import { save } from '../core/save.js';
import { G, I, P, inv, keys } from '../core/state.js';
import { $ } from '../core/util.js';
import { addEntity } from '../entities/registry.js';
import { scene } from '../render/scene.js';
import { glyphSprite } from '../render/textures.js';
import { ITEM_TYPES } from './items.js';
import { SHOP_TYPES } from './types.js';

// ================= SHOP =================
// A shop door in the world: a glowing ring and glyph, a radar marker, and an E prompt that opens its menu.
const Shop = {
  kind: 'shop',
  blipLayer: 1,
  update() { this.glyph.position.y = 3 + Math.sin(G.time * 2) * 0.2; this.ring.material.opacity = 0.25 + Math.sin(G.time * 4) * 0.08; },
  closed() { return this.def.closedAtWanted != null && G.wanted >= this.def.closedAtWanted; },
  interaction(p) {
    const dist = Math.hypot(this.x - p.x, this.z - p.z); if (dist >= 2.2) return null;
    const closed = this.closed();
    return { keys: ['use'], priority: 1, dist, prompt: closed ? 'Shutters down. Lose some heat first (under ' + this.def.closedAtWanted + ' ★)' : `Press <kbd>${kb('use')}</kbd> to shop at ${this.def.name}`, run: () => openShop(this) };
  },
  blip(radar) { radar.glyph(this.x, this.z, this.def.marker.glyph, this.def.marker.color); },
};

export function spawnShop(type, x, z) {
  const def = SHOP_TYPES[type]; if (!def) throw new Error('unknown shop type ' + type);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: def.marker.color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.set(x, 1.1, z); scene.add(ring);
  const glyph = glyphSprite(def.marker.glyph, def.marker.color, 1.6); glyph.position.set(x, 3, z); scene.add(glyph);
  return addEntity(Object.assign(Object.create(Shop), { type, def, x, z, ring, glyph }));
}

// ---- the menu ----
const ctx = {
  inv, player: P,
  pay(n) { if (inv.money < n) { Sound.deny(); return false; } inv.money -= n; Sound.buy(); return true; },
  equip: id => selectWeapon(id),
};
export function openShop(shop) {
  if (shop.closed()) { Sound.deny(); return; }
  G.shop = shop; G.state = 'shop'; I.mouseL = false; I.mouseR = false; for (const k in keys) keys[k] = false;
  $('shopName').textContent = shop.def.name; $('shopFoot').textContent = (shop.def.footer || '').replace('{melee}', kb('melee'));
  $('shop').hidden = false; $('hud').hidden = true; renderShop();
  try { document.exitPointerLock(); } catch (e) {}
  Sound.hush();
  setTimeout(() => { const b = $('shopGrid').querySelector('button:not([disabled])') || $('shopClose'); b && b.focus(); }, 30);
}
export function closeShop(fromClick) {
  if (G.state !== 'shop') return;
  $('shop').hidden = true; $('hud').hidden = false; G.state = 'play'; G.shop = null; save(); requestLock(fromClick === true);
}
function renderShop() {
  const def = G.shop.def;
  $('shopMoney').textContent = '$' + inv.money.toLocaleString();
  $('shopSub').textContent = `${def.tagline} · ${G.wanted ? `Cops outside: ${'★'.repeat(G.wanted)}` : def.calm}`;
  $('shopGrid').innerHTML = def.catalogue.map((item, i) => ITEM_TYPES[item.type].render(item, ctx, i)).join('');
}
$('shopGrid').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-a]'); if (!b || b.disabled || !G.shop) return;
  const item = G.shop.def.catalogue[+b.dataset.i], a = b.dataset.a;
  if (ITEM_TYPES[item.type].act(item, a, ctx)) {
    if (a === 'eq') Sound.pickup();
    emit('shop:purchase', { shop: G.shop, item, action: a });
  }
  save(); renderShop(); G.hudCache = '';
});
$('shopClose').addEventListener('click', () => closeShop(true));
