import { P } from '../core/state.js';
import { clamp, rnd } from '../core/util.js';
import { emit } from '../render/effects.js';
import { scene } from '../render/scene.js';
import { placeCollider, rayBox, removeCollider } from './collision.js';

// ================= BREAKABLE PROPS =================
// Palm trees, street lamps, beach umbrellas and the lifeguard huts on the beach go down when a vehicle drives into
// them fast enough or an explosion goes off close by. They are baked into the city's merged meshes like everything
// else (one draw call per material), so each prop remembers which vertices it owns: breaking it folds those away
// in the big mesh and hands a copy of them to a loose piece of debris that topples or flies, then lies there a while.
// Once the debris is gone and the player is far enough away, the prop quietly stands up again.
//
// Per kind:
//   mode     'topple' falls over as one piece, hinged at its foot; 'burst' comes apart into its pieces, each flying alone
//   smash    closing speed (m/s) a vehicle needs to break it; anything slower is stopped by its collider as before
//   slow     share of its speed the vehicle keeps after breaking it
//   dent     damage to the vehicle per m/s of closing speed
//   blast    share of an explosion's radius that breaks it
//   r        radius it is hit at
//   chips    colour of the bits that fly off
export const PROPS = {
  palm: { mode: 'topple', smash: 8, slow: 0.55, dent: 0.8, blast: 0.75, r: 0.35, chips: '#7a5c40' },
  lamp: { mode: 'topple', smash: 4, slow: 0.82, dent: 0.3, blast: 0.8, r: 0.2, chips: '#ffd23e' },
  umbrella: { mode: 'burst', smash: 1.5, slow: 0.97, dent: 0, blast: 1, r: 0.6, chips: '#f4ece6' },
  hut: { mode: 'burst', smash: 7, slow: 0.5, dent: 0.6, blast: 0.6, r: 1.7, chips: '#f4ece6' },
};
// debris lies LIE seconds, then sinks into the ground over SINK; a prop stands again once the player is AWAY metres off
export const LIE = 45, SINK = 2, AWAY = 90;
const G = 22;

export const props = [];
// bumped every time a lamp goes out or comes back, so render/lighting.js can move its glow pools
export let lampsVersion = 0;

// Record the geometry `build` adds to the builders in `gbs` as one prop of `kind` standing at x, z. `build` gets a
// cut() to start a new piece (a burst prop flies apart along these cuts) and returns its collider, if it has one.
export function prop(kind, x, z, gbs, build, extra) {
  const at = () => gbs.map(gb => gb.p.length / 3), pieces = [];
  let start = at();
  const cut = () => { const now = at(); gbs.forEach((gb, i) => { if (now[i] > start[i]) pieces.push({ gb, s: start[i], e: now[i] }); }); start = now; };
  const collider = build(cut) || null;
  cut();
  const p = { kind, T: PROPS[kind], x, z, pieces, collider, broken: false, debris: [], ...extra };
  props.push(p);
  return p;
}

// After the builders became meshes: tie each piece to the mesh it ended up in and keep a copy of its vertices.
// `meshes` pairs each builder with its mesh.
export function bindProps(meshes) {
  const by = new Map(meshes);
  for (const p of props) for (const q of p.pieces) {
    q.mesh = by.get(q.gb); delete q.gb;
    const a = q.mesh.geometry.attributes;
    q.pos = a.position.array.slice(q.s * 3, q.e * 3);
    q.nor = a.normal.array.slice(q.s * 3, q.e * 3);
    q.col = a.color.array.slice(q.s * 3, q.e * 3);
  }
}

// write a piece's vertices back into the merged mesh, or fold them into a point under the ground
function show(q, on, p) {
  const attr = q.mesh.geometry.attributes.position, arr = attr.array;
  if (on) arr.set(q.pos, q.s * 3);
  else for (let i = q.s * 3; i < q.e * 3; i += 3) { arr[i] = p.x; arr[i + 1] = -5; arr[i + 2] = p.z; }
  attr.addUpdateRange(q.s * 3, (q.e - q.s) * 3); attr.needsUpdate = true;
}

