// ================= GEOMETRY BUILDER =================
export class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
  v(px, py, pz, nx, ny, nz, c, u, w) { this.p.push(px, py, pz); this.n.push(nx, ny, nz); this.c.push(c.r, c.g, c.b); this.u.push(u, w); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere(); return g;
  }
}
export const UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
export const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1).toNonIndexed();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _nm = new THREE.Matrix3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
function pushGeo(gb, geo, m, color) {
  _nm.getNormalMatrix(m); _c.set(color);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(m); _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize(); gb.v(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, _c, 0.001, 0.001); }
}
export function addGeo(gb, geo, x, y, z, sx, sy, sz, rx, ry, rz, color, order) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, order || 'XYZ')), _s.set(sx, sy, sz)); pushGeo(gb, geo, _m, color);
}
export const box = (gb, w, h, d, x, y, z, col, ry) => addGeo(gb, UNIT, x, y, z, w, h, d, 0, ry || 0, 0, col);
// walls get window UVs in world space; tops/bottoms go to the plain builder
export function wallBox(walls, plain, x, y, z, w, h, d, color) {
  _m.compose(_p.set(x, y, z), _q.identity(), _s.set(w, h, d)); _c.set(color);
  const pos = UNIT.attributes.position, nor = UNIT.attributes.normal;
  for (let i = 0; i < pos.count; i += 3) {
    const ny = nor.getY(i), nx = nor.getX(i), nzv = nor.getZ(i);
    const target = Math.abs(ny) > 0.5 ? plain : walls;
    for (let k = 0; k < 3; k++) {
      _v.fromBufferAttribute(pos, i + k).applyMatrix4(_m);
      let u = 0.001, vv = 0.001;
      if (target === walls) { u = (Math.abs(nx) > 0.5 ? _v.z * Math.sign(nx) : -_v.x * Math.sign(nzv)) / 24; vv = (_v.y - 0.2) / 25.6; }
      target.v(_v.x, _v.y, _v.z, nx, ny, nzv, _c, u, vv);
    }
  }
}
export const GEO = {};
export const geoOnce = (k, f) => GEO[k] || (GEO[k] = f().toNonIndexed());
export const cylG = seg => geoOnce('c' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1));
export const sphG = () => geoOnce('s', () => new THREE.SphereGeometry(0.5, 16, 10));
const _ya = new THREE.Vector3(0, 1, 0), _ta = new THREE.Vector3(), _tb = new THREE.Vector3();
function segGeo(gb, geo, a, b, w, d, col) {
  _ta.set(a[0], a[1], a[2]); _tb.set(b[0], b[1], b[2]).sub(_ta); const L = _tb.length(); _tb.divideScalar(L);
  _m.compose(_p.copy(_ta).addScaledVector(_tb, L / 2), _q.setFromUnitVectors(_ya, _tb), _s.set(w, L, d)); pushGeo(gb, geo, _m, col);
}
export const tube = (gb, a, b, r, col, seg) => segGeo(gb, cylG(seg || 10), a, b, r * 2, r * 2, col);
export const boxAB = (gb, a, b, w, d, col) => segGeo(gb, UNIT, a, b, w, d, col);
export function path(gb, pts, r, col, seg) {
  for (let i = 0; i < pts.length - 1; i++) tube(gb, pts[i], pts[i + 1], r, col, seg);
  for (let i = 1; i < pts.length - 1; i++) addGeo(gb, sphG(), pts[i][0], pts[i][1], pts[i][2], r * 2, r * 2, r * 2, 0, 0, 0, col);
}
// convex 8-corner solid (a deformed box): corners 0-3 form one end, 4-7 the other, in matching order
const HEXF = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
export function hexa(gb, P8, col) {
  _c.set(col); let cx = 0, cy = 0, cz = 0; for (const q of P8) { cx += q[0] / 8; cy += q[1] / 8; cz += q[2] / 8; }
  for (const f of HEXF) for (const [i, j, k] of [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]) {
    const A = P8[i]; let B = P8[j], C = P8[k];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue; nx /= l; ny /= l; nz /= l;
    if (nx * ((A[0] + B[0] + C[0]) / 3 - cx) + ny * ((A[1] + B[1] + C[1]) / 3 - cy) + nz * ((A[2] + B[2] + C[2]) / 3 - cz) < 0) { [B, C] = [C, B]; nx = -nx; ny = -ny; nz = -nz; }
    for (const Q of [A, B, C]) gb.v(Q[0], Q[1], Q[2], nx, ny, nz, _c, 0.001, 0.001);
  }
}
// solid swept along z through rectangular (optionally trapezoid) sections
export function loft(gb, secs, col) {
  const c = s => { const x = s.x || 0, wb = (s.wb || s.w) / 2, wt = (s.wt || s.w) / 2, h = s.h / 2; return [[x - wb, s.y - h, s.z], [x + wb, s.y - h, s.z], [x + wt, s.y + h, s.z], [x - wt, s.y + h, s.z]]; };
  for (let i = 0; i < secs.length - 1; i++) hexa(gb, c(secs[i]).concat(c(secs[i + 1])), col);
}
// mudguard-style strip around a wheel, angles measured from straight up towards the front
export function arc(gb, cx, cy, cz, R, a0, a1, n, w, col) {
  for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i + 0.5) / n, L = R * (a1 - a0) / n * 1.08; addGeo(gb, UNIT, cx, cy + Math.cos(a) * R, cz + Math.sin(a) * R, w, 0.012, L, a, 0, 0, col); }
}
