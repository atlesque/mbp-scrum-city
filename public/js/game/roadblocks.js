import { charMat } from '../characters/character.js';
import { Sound } from '../core/audio.js';
import { G, P } from '../core/state.js';
import { on } from '../core/events.js';
import { addEntity, all, removeEntity } from '../entities/registry.js';
import { spawnNpc } from '../npcs/npc.js';
import { emit } from '../render/effects.js';
import { GB, UNIT, addGeo, box } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { toast } from '../ui/hud.js';
import { punctureTires } from '../vehicles/tires.js';
import { ROADS, addCollider, isFree, rayBox, removeCollider } from '../world/collision.js';

const LIMIT = 2, EVERY = 18, LIFE = 55;
let next = 0;
const local = (r, x, z) => { const c = Math.cos(r.yaw), s = Math.sin(r.yaw), dx = x - r.x, dz = z - r.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; };
const world = (r, x, z) => ({ x: r.x + x * Math.cos(r.yaw) + z * Math.sin(r.yaw), z: r.z - x * Math.sin(r.yaw) + z * Math.cos(r.yaw) });
const Roadblock = {
  kind: 'roadblock', blipLayer: 2,
  update(dt) {
    if (G.wanted < 3 || !P.alive) { removeEntity(this); return; }
    if (G.state !== 'play' || P.club) return;
    this.age += dt;
    if (this.age > LIFE || Math.hypot(P.x - this.x, P.z - this.z) > 170) { removeEntity(this); return; }
    for (const v of all('vehicle')) {
      if (v.dead || v.K.flies || (v.air || 0) > 0.4) continue;
      const now = local(this, v.x, v.z), prev = this.previous.get(v) || now;
      this.previous.set(v, now);
      // Swept crossing catches a fast car even when it steps over the narrow strip in one frame.
      const stripZ = -6, crossing = (prev.z - stripZ) * (now.z - stripZ) <= 0;
      const t = crossing && now.z !== prev.z ? (stripZ - prev.z) / (now.z - prev.z) : 1;
      const sx = prev.x + (now.x - prev.x) * t;
      if (this.spikes && ((crossing && Math.abs(sx) < 5.8) || (Math.abs(now.z - stripZ) < 1 && Math.abs(now.x) < 5.8)) && punctureTires(v)) {
        Sound.impact('metal', 0.7, { x: v.x, z: v.z });
        emit(v.x, 0.2, v.z, 10, '#ffd23e', 3, 0.35, 0.08);
        if (v === P.vehicle) toast('Spike strip! Tyres punctured. Use a repair tool or garage.');
      }
    }
  },
  // Called before vehicle collision settles the hull and removes its incoming speed.
  ram(v) {
    if (this.removed || v.dead || v.K.flies || (v.air || 0) > 0.4) return;
    const now = local(this, v.x, v.z), angle = v.yaw - this.yaw, b = v.K.body;
    const ex = b ? Math.abs(Math.cos(angle)) * b.hw + Math.abs(Math.sin(angle)) * b.hl : 0.6;
    const ez = b ? Math.abs(Math.sin(angle)) * b.hw + Math.abs(Math.cos(angle)) * b.hl : 1.5;
    if (Math.abs(now.z) < ez + 0.6 && [-3.8, 3.8].some(x => Math.abs(now.x - x) < ex + 1.4) && Math.abs(v.v) > 5) {
      const speed = Math.abs(v.v); this.damage(speed * 12);
      v.damage(speed * 1.5, false, true); v.v *= 0.5; Sound.thud(0.7, { x: v.x, z: v.z });
    }
  },
  damage(dmg) {
    if (this.removed || !(dmg > 0)) return;
    this.hp -= dmg;
    if (this.hp <= 0) { emit(this.x, 0.7, this.z, 18, '#ffba58', 5, 0.6, 0.16); removeEntity(this); }
  },
  raycast(o, d, max) {
    const p = local(this, o.x, o.z), c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    let hit = Infinity;
    for (const x of [-3.8, 3.8]) hit = Math.min(hit, rayBox(p.x, o.y, p.z, d.x * c - d.z * s, d.y, d.x * s + d.z * c, x - 1.4, 0, -0.4, x + 1.4, 1.15, 0.4));
    return hit >= 0 && hit < max ? { t: hit } : null;
  },
  onShot(hit, dmg) { this.damage(dmg); Sound.ting(0.5, hit.p); return { head: false }; },
  onRocket(dmg) { this.damage(dmg); },
  blast(x, y, z, radius, dmg) { const d = Math.hypot(x - this.x, z - this.z); if (d < radius + 5) this.damage(dmg * Math.max(0, 1 - d / (radius + 5))); },
  blip(radar) { radar.dot(this.x, this.z, '#ffb347', 8, true, 'sq'); },
  dispose() { for (const c of this.colliders) removeCollider(c); scene.remove(this.mesh); this.mesh.geometry.dispose(); },
};
export function spawnRoadblock(x, z, yaw, spikes = G.wanted >= 4) {
  const r = Object.assign(Object.create(Roadblock), { x, z, yaw, spikes, hp: 180, age: 0, previous: new WeakMap(), colliders: [] });
  const g = new GB();
  for (const bx of [-3.8, 3.8]) {
    box(g, 2.8, 0.8, 0.5, bx, 0.65, 0, '#eee6cf');
    for (let i = 0; i < 6; i++) addGeo(g, UNIT, bx - 1.1 + i * 0.44, 0.65, 0, 0.22, 0.75, 0.53, 0, 0, -0.2, '#e57934');
    for (const side of [-1, 1]) box(g, 0.2, 0.4, 1, bx + side, 0.2, 0, '#333342');
    box(g, 0.2, 0.2, 0.2, bx, 1.15, 0, '#ff3b4e');
    const a = world(r, bx - 1.4, -0.4), b = world(r, bx + 1.4, 0.4);
    r.colliders.push(addCollider(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z), 1.15, true));
  }
  if (spikes) {
    box(g, 11, 0.08, 0.5, 0, 0.04, -6, '#252633');
    for (let i = -10; i <= 10; i++) addGeo(g, UNIT, i * 0.5, 0.16, -6, 0.09, 0.28, 0.09, 0.3, 0, 0.3, '#c3c9cf');
  }
  r.mesh = new THREE.Mesh(g.geometry(), charMat); r.mesh.position.set(x, 0, z); r.mesh.rotation.y = yaw; scene.add(r.mesh);
  addEntity(r);
  for (const side of [-1, 1]) {
    const p = world(r, side * 6.5, 2); if (isFree(p.x, p.z, 0.5)) spawnNpc(G.wanted >= 4 ? 'swat' : 'cop', p.x, p.z);
  }
  return r;
}
export function clearRoadblocks() { for (const r of all('roadblock')) removeEntity(r); next = 0; }
export function updateRoadblocks(dt) {
  if (G.wanted < 3 || !P.alive) { clearRoadblocks(); return; }
  if (G.state !== 'play' || P.club || P.roof || P.y > 2) return;
  next -= dt; if (next > 0 || all('roadblock').length >= LIMIT) return;
  next = EVERY;
  const heading = P.vehicle?.yaw ?? P.yaw, dx = Math.round(Math.sin(heading)), dz = Math.round(Math.cos(heading));
  const alongZ = Math.abs(dz) >= Math.abs(dx), sign = alongZ ? Math.sign(dz) || 1 : Math.sign(dx) || 1;
  const nearest = v => ROADS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  for (const ahead of [65, 85, 105]) {
    const cross = nearest(alongZ ? P.x : P.z), along = Math.round(((alongZ ? P.z : P.x) + sign * ahead - 25) / 50) * 50 + 25;
    const x = alongZ ? cross : along, z = alongZ ? along : cross;
    if (Math.hypot(P.x - x, P.z - z) < 40 || !isFree(x, z, 6) || all('roadblock').some(r => Math.hypot(r.x - x, r.z - z) < 35)) continue;
    if (all('vehicle').some(v => Math.hypot(v.x - x, v.z - z) < 12)) continue;
    spawnRoadblock(x, z, alongZ ? (sign > 0 ? 0 : Math.PI) : sign * Math.PI / 2);
    toast(G.wanted >= 4 ? 'Police roadblock ahead — watch for spikes!' : 'Police barricade ahead!'); Sound.star(); break;
  }
}
on('wanted:lost', clearRoadblocks);
on('player:died', clearRoadblocks);
