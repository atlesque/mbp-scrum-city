import { seeded } from '../../core/util.js';
import { GB, UNIT, addGeo, hexa } from '../../render/geometry.js';
import { lionTexture } from './vlaanderen-lion.js';

// ================= LANDMARK MODEL KIT =================
// Builds a landmark as a THREE.Group to the same spec as an imported .glb model:
// 1 unit = 1 m, Y up, origin at the centre of the footprint at ground level, the street front facing -z.
// Every part goes into one mesh per material, so a whole building is a handful of draw calls.
// 'lit' holds the windows that glow after dark (its material is emissive); 'glass' is the rest of the glazing.
// 'logo' is textured with the Vlaanderen lion (see decal()).
export const MATERIALS = ['wall', 'trim', 'glass', 'lit', 'dark', 'green', 'logo'];

// the four faces of a footprint rect, in local metres: start corner, unit direction along the face, outward normal
const FACES = {
  front: R => ({ o: [R[0], R[2]], d: [1, 0], n: [0, -1], len: R[1] - R[0] }),
  back: R => ({ o: [R[1], R[3]], d: [-1, 0], n: [0, 1], len: R[1] - R[0] }),
  left: R => ({ o: [R[0], R[3]], d: [0, -1], n: [-1, 0], len: R[3] - R[2] }),
  right: R => ({ o: [R[1], R[2]], d: [0, 1], n: [1, 0], len: R[3] - R[2] }),
};
export const ALL_FACES = ['front', 'back', 'left', 'right'];

