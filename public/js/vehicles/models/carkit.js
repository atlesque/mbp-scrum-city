import { GB, UNIT, addGeo, cylG } from '../../render/geometry.js';
import { charMat } from '../../characters/character.js';
import { wheelAt } from '../wheels.js';

// ================= CAR KIT =================
// A small kit for the detailed cars (models/modely-blue.js, eqa.js, bmw5.js); preview them at /dev/cars.html. A car is drawn in real metres in car space
// (+z forward, +x to the driver's side, ground at y 0) and scaled to the game's footprint at the end.
// Panels are outlines pushed through a width ("slabs") with rounded edges, then bent by the car's warp: narrower nose and
// tail in plan, sides leaning in towards the roof, a crowned bonnet and roof. Everything on the body goes through the same
// warp, so lights, trims and pillars sit on the panels they belong to.
//   side outlines are [z, y] points, counter-clockwise: over the top from the nose to the tail, then back along the sills
//   front/rear plates are [x, y] outlines laid onto the nose or tail
// The finished geometry is built once per model and shared by every car of that model.

// lamps ignore the lighting, so they read as lit by day and glow at night
export const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
// darker tinted glass than the old cars', still clear enough to see (and shoot) whoever is at the wheel
export const tintMat = new THREE.MeshPhongMaterial({ color: '#22324a', transparent: true, opacity: 0.62, shininess: 110, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });

// ---------- outlines ----------
// a smooth run through the points, sampled about every `step` metres
export function spline(pts, step = 0.09) {
  if (pts.length === 2) {
    const [a, b] = pts, n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  }
  const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], 0)), false, 'centripetal');
  return c.getSpacedPoints(Math.max(2, Math.ceil(c.getLength() / step))).map(v => [v.x, v.y]);
}
// smooth runs joined at sharp corners (each run starts where the last ended)
export function runs(...rs) {
  const out = [];
  for (const r of rs) for (const p of spline(r)) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 1e-4) out.push(p);
  return out;
}
// the bottom edge from the tail back to the nose at height y, cut by wheel arches { z, y, r }
export function sills(zRear, zFront, y, arches) {
  const out = [[zRear, y]];
  for (const a of [...arches].sort((p, q) => p.z - q.z)) {
    const a0 = Math.acos(Math.max(-1, Math.min(1, (y - a.y) / a.r))), n = 16;
    for (let i = 0; i <= n; i++) { const t = -a0 + 2 * a0 * i / n; out.push([a.z + Math.sin(t) * a.r, a.y + Math.cos(t) * a.r]); }
  }
  out.push([zFront, y]);
  return out;
}
// a band of width w around a wheel arch, from the sill up and over (cladding, arch flares)
export function archBand(a, y, w) {
  const out = [], inner = [], a0 = Math.acos(Math.max(-1, Math.min(1, (y - a.y) / a.r))), a1 = Math.acos(Math.max(-1, Math.min(1, (y - a.y) / (a.r + w)))), n = 16;
  for (let i = 0; i <= n; i++) { const t = -a1 + 2 * a1 * i / n; out.push([a.z + Math.sin(t) * (a.r + w), a.y + Math.cos(t) * (a.r + w)]); }
  for (let i = n; i >= 0; i--) { const t = -a0 + 2 * a0 * i / n; inner.push([a.z + Math.sin(t) * a.r, a.y + Math.cos(t) * a.r]); }
  return clean(out.concat(inner));
}
// the well inside a wheel arch, so the arch can't be seen through
export const archWell = (a, y) => clean(sills(a.z - a.r, a.z + a.r, y, [a]).slice(1, -1));
// a closed side outline: the top from nose to tail, then the sills back to the nose
export const sideOutline = (top, sill) => clean(top.concat(sill.slice(1, -1)));
export function clean(poly) {
  const out = [];
  for (const p of poly) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 1e-4) out.push(p);
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-4) out.pop();
  return area(out) < 0 ? out.reverse() : out;
}
const area = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
// a strip of width t along an open line
export function strip(pts, t) {
  const L = [], R = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    L.push([p[0] - dy / l * t / 2, p[1] + dx / l * t / 2]); R.push([p[0] + dy / l * t / 2, p[1] - dx / l * t / 2]);
  });
  return clean(L.concat(R.reverse()));
}
export function rrect(cx, cy, w, h, r, n = 4) {
  r = Math.min(r, w / 2, h / 2); const out = [];
  for (const [qx, qy, a0] of [[1, 1, 0], [-1, 1, 0.5], [-1, -1, 1], [1, -1, 1.5]]) for (let i = 0; i <= n; i++) {
    const a = (a0 + i / n * 0.5) * Math.PI; out.push([cx + qx * (w / 2 - r) + Math.cos(a) * r, cy + qy * (h / 2 - r) + Math.sin(a) * r]);
  }
  return clean(out);
}
export const circle = (cx, cy, r, n = 20) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * Math.PI * 2) * r, cy + Math.sin(i / n * Math.PI * 2) * r]);
// part of an outline whose first coordinate lies between u0 and u1, in order (for trims that follow a roofline or a beltline)
export function along(poly, u0, u1, pick = (a, b) => a[1] > b[1]) {
  const segs = []; let cur = [];
  for (let i = 0; i <= poly.length; i++) { const p = poly[i % poly.length]; if (p[0] >= u0 && p[0] <= u1) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
  if (cur.length) segs.push(cur);
  return segs.reduce((best, s) => (!best || pick(s[s.length >> 1], best[best.length >> 1]) ? s : best), null);
}
// where a horizontal line at height y leaves the outline at the front (max z) or the back (min z)
export function edgeZ(poly, y, front = true) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    const z = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
    if (best === null || (front ? z > best : z < best)) best = z;
  }
  return best;
}

