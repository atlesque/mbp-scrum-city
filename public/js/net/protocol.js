// ================= MULTIPLAYER: WHAT GOES OVER THE WIRE =================
// The pure part of multiplayer (no sockets, no meshes), so it can be tested on its own. The room on the server
// (github.com/atlesque/mbp-games, src/room.js) only relays: each game is the authority on its own player, sends
// where they are a few times a second, and tells the others about its shots, blasts and kills. Damage is decided
// by the shooter and applied by whoever was hit.
//
// A state message ('s') is short keys to keep it small:
//   w   1 while the player is out in the city (0 on the title screen, paused, or inside the club)
//   x y z yaw     feet and facing      ms  walking speed (m/s, drives the leg swing)   j  height of a jump
//   g   what's in hand (a weapon id)   a   1 while aiming   p  aim pitch   th 1 two-handed   m  melee ready pose
//   al  1 alive, 0 down
//   wl  their wanted level (the crew's)       sn  1 while someone hunting the crew has them in sight
//   v   while riding: { m: model id, x, y, z, yaw, v: speed, st: steer, ay: aim yaw from the vehicle's nose or null,
//       r / l: a chopper's rotor speed and 1 when it's landed, pp: a bike's wheelie angle }
export const NAME_MAX = 16;
export const SEND_EVERY = 0.1, IDLE_EVERY = 1; // seconds between states: moving, and standing still (or away)
export const LAG = 0.12; // others are drawn this far in the past, between the two states either side of it
export const SNAP = 12; // further than this between two states (a respawn, the stairs to a roof) and they jump, not glide

export function cleanName(n) {
  const s = String(n ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return s;
}
// the name the box starts with: a signed-in player's email name (only on their own screen until they join), else a guest number
export function defaultName(email, rnd = Math.random) {
  const local = email && cleanName(String(email).split('@')[0].replace(/[._+-]+/g, ' '));
  if (local) return local.replace(/\b\w/g, c => c.toUpperCase());
  return 'Guest ' + String(Math.floor(rnd() * 9000) + 1000);
}

const r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;
// the state message for the local player (P from core/state.js; inWorld: out in the city right now; aimYaw: aiming from a
// vehicle, the aim's angle from its nose)
export function packState(P, inWorld, aimYaw = null) {
  if (!inWorld) return { t: 's', w: 0 };
  const s = { t: 's', w: 1, x: r2(P.x), y: r2(P.y || 0), z: r2(P.z), yaw: r3(P.yaw), ms: r2(P.moveSpeed || 0), j: r2(P.jumpY || 0),
    g: P.c && P.c.gunId || 'fist', a: P.aiming ? 1 : 0, p: r3(P.aimPitch || 0), th: P.twoHand ? 1 : 0, m: P.melee || 0, al: P.alive ? 1 : 0 };
  const v = P.vehicle;
  if (!v) return s;
  s.v = { m: v.model.id, x: r2(v.x), y: r2(v.y || 0), z: r2(v.z), yaw: r3(v.yaw), v: r2(v.v || 0), st: r3(v.steer || 0), ay: aimYaw == null ? null : r3(aimYaw) };
  if (v.rotor != null) { s.v.r = r2(v.rotor); s.v.l = v.landed ? 1 : 0; } // a chopper's rotor speed, and whether it's down
  if (v.pop) s.v.pp = r3(v.pop); // a bike's wheelie
  return s;
}
// worth sending now? Moving or shooting: every SEND_EVERY; otherwise only every IDLE_EVERY (it keeps the room cheap)
export function due(s, last, sinceLast) {
  if (sinceLast >= IDLE_EVERY) return true;
  if (sinceLast < SEND_EVERY) return false;
  if (!last) return true;
  if (s.w !== last.w || s.al !== last.al || s.g !== last.g || s.a !== last.a || !s.v !== !last.v || s.wl !== last.wl || s.sn !== last.sn) return true;
  const moved = Math.hypot((s.x ?? 0) - (last.x ?? 0), (s.y ?? 0) - (last.y ?? 0), (s.z ?? 0) - (last.z ?? 0)) > 0.02;
  return moved || Math.abs((s.yaw ?? 0) - (last.yaw ?? 0)) > 0.01 || Math.abs((s.p ?? 0) - (last.p ?? 0)) > 0.01 || !!(s.v && (s.v.v || last.v.v));
}

const lerp = (a, b, k) => a + (b - a) * k;
function lerpAngle(a, b, k) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
function mix(a, b, k) {
  const out = { ...b };
  for (const key of ['x', 'y', 'z', 'ms', 'j', 'p']) if (typeof a[key] === 'number' && typeof b[key] === 'number') out[key] = lerp(a[key], b[key], k);
  if (typeof a.yaw === 'number' && typeof b.yaw === 'number') out.yaw = lerpAngle(a.yaw, b.yaw, k);
  if (a.v && b.v && a.v.m === b.v.m) {
    out.v = { ...b.v, x: lerp(a.v.x, b.v.x, k), y: lerp(a.v.y, b.v.y, k), z: lerp(a.v.z, b.v.z, k), yaw: lerpAngle(a.v.yaw, b.v.yaw, k), v: lerp(a.v.v, b.v.v, k), st: lerp(a.v.st, b.v.st, k) };
  }
  return out;
}
// Where someone is at time t, from their states as they arrived ([{ at, s }], oldest first): between the two either side
// of t, or the newest when t is past it. Big jumps aren't smoothed over.
export function sample(buf, t) {
  if (!buf.length) return null;
  if (t <= buf[0].at) return buf[0].s;
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1], b = buf[i];
    if (t >= a.at && t <= b.at) {
      if (!a.s.w || !b.s.w || Math.hypot((b.s.x ?? 0) - (a.s.x ?? 0), (b.s.z ?? 0) - (a.s.z ?? 0)) > SNAP) return b.s;
      return mix(a.s, b.s, (t - a.at) / Math.max(1e-6, b.at - a.at));
    }
  }
  return buf[buf.length - 1].s;
}
// keep what sample() still needs: everything from just before t onwards
export function trim(buf, t) {
  while (buf.length > 2 && buf[1].at < t) buf.shift();
}

