import { animateChar, deathAnim, disposeChar, makeCharacter, muzzleOf, setGun } from '../characters/character.js';
import { zoneDamage, zoneOnBody } from '../combat/hitzones.js';
import { Sound } from '../core/audio.js';
import { at } from '../core/spatial.js';
import { addEntity, removeEntity } from '../entities/registry.js';
import { NPC_TYPES, lookFrom } from '../npcs/types.js';
import { emit, muzzleFlash, tracer } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { raySphere } from '../world/collision.js';
import { send } from './net.js';
import { NPC_LAG, NPC_STALE, sample, trim } from './protocol.js';

// ================= MULTIPLAYER: OTHER PLAYERS' PEOPLE =================
// Each game runs the people it spawned around its own player. The ones near this player come in from that game (net/sync.js)
// and are drawn here as ghosts (kind 'ghost'): the same person, in the same clothes, where they are over there. A bullet
// or a melee blow that lands on one is sent to the game that runs them, which takes the damage (and says so if it was the end
// of them).
// A ghost goes when its game stops sending it: it walked off, was cleared away, or its player left.
const ghosts = new Map(); // `${player id}:${i}` -> ghost
export const ghostOf = (owner, i) => ghosts.get(owner + ':' + i);

const Ghost = {
  kind: 'ghost',
  blipLayer: 3,
  push(s, t) { this.buf.push({ at: t, s }); this.lastAt = t; },
  update(dt) {
    const now = performance.now() / 1000;
    trim(this.buf, now - NPC_LAG);
    const s = sample(this.buf, now - NPC_LAG); if (!s) return;
    const wasAlive = this.alive; this.alive = !!s.al;
    if (wasAlive && !this.alive) { this.deadT = 0; setGun(this.c, null); this.aiming = false; }
    this.x = s.x; this.y = s.y || 0; this.z = s.z; this.yaw = s.yaw;
    if (this.alive) {
      setGun(this.c, s.g || null);
      this.moveSpeed = s.ms; this.aiming = !!s.a; this.panic = !!s.pn; this.twoHand = !!s.th; this.aimPitch = s.p;
      animateChar(this, dt);
      // knocked down over there (a melee blow): lying in the street here too
      this.c.body.rotation.x = s.dn ? -Math.PI / 2 : 0; if (s.dn) this.c.body.position.y = 0.12;
    } else deathAnim(this, dt);
    this.c.root.position.set(this.x, this.y, this.z); this.c.root.rotation.set(0, this.yaw, 0);
  },
  raycast(o, d, maxT) {
    if (!this.alive) return null;
    const s = this.def.scale || 1, yo = this.y || 0;
    let best = null;
    const test = (y, r, head) => { const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, this.x, y * s + yo, this.z, r * s); if (t < maxT && (!best || t < best.t)) best = { t, head }; };
    test(1.05, 0.44, false); test(0.5, 0.32, false); test(1.74, 0.2, true);
    if (best) best.zone = best.head ? 'head' : zoneOnBody(o, d, best.t, this.x, this.z, this.yaw, yo, s);
    return best;
  },
  // the player's bullet: their game takes the damage
  onShot(hit, dmg, dir) {
    const zone = hit.zone || (hit.head ? 'head' : 'torso'), r2 = n => Math.round(n * 100) / 100;
    send({ t: 'nhit', to: this.owner, i: this.i, d: Math.round(zoneDamage(dmg, zone) * 10) / 10, dx: dir ? r2(dir.x) : 0, dz: dir ? r2(dir.z) : 0 });
    emit(this.x, 1.2, this.z, 6, '#c0142c', 3.5, 0.5, 0.09);
    return { head: zone === 'head', zone };
  },
  // the player's melee blow (combat/melee.js): their game takes it, and the knock with it
  meleeHit(h) {
    const r2 = n => Math.round(n * 100) / 100;
    send({ t: 'nhit', to: this.owner, i: this.i, d: Math.round(h.dmg * 10) / 10, dx: r2(h.dir.x), dz: r2(h.dir.z), k: r2(h.knock), dn: h.down ? 1 : 0, b: h.blade ? 1 : 0 });
    emit(this.x, 1.2, this.z, h.blade ? 6 : 3, '#c0142c', 3.5, 0.5, 0.09);
  },
  blip(radar) {
    const r = this.def.radar; if (!r || !this.alive) return;
    radar.dot(this.x, this.z, r === 'siren' ? (radar.flash ? '#ff3b4e' : '#4a7dff') : r, 7, true);
  },
  // they fired, over there: the flash, the tracer and the bang from where they stand here
  showShot(m) {
    if (!Array.isArray(m.h) || !m.h.length) return;
    const from = this.c.gun ? muzzleOf(this.c).clone() : new THREE.Vector3(...m.f), laser = m.w === 'laser';
    tracer(from, new THREE.Vector3(...m.h[0]), true, laser);
    if (laser) emit(from.x, from.y, from.z, 3, '#6dff8a', 2, 0.15, 0.06); else muzzleFlash(from, !!this.def.bigFlash);
    Sound.shot(this.def.gun || m.w, 0.7, at(this, 1.3));
  },
  shouldDespawn() { return false; },
  dispose() { disposeChar(this.c); },
};

// a batch of someone's people: [{ i, type, seed, s }] from unpackNpc (net/protocol.js), arrived at time t
export function ghostsFrom(owner, people, t) {
  for (const p of people) {
    const key = owner + ':' + p.i;
    let g = ghosts.get(key);
    if (!g) {
      const def = NPC_TYPES[p.type]; if (!def) continue;
      const c = makeCharacter(lookFrom(def, p.seed)); if (def.gun) setGun(c, def.gun);
      c.root.position.set(p.s.x, p.s.y, p.s.z); scene.add(c.root);
      g = Object.assign(Object.create(Ghost), { owner, i: p.i, key, type: p.type, def, faction: def.faction, c, buf: [], r: def.scale ? 0.5 : 0.38, x: p.s.x, y: p.s.y, z: p.s.z, yaw: p.s.yaw,
        alive: !!p.s.al, deadT: 1, moveSpeed: 0, aiming: false, aimPitch: 0, twoHand: false, panic: false, lastAt: t });
      ghosts.set(key, g); addEntity(g);
    }
    g.push(p.s, t);
  }
}
// the ones their game has stopped sending (or all of one player's, when they leave)
export function pruneGhosts(now, owner = null) {
  for (const g of ghosts.values()) if (owner ? g.owner === owner : now - g.lastAt > NPC_STALE) { ghosts.delete(g.key); removeEntity(g); }
}
export const ghostCount = () => ghosts.size;
