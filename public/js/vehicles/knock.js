import { clamp } from '../core/util.js';
import { blastLaunch } from '../npcs/fling.js';

// Ramming: a heavier vehicle (a car into a bike) or one closing fast enough (a bike into a bike)
// sends the other flying instead of stopping dead against it. A kind takes part with
//   ram: { mass, hull: [offset, radius], heavierAt, sameAt }   who outweighs whom, its body as two circles
//                                                           along the heading, and the closing speeds that knock
//   knock(v, vx, vz, up)                                    a kind that can be sent flying (bikes)
//   slide(v, dt)                                            a kind that can be shoved along (cars; see below)

// the closing speed of `a` on `b` along the line between them: positive when they are coming together
export function closingSpeed(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
  const avx = Math.sin(a.yaw) * a.v, avz = Math.cos(a.yaw) * a.v;
  const sl = b.kvx || b.kvz, bvx = sl ? b.kvx : Math.sin(b.yaw) * b.v, bvz = sl ? b.kvz : Math.cos(b.yaw) * b.v;
  return { closing: (avx - bvx) * nx + (avz - bvz) * nz, nx, nz };
}

// does `a`'s body touch `b`'s? `pad` widens a's hull so a hit is caught before the push-out stops it
const _o = { x: 0, z: 0 };
export function touching(a, b, pad = 0.15) {
  const [off, r] = a.K.ram.hull, fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  for (const s of [1, -1]) { _o.x = a.x + fx * off * s; _o.z = a.z + fz * off * s; if (b.K.pushOut(b, _o, r + pad)) return true; }
  return false;
}

// how hard `a` rams `b`: { vx, vz, up, closing, keep } (b's new velocity, its upward kick, and the share of
// speed `a` keeps) or null when it is only a bump and the usual push-out should stop `a`
export function knockImpulse(a, b) {
  const A = a.K.ram, B = b.K.ram;
  if (!A || !B || !b.K.knock || A.mass < B.mass) return null; // wrecks too: a burnt-out bike still gets knocked aside
  const { closing, nx, nz } = closingSpeed(a, b);
  // a riderless bike lying in the road gets shoved along like a lighter one, not ridden into like a wall
  if (closing < (A.mass > B.mass || (b.fallen && !b.driver) ? A.heavierAt : A.sameAt)) return null;
  // an elastic share of the closing speed along the line of impact, plus a shove the way `a` is going
  const share = A.mass / (A.mass + B.mass), fwd = Math.abs(a.v) * 0.35 * Math.sign(a.v);
  const push = closing * 2 * share * 0.8;
  return {
    vx: nx * push + Math.sin(a.yaw) * fwd, vz: nz * push + Math.cos(a.yaw) * fwd,
    up: clamp(closing * 0.35 * share, 1.5, 9), closing, keep: 1 - (1 - share) * 0.6,
  };
}

// Shoving: bodies of a similar weight (a car into a car) trade momentum instead of one sending the other flying.
// The one hit slides and spins off with its share and the one hitting keeps the rest. A kind that can be shoved
// has `slide(v, dt)`, which carries it along its sliding velocity (kvx, kvz) and spin (kspin) until the tyres bite.

// how a vehicle is moving: its sliding velocity if it has one, else along its heading
export function velocity(v) {
  if (v.kvx || v.kvz) return { x: v.kvx, z: v.kvz };
  return { x: Math.sin(v.yaw) * v.v, z: Math.cos(v.yaw) * v.v };
}

// where `a`'s body presses on `b`'s: the point of contact and the normal pointing from a into b, or null
export function contact(a, b, pad = 0.15) {
  const [off, r] = a.K.ram.hull, fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  for (const s of [1, -1]) {
    const cx = a.x + fx * off * s, cz = a.z + fz * off * s; _o.x = cx; _o.z = cz;
    if (!b.K.pushOut(b, _o, r + pad)) continue;
    let nx = cx - _o.x, nz = cz - _o.z, d = Math.hypot(nx, nz);
    if (d < 1e-4) { nx = b.x - cx; nz = b.z - cz; d = Math.hypot(nx, nz) || 1; }
    nx /= d; nz /= d;
    return { nx, nz, px: cx + nx * r, pz: cz + nz * r };
  }
  return null;
}

// how hard `a` shoves `b`: { vx, vz, spin } (b's new sliding velocity and spin), { avx, avz } (a's velocity
// after the hit) and the closing speed, or null when b can't be shoved or they are only touching
export function shoveImpulse(a, b, c = contact(a, b)) {
  const A = a.K.ram, B = b.K.ram;
  if (!c || !A || !B || !b.K.slide || A.mass < B.mass) return null;
  const va = velocity(a), vb = velocity(b), closing = (va.x - vb.x) * c.nx + (va.z - vb.z) * c.nz;
  if (closing < 0.8) return null;
  // a slightly springy hit along the normal; the off-centre part of it spins b round its middle
  const j = 1.3 * closing * A.mass * B.mass / (A.mass + B.mass), jx = c.nx * j, jz = c.nz * j;
  const rx = c.px - b.x, rz = c.pz - b.z, spin = clamp((rz * jx - rx * jz) / (B.mass * 6), -2.5, 2.5);
  return { vx: vb.x + jx / B.mass, vz: vb.z + jz / B.mass, spin: (b.kspin || 0) + spin, avx: va.x - jx / A.mass, avz: va.z - jz / A.mass, closing };
}

// Blasts: an explosion throws wrecks (and vehicles already burning) the way it throws bodies (npcs/fling.js),
// a heavier body less far. A vehicle sat on the centre is the one going up, so the blast leaves it be.
// { vx, vz, up, spin } for a vehicle at offset (dx, dz) from a blast of radius R, or null when out of reach.
export function blastThrow(dx, dz, R, mass, rand = Math.random) {
  if (Math.hypot(dx, dz) < 0.5) return null;
  const l = blastLaunch(dx, dz, R, rand); if (!l) return null;
  const k = 1 / Math.sqrt(mass);
  return { vx: l.vx * k, vz: l.vz * k, up: l.vy * k, spin: (rand() < 0.5 ? -1 : 1) * l.spin * k * 0.5 };
}