// ---------- slabs ----------
// a closed outline (u, v; counter-clockwise) pushed from w0 to w1, every edge rounded with radius r.
// open: a trim laid on a panel, with no back face and a square edge at w0 (it sits in the panel there).
// Returns triangles as [u, v, w] corners, wound so their faces point out.
function slab(poly, w0, w1, { r = 0.06, seg = 2, divs = 4, grid = 0.22, edge = 0.1, open = false } = {}) {
  r = Math.min(r, (w1 - w0) / 2 - 1e-4); poly = densify(clean(poly), edge);
  const n = poly.length, N = poly.map((p, i) => {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    let e1x = p[0] - a[0], e1y = p[1] - a[1], e2x = b[0] - p[0], e2y = b[1] - p[1];
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1; e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    let nx = e1y + e2y, ny = -e1x - e2x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; // outward
    const k = Math.min(1.4, 1 / Math.max(0.2, nx * e1y - ny * e1x)); return [nx * k, ny * k];
  });
  const ring = inset => poly.map((p, i) => [p[0] - N[i][0] * inset, p[1] - N[i][1] * inset]);
  const rings = [];
  if (open) rings.push({ w: w0, d: 0 });
  else for (let k = 0; k <= seg; k++) { const t = k / seg * Math.PI / 2; rings.push({ w: w0 + r * (1 - Math.cos(t)), d: r * (1 - Math.sin(t)) }); }
  for (let k = 1; k < divs; k++) rings.push({ w: w0 + r + (w1 - w0 - 2 * r) * k / divs, d: 0 });
  for (let k = seg; k >= 0; k--) { const t = k / seg * Math.PI / 2; rings.push({ w: w1 - r * (1 - Math.cos(t)), d: r * (1 - Math.sin(t)) }); }
  const pts = rings.map(R => ring(R.d).map(p => [p[0], p[1], R.w])), out = [];
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = pts[j][i], b = pts[j][(i + 1) % n], c = pts[j + 1][(i + 1) % n], d = pts[j + 1][i];
    if (rings[j].w === rings[j + 1].w && rings[j].d === rings[j + 1].d) continue;
    out.push(a, b, c, a, c, d);
  }
  // the two flat ends, with extra points inside so the warp can bend them
  const cap = ring(r), steiner = [];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const p of cap) { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
  for (let u = u0 + grid / 2; u < u1; u += grid) for (let v = v0 + grid / 2; v < v1; v += grid) if (inside(cap, u, v) && edgeDist(cap, u, v) > grid * 0.4) steiner.push([new THREE.Vector2(u, v)]);
  const tris = THREE.ShapeUtils.triangulateShape(cap.map(p => new THREE.Vector2(p[0], p[1])), steiner), all = cap.concat(steiner.map(s => [s[0].x, s[0].y]));
  for (const [i, j, k] of tris) {
    const A = all[i]; let B = all[j], C = all[k]; const cz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    // the w1 end faces +w (counter-clockwise seen from +w), the w0 end faces -w
    if (cz < 0) [B, C] = [C, B];
    out.push([A[0], A[1], w1], [B[0], B[1], w1], [C[0], C[1], w1]);
    if (!open) out.push([A[0], A[1], w0], [C[0], C[1], w0], [B[0], B[1], w0]);
  }
  return out;
}
// long edges split, so the warp can bend them
function densify(poly, edge) {
  const out = [];
  poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / edge); for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); });
  return out;
}
function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
function edgeDist(poly, x, y) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)); d = Math.min(d, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return d;
}
const flipWinding = tris => { for (let i = 0; i < tris.length; i += 3) { const t = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = t; } return tris; };

