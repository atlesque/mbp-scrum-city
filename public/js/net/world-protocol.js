// ================= MULTIPLAYER: THE SHARED WORLD, ON THE WIRE =================
// The pure part of net/world.js (no sockets, no meshes), so it can be tested on its own.
//
// One crewmate's game runs the city's traffic, the police chopper, the army tank and the UFO for the whole crew: the
// host. It sends them out a few times a second in a 'world' message, and everyone else draws them where it says (as
// puppets: the same entities, with their brains swapped for the host's word). Shots, rockets, rams and carjackings on a
// puppet go back to the host, which applies them to the real thing.
//
// Who hosts: whoever already does, as long as they're out in a running city; when they aren't (gone, in a background tab,
// on the title screen, in the club), the crewmate in the room longest who is. Everyone works that out for themselves from
// the same facts (each player's state carries `hs` 1 while they could host and `up` seconds in the room), and a clash
// (two hosts at once, for a moment) goes to whoever has been in the room longer.
export const WORLD_EVERY = 0.2; // seconds between the host's world messages
export const WORLD_LAG = 0.3; // puppets are drawn this far in the past, between the two snapshots either side of it
export const WORLD_STALE = 8; // a host silent this long is gone (one that leaves says so; this is for one whose game stopped)
export const JOIN_GRACE = 2; // a player just in the room waits this long to hear from a host before taking over
export const SHARE_R = 180; // the host sends what is within this many metres of a crewmate out in the city

// players: [{ id, up, ok }] including this player; current: the id of the host now, or null. -> the host's id, or null
export function electHost(players, current) {
  const ok = players.filter(p => p.ok);
  if (current && ok.some(p => p.id === current)) return current;
  ok.sort(older);
  return ok.length ? ok[0].id : null;
}
// longest in the room first; the same time in it, the id that sorts first
export const older = (a, b) => (b.up - a.up) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// a world message from `them` while `me` hosts: does this player stand down?
export const yields = (me, them) => older(them, me) < 0;

const r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;
const num = (...a) => a.every(Number.isFinite);

// ---- what goes in a world message ----
// A vehicle (traffic, a parked one the traffic left behind, a chopper on the ground):
//   ['v', key, model id, x, y, z, yaw, speed, steer, flags, driver type or 0, driver look seed]
//   flags: 1 someone at the wheel, 2 they're alive, 4 burning, 8 wrecked, 16 a crash fire
export function packVehicle(v) {
  const a = v.driver, f = (a ? 1 : 0) | (a && a.alive ? 2 : 0) | (v.burnT > 0 ? 4 : 0) | (v.dead ? 8 : 0) | (v.crashFire ? 16 : 0);
  return ['v', v.wk, v.model.id, r2(v.x), r2(v.y || 0), r2(v.z), r3(v.yaw), r2(v.v || 0), r3(v.steer || 0), f, a ? a.type : 0, a ? a.seed ?? 1 : 0];
}
// The police chopper: ['h', key, x, y, z, yaw, flags, rotor spin, light x, light z, aim x, aim y, aim z, hp]
//   flags: 1 falling (shot down), 2 the pilot is dead and it's coming down, 4 searchlight on, 8 minigun going
export function packHeli(h) {
  const t = h.tgt || {}, f = (h.falling ? 1 : 0) | (h.downed ? 2 : 0) | (h.beam && h.beam.visible ? 4 : 0) | (h.burst > 0 ? 8 : 0);
  return ['h', h.wk, r2(h.x), r2(h.y), r2(h.z), r3(h.yaw), f, r2(h.spin ?? 1), r2(h.lx ?? t.x ?? h.x), r2(h.lz ?? t.z ?? h.z), r2(t.x ?? h.x), r2((t.y || 0) + 1), r2(t.z ?? h.z), Math.round(h.hp)];
}
// The army tank: ['t', key, x, z, yaw, turret yaw, gun pitch, speed, flags, shells fired, hp]   flags: 1 wrecked, 2 leaving
export function packTank(t) {
  return ['t', t.wk, r2(t.x), r2(t.z), r3(t.yaw), r3(t.turretYaw), r3(t.pitch || 0), r2(t.v || 0), (t.dead ? 1 : 0) | (t.leaving ? 2 : 0), t.shots || 0, Math.round(t.hp)];
}
// The UFO: ['u', key, x, y, z, flags, beam x, beam z, hp]   flags: 1 falling, 2 the beam is lit
export function packUfo(u) {
  return ['u', u.wk, r2(u.x), r2(u.y), r2(u.z), (u.falling ? 1 : 0) | (u.beamT > 0 ? 2 : 0), r2(u.bx || 0), r2(u.bz || 0), Math.round(u.hp)];
}

// back into { kind, key, s } where s is a state sample() (net/protocol.js) can blend: w 1, x y z yaw, and the rest (speed is
// `sp`: sample() reads a `v` as a player's vehicle)
export function unpackThing(a) {
  if (!Array.isArray(a) || typeof a[1] !== 'string' || a[1].length > 24) return null;
  const k = a[0], key = a[1];
  if (k === 'v' && a.length >= 12 && num(a[3], a[4], a[5], a[6], a[7], a[8], a[9]) && typeof a[2] === 'string') {
    const f = a[9];
    return { kind: 'v', key, model: a[2], s: { w: 1, x: a[3], y: a[4], z: a[5], yaw: a[6], sp: a[7], st: a[8], dr: f & 1, da: (f & 2) >> 1, burn: (f & 4) >> 2, dead: (f & 8) >> 3, crash: (f & 16) >> 4, dt: a[10] ? String(a[10]) : null, seed: Number(a[11]) || 1 } };
  }
  if (k === 'h' && a.length >= 14 && num(a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13])) {
    const f = a[6];
    return { kind: 'h', key, s: { w: 1, x: a[2], y: a[3], z: a[4], yaw: a[5], fall: f & 1, down: (f & 2) >> 1, lit: (f & 4) >> 2, fire: (f & 8) >> 3, spin: a[7], lx: a[8], lz: a[9], tx: a[10], ty: a[11], tz: a[12], hp: a[13] } };
  }
  if (k === 't' && a.length >= 11 && num(a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10])) {
    return { kind: 't', key, s: { w: 1, x: a[2], y: 0, z: a[3], yaw: a[4], ty: a[5], p: a[6], sp: a[7], dead: a[8] & 1, leave: (a[8] & 2) >> 1, shots: a[9], hp: a[10] } };
  }
  if (k === 'u' && a.length >= 9 && num(a[2], a[3], a[4], a[5], a[6], a[7], a[8])) {
    return { kind: 'u', key, s: { w: 1, x: a[2], y: a[3], z: a[4], yaw: 0, fall: a[5] & 1, beam: (a[5] & 2) >> 1, bx: a[6], bz: a[7], hp: a[8] } };
  }
  return null;
}

// Within SHARE_R of one of `spots` ({ x, z }: the crewmates out in the city)?
export const nearAny = (x, z, spots, r = SHARE_R) => spots.some(p => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r);
