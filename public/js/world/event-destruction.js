import { P } from '../core/state.js';
import { ROOFS, SURFACES } from './rooftops.js';
import { all } from '../entities/registry.js';
import { emit } from '../render/effects.js';

// Ordinary buildings can become rubble. Door-accessible roofs, shops and landmarks stay usable.
export const eventBuildings = [];
export function recordEventBuilding(gbs, start, bounds, collider, signs) {
  const pieces = gbs.map((gb, i) => ({ gb, s: start[i], e: gb.p.length / 3 })).filter(q => q.e > q.s);
  eventBuildings.push({ ...bounds, collider, pieces, signs, broken: false, age: 0 });
}
const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
export function bindEventBuildings(meshes) {
  const by = new Map(meshes);
  for (const b of eventBuildings) {
    b.protected = ROOFS.some(r => overlaps(b, r.area));
    b.surfaces = SURFACES.filter(r => overlaps(b, r.area)).map(s => ({ s, floor: s.floor, blocks: s.blocks }));
    for (const q of b.pieces) {
      q.mesh = by.get(q.gb); delete q.gb;
      q.pos = q.mesh.geometry.attributes.position.array.slice(q.s * 3, q.e * 3);
    }
  }
}
function reshape(b, broken) {
  const scale = broken ? .045 : 1;
  for (const q of b.pieces) {
    const a = q.mesh.geometry.attributes.position;
    a.array.set(q.pos, q.s * 3);
    if (broken) for (let i = 1; i < q.pos.length; i += 3) a.array[q.s * 3 + i] *= scale;
    a.addUpdateRange(q.s * 3, q.pos.length); a.needsUpdate = true;
  }
  b.collider.h = b.h * scale;
  for (const { s, floor, blocks } of b.surfaces) {
    s.floor = floor * scale;
    s.blocks = broken ? blocks.map(q => ({ ...q, y0: q.y0 * scale, y1: q.y1 * scale })) : blocks;
  }
  for (const s of b.signs) if (s.mesh) s.mesh.position.y = s.y * scale;
  b.broken = broken;
}
export function damageBuildings(x, z, radius) {
  for (const b of eventBuildings) {
    if (b.protected || b.broken) continue;
    const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
    if (Math.hypot(dx, dz) >= radius) continue;
    reshape(b, true); b.age = 0;
    emit((b.x0 + b.x1) / 2, 3, (b.z0 + b.z1) / 2, 18, '#b9a2a1', 10, 1.8, 1.2, 1, 1);
  }
}
export function updateBuildings(dt) {
  for (const b of eventBuildings) {
    if (!b.broken) continue;
    b.age += dt;
    if (b.age < 75 || Math.hypot(P.x - (b.x0 + b.x1) / 2, P.z - (b.z0 + b.z1) / 2) < 65) continue;
    // Do not rebuild around an occupied vehicle or a pedestrian.
    if (all().some(e => !e.removed && e.x > b.x0 - 2 && e.x < b.x1 + 2 && e.z > b.z0 - 2 && e.z < b.z1 + 2)) continue;
    reshape(b, false);
  }
}