// Each other player gets a look of their own, picked from their id (the same on every screen)
const SKIN = ['#f3c9a8', '#e3ad86', '#c98b62', '#93603e', '#5e3b26', '#f6d6bd'];
const HAIR = ['#1d1410', '#4a2e1a', '#d8b26a', '#a33a1e', '#efe6d4', '#2b1a12'];
const SHIRTS = ['#ff7eb6', '#57d9c7', '#ffb347', '#9b7bff', '#ff6b6b', '#4fb3ff', '#ffe066', '#7cf29a'];
const PANTS = ['#f5f0e6', '#2b2b3a', '#5c7fa8', '#c8b08a', '#3a6d8c', '#7a4e8f'];
const STYLES = ['short', 'long', 'mullet', 'bald', 'afro'];
export function lookFor(id) {
  let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pick = list => { const v = list[h % list.length]; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; return v; };
  return { skin: pick(SKIN), shirt: pick(SHIRTS), pa: null, pb: null, pants: pick(PANTS), hair: pick(HAIR), hairStyle: pick(STYLES), glasses: h % 3 === 0, shoes: '#2a2226' };
}

// a shot for the others to see: the muzzle and where each pellet stopped (at most 8, rounded to the cm)
export function packShot(weapon, from, ends) {
  const p = v => [r2(v.x), r2(v.y), r2(v.z)];
  return { t: 'shot', w: weapon, f: p(from), h: ends.slice(0, 8).map(p) };
}

// ---- the people in the city ----
// Each game runs the people it spawned; the ones near another player go out a few times a second (every NPC_EVERY) in
// 'npcs' messages of at most NPC_CHUNK people, and that player's game draws them (net/ghosts.js). One person is
//   [i, type, look seed, x, y, z, yaw, walking speed, flags, gun or 0, aim pitch]
// i numbers them within the sending game; flags: 1 alive, 2 aiming, 4 panicking, 8 two-handed.
export const NPC_EVERY = 0.25, NPC_LAG = 0.35, NPC_SHARE_R = 120, NPC_CHUNK = 24, NPC_STALE = 1.2;
export function packNpc(n) {
  const f = (n.alive ? 1 : 0) | (n.aiming ? 2 : 0) | (n.panic ? 4 : 0) | (n.twoHand ? 8 : 0);
  return [n.nid, n.type, n.seed ?? 1, r2(n.x), r2(n.y || 0), r2(n.z), r3(n.yaw), r2(n.moveSpeed || 0), f, (n.alive && n.c && n.c.gunId) || 0, r3(n.aimPitch || 0)];
}
// back into an id, a type, a seed and a state that sample() can blend
export function unpackNpc(a) {
  if (!Array.isArray(a) || a.length < 11 || ![a[0], a[2], a[3], a[4], a[5], a[6], a[7], a[8]].every(Number.isFinite)) return null;
  const f = a[8];
  return { i: a[0], type: String(a[1]), seed: a[2], s: { w: 1, x: a[3], y: a[4], z: a[5], yaw: a[6], ms: a[7], al: f & 1, a: (f & 2) >> 1, pn: (f & 4) >> 2, th: (f & 8) >> 3, g: a[9] || null, p: Number(a[10]) || 0 } };
}
export function chunks(list, n) { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; }

// ---- the crew's heat ----
// Everyone in the room is one crew with one wanted level. Heat this game adds goes out as 'heat' { v } and is added
// everywhere; a level this game's own rules set (a star fading, the sixth star) goes out as 'wanted' { l, h }. A player
// who respawns, exits to the title or joins takes the crew's level instead of resetting it for everyone.
//   last: { heat, wanted } as last told; now: { heat, wanted }; quiet: this player is down, out on the title screen or
//   just back from there, so their own level isn't the crew's news
// -> the messages to send, if any
export function heatNews(last, now, quiet) {
  const out = [];
  if (quiet) return out;
  if (now.heat > last.heat + 1e-6 && now.wanted >= last.wanted) out.push({ t: 'heat', v: r2(now.heat - last.heat) });
  if (now.wanted !== last.wanted) out.push({ t: 'wanted', l: now.wanted, h: r2(now.heat) });
  return out;
}