// side panels: an outline in the side plane (z, y), spanning x0..x1
export const side = (poly, x0, x1, o) => flipWinding(slab(poly, x0, x1, o).map(([u, v, w]) => [w, v, u]));
// plates on the nose or tail: an outline in (x, y), laid on the surface z = surf(y) (a number or a function), t thick
export const front = (poly, surf, t = 0.018, o) => slab(poly, -t, t, { r: Math.min(t * 0.9, 0.012), seg: 1, divs: 1, open: true, edge: 0.12, ...o }).map(([u, v, w]) => [u, v, (typeof surf === 'function' ? surf(v) : surf) + w]);
export const rear = (poly, surf, t = 0.018, o) => flipWinding(slab(poly, -t, t, { r: Math.min(t * 0.9, 0.012), seg: 1, divs: 1, open: true, edge: 0.12, ...o }).map(([u, v, w]) => [u, v, (typeof surf === 'function' ? surf(v) : surf) - w]));
// trims on the flank at x = hx (z, y outline), t thick; mirrored onto the other side with both()
export const flank = (poly, hx, t = 0.012, o) => side(poly, hx - t, hx + t, { r: Math.min(t * 0.9, 0.01), seg: 1, divs: 1, open: true, edge: 0.16, ...o });
export const mirror = tris => flipWinding(tris.map(([x, y, z]) => [-x, y, z]));
export const both = tris => tris.concat(mirror(tris));

// ---------- warp ----------
// keys: [[at, value], ...] in order; eased between keys
function ease(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i], s = (t - a) / (b - a); return va + (vb - va) * s * s * (3 - 2 * s); }
  return keys[keys.length - 1][1];
}
// hw: half width; plan: [[z, scale]], tumble: [[y, scale]] (sides leaning in), crown: [[y, drop at the edges]],
// nose / tail: [z where the rounding starts, z of the end, how far the corners pull back]
export function makeWarp({ hw, plan = [[0, 1]], tumble = [[0, 1]], crown = [[0, 0]], nose, tail }) {
  return ([x, y, z]) => {
    const u = Math.max(-1, Math.min(1, x / hw)), u2 = u * u;
    let Z = z;
    if (nose && z > nose[0]) Z -= nose[2] * u2 * ease([[nose[0], 0], [nose[1], 1]], z);
    if (tail && z < tail[0]) Z += tail[2] * u2 * ease([[tail[1], 1], [tail[0], 0]], z);
    return [x * ease(plan, z) * ease(tumble, y), y - ease(crown, y) * u2, Z];
  };
}

// ---------- building ----------
// smooth normals across edges flatter than `crease` degrees
function normals(P, crease) {
  const cos = Math.cos(crease * Math.PI / 180), F = [], map = new Map(), key = i => `${Math.round(P[i] * 1e4)},${Math.round(P[i + 1] * 1e4)},${Math.round(P[i + 2] * 1e4)}`;
  for (let i = 0; i < P.length; i += 9) {
    const ux = P[i + 3] - P[i], uy = P[i + 4] - P[i + 1], uz = P[i + 5] - P[i + 2], vx = P[i + 6] - P[i], vy = P[i + 7] - P[i + 1], vz = P[i + 8] - P[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    const f = F.length; F.push([nx, ny, nz, l]);
    for (let k = 0; k < 3; k++) { const kk = key(i + k * 3); if (!map.has(kk)) map.set(kk, []); map.get(kk).push(f); }
  }
  const N = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) {
    const f = F[(i / 9) | 0]; let ax = 0, ay = 0, az = 0;
    for (const g of map.get(key(i))) { const G = F[g]; if ((G[0] * f[0] + G[1] * f[1] + G[2] * f[2]) / (G[3] * f[3]) >= cos) { ax += G[0]; ay += G[1]; az += G[2]; } }
    const l = Math.hypot(ax, ay, az) || 1; N[i] = ax / l; N[i + 1] = ay / l; N[i + 2] = az / l;
  }
  return N;
}

