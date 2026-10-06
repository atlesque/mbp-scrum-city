import { GB, UNIT, addGeo, cylG } from '../render/geometry.js';

// Spinning wheels. A model opts in by returning `wheels` from its mesh: one Object3D per wheel, its origin on the
// axle and its x axis along it, with userData.r the radius of the tyre (see wheelAt). The vehicle's kind turns them
// each frame by how far the vehicle rolled (see rolling), so they turn backwards in reverse.

// a wheel mesh on the axle at (x, y, z) in the vehicle's space, from geometry centred on that axle
export function wheelAt(geo, mat, x, y, z, r) {
  const w = new THREE.Mesh(geo, mat); w.position.set(x, y, z); w.userData.r = r; return w;
}

// how fast the tyres roll along the ground (m/s, negative in reverse): the speed along the way the vehicle points,
// shoves included. A wreck's locked wheels skid instead, and nothing turns them up in the air.
export function rolling(v) {
  if (v.dead || v.air > 0) return 0;
  return (v.v || 0) + (v.kvx || 0) * Math.sin(v.yaw) + (v.kvz || 0) * Math.cos(v.yaw);
}

// turn each wheel by the distance `d` rolled
export function spinWheels(wheels, d) {
  if (!wheels || !d) return;
  for (const w of wheels) w.rotation.x = (w.rotation.x + d / w.userData.r) % (Math.PI * 2);
}

// a plain wheel for the simpler cars, around its axle: a tyre, a hub cap on the outer face (side s: +1 faces +x) and
// `slots` dark marks on the cap so the spin shows. Built once per look and shared by every car using it.
const GEOS = {};
export function hubWheelGeo(s, { r, width, cap, tyre = '#141218', capCol = '#9a9da4', slotCol = '#3a3c42', slots = 5 }) {
  const k = [s, r, width, cap, tyre, capCol, slotCol, slots].join(); if (GEOS[k]) return GEOS[k];
  const g = new GB(), face = s * width / 2;
  addGeo(g, cylG(16), 0, 0, 0, r * 2, width, r * 2, 0, 0, Math.PI / 2, tyre);
  addGeo(g, cylG(16), face, 0, 0, cap * 2, 0.02, cap * 2, 0, 0, Math.PI / 2, capCol);
  for (let i = 0; i < slots; i++) { const a = i / slots * Math.PI * 2, rm = cap * 0.6; addGeo(g, UNIT, face + s * 0.012, Math.cos(a) * rm, Math.sin(a) * rm, 0.01, cap * 0.55, cap * 0.22, a, 0, 0, slotCol); }
  return (GEOS[k] = g.geometry());
}