// a loose copy of some pieces, with its origin at (ox, oy, oz)
function debrisMesh(pieces, ox, oy, oz) {
  const grp = new THREE.Group();
  for (const q of pieces) {
    const g = new THREE.BufferGeometry(), pos = q.pos.slice();
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= ox; pos[i + 1] -= oy; pos[i + 2] -= oz; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(q.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(q.col, 3));
    grp.add(new THREE.Mesh(g, q.mesh.material));
  }
  grp.position.set(ox, oy, oz); scene.add(grp);
  return grp;
}
function centre(q) {
  let x = 0, y = 0, z = 0, lo = Infinity, hi = -Infinity; const n = q.pos.length / 3;
  for (let i = 0; i < q.pos.length; i += 3) { x += q.pos[i]; y += q.pos[i + 1]; z += q.pos[i + 2]; lo = Math.min(lo, q.pos[i + 1]); hi = Math.max(hi, q.pos[i + 1]); }
  return { x: x / n, y: y / n, z: z / n, half: Math.min((hi - lo) / 2, 0.6) };
}

// ---- how the pieces move (no meshes involved, so the rules can be tested on their own) ----

// Topple: a stick of length L hinged at its foot, pushed over with angular speed w towards (dx, dz). Gravity takes it
// the rest of the way; it lands at just short of flat with a bounce or two.
export function toppleStart(L, push, dx, dz) {
  const d = Math.hypot(dx, dz) || 1;
  return { a: 0.02, w: clamp(push / Math.max(L, 1), 0.4, 3.5), L, dx: dx / d, dz: dz / d, slide: Math.min(push * 0.25, 4), bounces: 0, rest: false };
}
export const TOPPLE_FLAT = Math.PI / 2 - 0.06;
export function toppleStep(t, dt) {
  if (t.rest) return false;
  t.w += 1.5 * G / t.L * Math.sin(t.a) * dt;
  t.a += t.w * dt;
  t.slide = Math.max(0, t.slide - 6 * dt);
  if (t.a >= TOPPLE_FLAT) {
    t.a = TOPPLE_FLAT;
    if (t.w > 0.6 && t.bounces < 2) { t.w = -t.w * 0.25; t.bounces++; }
    else { t.w = 0; t.rest = true; }
    return 'land';
  }
  return true;
}
// Burst: a piece flying free from (x, y, z) with velocity v and a spin, bouncing until it settles at height `half`.
export function burstStart(x, y, z, half, dx, dz, push) {
  const d = Math.hypot(dx, dz) || 1, s = push * rnd(0.5, 1);
  return { x, y, z, half, vx: dx / d * s + rnd(-1.5, 1.5), vz: dz / d * s + rnd(-1.5, 1.5), vy: rnd(2, 4) + push * 0.35, rx: 0, rz: 0, sx: rnd(-6, 6), sz: rnd(-6, 6), rest: false };
}
export function burstStep(b, dt) {
  if (b.rest) return false;
  b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rx += b.sx * dt; b.rz += b.sz * dt;
  if (b.y > b.half) return true;
  b.y = b.half;
  if (b.vy < -3) { b.vy = -b.vy * 0.3; b.vx *= 0.6; b.vz *= 0.6; b.sx *= 0.5; b.sz *= 0.5; return 'land'; }
  b.vy = 0; b.vx = b.vz = 0; b.sx = b.sz = 0; b.rest = true;
  return 'land';
}

// Does a vehicle closing at `closing` m/s break a prop of kind T?
export const smashes = (T, closing) => closing >= T.smash;
// Does an explosion of radius R at distance d (metres, height taken into account) break it?
export const blasted = (T, d, R) => d < R * T.blast;

// ---- breaking and putting back ----
const _ax = new THREE.Vector3();
export function breakProp(p, dx, dz, push) {
  if (p.broken) return;
  p.broken = true; p.lieT = 0;
  if (p.collider) removeCollider(p.collider);
  if (p.lamp) { p.lamp.dead = true; lampsVersion++; }
  for (const q of p.pieces) show(q, false, p);
  const T = p.T;
  if (T.mode === 'topple') {
    const m = debrisMesh(p.pieces, p.x, 0, p.z);
    p.debris.push({ m, t: toppleStart(p.h || 6, push, dx, dz) });
    emit(p.x, 1, p.z, 10, T.chips, 4, 0.5, 0.1);
  } else for (const q of p.pieces) {
    const c = centre(q), m = debrisMesh([q], c.x, c.y, c.z);
    p.debris.push({ m, b: burstStart(c.x, c.y, c.z, c.half, c.x - p.x + dx, c.z - p.z + dz, push) });
    emit(c.x, c.y, c.z, 4, T.chips, 4, 0.5, 0.1);
  }
}
function standUp(p) {
  for (const d of p.debris) { scene.remove(d.m); for (const c of d.m.children) c.geometry.dispose(); }
  p.debris.length = 0;
  for (const q of p.pieces) show(q, true, p);
  if (p.collider) placeCollider(p.collider);
  if (p.lamp) { p.lamp.dead = false; lampsVersion++; }
  p.broken = false;
}