export class Kit {
  constructor(seed) { this.gb = {}; this.rand = seeded(seed); this.colliders = []; for (const m of MATERIALS) this.gb[m] = new GB(); }
  // a solid volume for collision, [x0, x1, z0, z1] from the ground up to `top`
  solid(R, top) { this.colliders.push([R[0], R[1], R[2], R[3], top]); }
  // an axis-aligned box from its extents
  box(mat, x0, x1, y0, y1, z0, z1, col) {
    addGeo(this.gb[mat], UNIT, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0, 0, 0, col);
  }
  // a box rotated about y (for fins and slanted parts), given its centre and size
  rbox(mat, x, y, z, w, h, d, ry, col) { addGeo(this.gb[mat], UNIT, x, y, z, w, h, d, 0, ry, 0, col); }
  // a thin bar lying flat on a face, tilted `ang` radians within the face plane (lettering, logos, braces)
  stroke(mat, F, t, y, len, thick, ang, out, col, depth = 0.08) {
    const [ox, oz] = F.o, [dx, dz] = F.d, [nx, nz] = F.n, o = out + depth / 2;
    addGeo(this.gb[mat], UNIT, ox + dx * t + nx * o, y, oz + dz * t + nz * o, len, thick, depth, 0, -Math.atan2(dz, dx), ang, col, 'YXZ');
  }
  // any convex 8-corner solid (ramps, sloped roofs)
  hexa(mat, P8, col) { hexa(this.gb[mat], P8, col); }
  // a flat vertical panel on a face: `t` along the face from its start corner, y from y0 to y1, `out` metres proud of it
  pane(mat, F, t0, t1, y0, y1, out, col) {
    const g = this.gb[mat], c = new THREE.Color(col), [ox, oz] = F.o, [dx, dz] = F.d, [nx, nz] = F.n;
    const P = t => [ox + dx * t + nx * out, oz + dz * t + nz * out];
    const [ax, az] = P(t0), [bx, bz] = P(t1);
    // wind the two triangles so they face outwards
    for (const [x, y, z] of [[ax, y0, az], [bx, y1, bz], [bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz]]) g.v(x, y, z, nx, 0, nz, c, 0.001, 0.001);
  }
  // a textured panel on a face (the whole texture stretched over it), right way round when seen from outside
  decal(mat, F, t0, t1, y0, y1, out) {
    const g = this.gb[mat], c = new THREE.Color('#ffffff'), [ox, oz] = F.o, [dx, dz] = F.d, [nx, nz] = F.n;
    const P = t => [ox + dx * t + nx * out, oz + dz * t + nz * out];
    const [ax, az] = P(t0), [bx, bz] = P(t1);
    // t runs right to left as seen from outside, so t0 is the texture's right edge
    for (const [x, y, z, u, v] of [[ax, y0, az, 1, 0], [bx, y1, bz, 0, 1], [bx, y0, bz, 0, 0], [ax, y0, az, 1, 0], [ax, y1, az, 1, 1], [bx, y1, bz, 0, 1]]) g.v(x, y, z, nx, 0, nz, c, u, v);
  }
  // a strip of boxes on a face (piers, fins, mullions, bands): `t` along, y range, width, depth proud of the wall
  strip(mat, F, t, w, y0, y1, depth, col, off = 0) {
    const [ox, oz] = F.o, [dx, dz] = F.d, [nx, nz] = F.n, cx = ox + dx * t + nx * (off + depth / 2), cz = oz + dz * t + nz * (off + depth / 2);
    const sx = Math.abs(dx) * w + Math.abs(nx) * depth, sz = Math.abs(dz) * w + Math.abs(nz) * depth;
    this.box(mat, cx - sx / 2, cx + sx / 2, y0, y1, cz - sz / 2, cz + sz / 2, col);
  }
  face(R, side) { return FACES[side](R); }
  // a grid of window cells over the chosen faces of a footprint rect.
  // opts: faces, y0 (first floor's base), floors, fh (floor height), bay (cell width), margin (blank wall at each end),
  // hidden: volumes [x0, x1, z0, z1, top] that cover parts of these faces (no panes there),
  // cell(F, side, col, floor, cells) returns false to skip a cell or a { t0, t1, y0, y1 } override,
  // win: [width, height, sill] of the glazing inside each cell, litOdds: share of panes that glow at night.
  grid(R, o) {
    const out = [];
    for (const side of o.faces || ALL_FACES) {
      const F = FACES[side](R), usable = F.len - 2 * (o.margin ?? 0.6), cells = Math.max(1, Math.floor(usable / o.bay)), bay = usable / cells, start = (F.len - usable) / 2;
      for (let f = 0; f < o.floors; f++) for (let c = 0; c < cells; c++) {
        const t = start + bay * (c + 0.5), y = o.y0 + f * o.fh;
        if (o.hidden && hiddenBy(o.hidden, F, t, y + o.fh / 2)) continue;
        const pick = o.cell ? o.cell(F, side, c, f, cells) : null; if (pick === false) continue;
        const [ww, wh, sill] = o.win, cell = pick || { t0: t - ww / 2, t1: t + ww / 2, y0: y + sill, y1: y + sill + wh };
        const lit = this.rand() < (o.litOdds ?? 0.35);
        this.pane(lit ? 'lit' : 'glass', F, cell.t0, cell.t1, cell.y0, cell.y1, o.out ?? 0.03, glassTone(this.rand, o.glass || '#9fb4c8'));
        out.push({ F, side, t, y, c, f, cells, bay });
      }
    }
    return out;
  }
  group(name, mats) {
    const g = new THREE.Group(); g.name = name;
    for (const m of MATERIALS) {
      const gb = this.gb[m]; if (!gb.p.length) continue;
      const mesh = new THREE.Mesh(gb.geometry(), mats[m]); mesh.name = `${name}-${m}`; g.add(mesh);
    }
    return g;
  }
}
// is a point just outside a face inside one of the given volumes ([x0, x1, z0, z1, top])? then it can't be seen
export function hiddenBy(vols, F, t, y) {
  const x = F.o[0] + F.d[0] * t + F.n[0] * 0.3, z = F.o[1] + F.d[1] * t + F.n[1] * 0.3;
  return vols.some(V => x > V[0] && x < V[1] && z > V[2] && z < V[3] && y < V[4]);
}
// glass panes vary a little in tone, so a facade reads as reflections rather than one flat colour
function glassTone(rand, base) { const c = new THREE.Color(base), k = 0.86 + rand() * 0.24; return c.multiplyScalar(k); }

// the materials a landmark group draws with (the same names a .glb export would carry)
export function landmarkMaterials() {
  const lambert = o => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
  const m = {
    wall: lambert(), trim: lambert(), dark: lambert(), green: lambert(),
    glass: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x667788 }),
    lit: lambert({ emissive: 0xffd9a0, emissiveIntensity: 0 }),
    logo: lambert({ map: lionTexture(), transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  for (const [k, v] of Object.entries(m)) v.name = k;
  return m;
}
// how many triangles a group draws
export const triangles = g => { let n = 0; g.traverse(o => { if (o.isMesh) n += o.geometry.attributes.position.count / 3; }); return n; };