export class Car {
  constructor(warp) { this.warp = warp; this.gb = { body: new GB(), glass: new GB(), lamp: new GB() }; this.axles = []; }
  // add triangles in car space (bent by the warp unless warp: false); to: 'body', 'glass' or 'lamp'
  add(tris, color, { to = 'body', warp = true, crease = 38 } = {}) {
    const P = new Float32Array(tris.length * 3); 
    tris.forEach((p, i) => { const q = warp ? this.warp(p) : p; P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2]; });
    const N = normals(P, crease), c = new THREE.Color(color), gb = this.gb[to];
    for (let i = 0; i < P.length; i += 3) gb.v(P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], c, 0.001, 0.001);
    return this;
  }
  // a plain box (no warp), for the cabin and other parts that don't sit on the panels
  box(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0, to = 'body') { addGeo(this.gb[to], UNIT, x, y, z, w, h, d, rx, ry, rz, color); return this; }
  // a wheel on the axle at (x, y, z): tyre, rim and spokes; spokes(gb, side) draws the face of the rim. Each side's wheel
  // is drawn once, around its own axle, and every car spins its own copies of it (see vehicles/wheels.js)
  wheel(x, y, z, { r = 0.35, width = 0.25, rim = 0.24, tyre = '#17161a', rimCol = '#a4a8ae', dish = '#2a2c31', spokes }) {
    const s = Math.sign(x) || 1, key = s < 0 ? 'wheelR' : 'wheelL';
    this.axles.push({ key, x, y, z, r });
    if (this.gb[key]) return this;
    const g = this.gb[key] = new GB();
    addGeo(g, tyreGeo(r, width, rim), 0, 0, 0, 1, 1, 1, 0, 0, -Math.PI / 2, tyre);
    addGeo(g, cylG(16), -s * 0.01, 0, 0, rim * 2, width * 0.9, rim * 2, 0, 0, Math.PI / 2, dish);
    addGeo(g, cylG(10), s * (width * 0.36), 0, 0, rim * 0.42, 0.04, rim * 0.42, 0, 0, Math.PI / 2, rimCol);
    addGeo(g, torusG(rim), s * (width * 0.4), 0, 0, 1, 1, 1, 0, Math.PI / 2, 0, rimCol);
    if (spokes) spokes((a, r0, r1, w, col = rimCol, t = 0.035, out = 0.4) => {
      const rm = (r0 + r1) / 2; addGeo(g, UNIT, s * width * out, Math.cos(a) * rm, Math.sin(a) * rm, t, r1 - r0, w, a, 0, 0, col);
    }, rim);
    return this;
  }
  build(scale) {
    const out = {};
    for (const [k, gb] of Object.entries(this.gb)) { const g = gb.geometry(); g.scale(scale, scale, scale); g.computeBoundingSphere(); g.userData.shared = true; out[k] = g; }
    out.axles = this.axles.map(a => ({ key: a.key, x: a.x * scale, y: a.y * scale, z: a.z * scale, r: a.r * scale }));
    return out;
  }
}
const GEOS = {};
const torusG = r => GEOS['o' + r] || (GEOS['o' + r] = new THREE.TorusGeometry(r, 0.022, 4, 24).toNonIndexed());
// a rounded tyre around the y axis (turned onto the x axis when placed), its open middle filled by the rim
function tyreGeo(r, w, rim) {
  const k = `t${r}${w}${rim}`; if (GEOS[k]) return GEOS[k];
  const pr = [];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + Math.PI * i / 6; pr.push(new THREE.Vector2(r - 0.05 + Math.cos(a) * 0.05, Math.sin(a) * w / 2)); }
  pr.push(new THREE.Vector2(rim + 0.01, w * 0.42)); pr.unshift(new THREE.Vector2(rim + 0.01, -w * 0.42));
  return (GEOS[k] = new THREE.LatheGeometry(pr.reverse(), 22).toNonIndexed());
}
// a car's meshes from its shared geometry, in the shape the car kind expects
export function carMeshes(geo, seat) {
  const grp = new THREE.Group(), m = new THREE.Mesh(geo.body, charMat), win = new THREE.Mesh(geo.glass, tintMat), lamps = new THREE.Mesh(geo.lamp, lampMat);
  const wheels = (geo.axles || []).map(a => wheelAt(geo[a.key], charMat, a.x, a.y, a.z, a.r));
  grp.add(m, win, lamps, ...wheels);
  const s = new THREE.Group(); s.position.set(...seat); grp.add(s);
  return { grp, m, win, lamps, wheels, seat: s, solid: [m, ...wheels], lit: [win, lamps] };
}
export const triangles = geo => Object.values(geo).filter(g => g.isBufferGeometry).reduce((s, g) => s + g.attributes.position.count / 3, 0);