// a vehicle at (x, z) heading along (fx, fz), moving with velocity (vx, vz): its hull is a capsule `half` metres
// either side of its centre and `r` wide. Returns the props it broke, with the closing speed of each.
const _hits = [];
export function smashProps(x, z, fx, fz, vx, vz, half, r) {
  _hits.length = 0;
  const sp = Math.hypot(vx, vz); if (sp < 1) return _hits;
  for (const p of props) {
    if (p.broken || Math.abs(p.x - x) > 8 || Math.abs(p.z - z) > 8) continue;
    const t = clamp((p.x - x) * fx + (p.z - z) * fz, -half, half), cx = x + fx * t, cz = z + fz * t;
    const ox = p.x - cx, oz = p.z - cz, d = Math.hypot(ox, oz);
    if (d > r + p.T.r + 0.25) continue;
    const closing = d > 1e-3 ? (vx * ox + vz * oz) / d : sp;
    if (!smashes(p.T, closing)) continue;
    breakProp(p, vx, vz, closing);
    _hits.push({ p, closing });
  }
  return _hits;
}
// the first standing prop a bullet's path from o along d (a unit vector) runs into within maxT: { t, prop } or null.
// Each is its collider (a palm's trunk, a lamp post, a hut), or a thin pole up to its height when it has none.
export function propOnRay(o, d, maxT) {
  const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT, x0 = Math.min(o.x, ex) - 2, x1 = Math.max(o.x, ex) + 2, z0 = Math.min(o.z, ez) - 2, z1 = Math.max(o.z, ez) + 2;
  let best = null;
  for (const p of props) {
    if (p.broken || p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
    const c = p.collider || { x0: p.x - 0.08, x1: p.x + 0.08, z0: p.z - 0.08, z1: p.z + 0.08, h: p.h || 2 };
    if (o.x > c.x0 && o.x < c.x1 && o.z > c.z0 && o.z < c.z1 && o.y < c.h) continue; // starting inside it (standing on a hut): shoot out
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, c.x0, 0, c.z0, c.x1, c.h, c.z1);
    if (t < (best ? best.t : maxT)) best = { t, prop: p };
  }
  return best;
}
// an explosion: everything close enough goes over, away from the blast
export function blastProps(x, y, z, R, power = 1) {
  for (const p of props) {
    if (p.broken || Math.abs(p.x - x) > R || Math.abs(p.z - z) > R) continue;
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz, Math.max(0, y - (p.h || 3)));
    if (!blasted(p.T, d, R)) continue;
    breakProp(p, dx || rnd(-1, 1), dz || rnd(-1, 1), (1 - d / R) * 14 * power + 3);
  }
}

export function updateProps(dt) {
  for (const p of props) {
    if (!p.broken) continue;
    p.lieT += dt;
    const sink = Math.max(0, p.lieT - LIE) / SINK;
    for (const d of p.debris) {
      if (d.t) {
        const t = d.t; toppleStep(t, dt);
        _ax.set(t.dz, 0, -t.dx); d.m.quaternion.setFromAxisAngle(_ax, t.a);
        if (t.slide) { d.m.position.x += t.dx * t.slide * dt; d.m.position.z += t.dz * t.slide * dt; }
        d.m.position.y = -sink * 1.5;
      } else {
        const b = d.b; burstStep(b, dt);
        d.m.position.set(b.x, b.y - sink * 1.5, b.z); d.m.rotation.set(b.rx, 0, b.rz);
      }
    }
    if (sink >= 1) {
      if (p.debris.length) { for (const d of p.debris) { scene.remove(d.m); for (const c of d.m.children) c.geometry.dispose(); } p.debris.length = 0; }
      if (Math.hypot(P.x - p.x, P.z - p.z) > AWAY) standUp(p);
    }
  }
}
