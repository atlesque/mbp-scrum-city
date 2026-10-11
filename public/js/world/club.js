import { box } from '../render/geometry.js';
import { collideRoofs } from './rooftops.js';

// ================= THE VELVET FLAMINGO =================
// A cabaret club on an ordinary Ocean Drive block: a neon sign, a lit door and a strip of red carpet out front.
// E at the door goes inside, which is a room of its own (game/club.js draws it in a scene of its own, far from
// the city): a stage with three poles and dancers, a bar, booths along the wall, tables, a bouncer at the door.
// This file only lays things out, so the tests can check the room without a browser.
export const CLUB_NAME = 'Velvet Flamingo';
export const CLUB_CLOSED_AT = 4; // like the gun shops: the bouncer turns you away at this many stars
// where the room stands: well clear of the city, so nothing out there is ever near it
export const CLUB_AT = { x: 1000, z: 1000 };
const FACES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
// the club's building and door in the city, set by buildClub
export const CLUB = { site: null };

// The building it moves into: a deco one (the Ocean Drive look, a parapet on the roof) without a roof door, broad
// enough for the sign, as close to `near` (the spawn) as there is. Picked after the city is built, without the
// seeded random, like the roofs, so nothing else moves.
export function pickClubSite(spots, roofs, near) {
  const free = spots.filter(b => !roofs.some(r => r.x0 === b.x0 && r.z0 === b.z0 && r.x1 === b.x1) && b.x1 - b.x0 >= 10 && b.z1 - b.z0 >= 10);
  const deco = free.filter(b => b.parapet && b.h <= 20), list = deco.length ? deco : free;
  if (!list.length) return null;
  const d = b => Math.hypot((b.x0 + b.x1) / 2 - near.x, (b.z0 + b.z1) / 2 - near.z);
  return clubSite(list.reduce((a, b) => d(b) < d(a) ? b : a));
}
// the door in the middle of the street face, and where the player stands to use it (and comes back out)
export function clubSite(b) {
  const fn = FACES[b.face], cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
  const half = (fn[0] ? w : d) / 2, at = k => ({ x: cx + fn[0] * k, z: cz + fn[1] * k });
  return { ...b, fn, cx, cz, fw: fn[0] ? d : w, yaw: Math.atan2(fn[0], fn[1]), door: at(half), street: at(half + 1.3) };
}
// does this sign hang on the club's street face? (the building's own sign comes down to make room)
export const onClubFace = (s, site) => Math.abs((s.x - site.door.x) * site.fn[0] + (s.z - site.door.z) * site.fn[1]) < 1.5
  && Math.abs((s.x - site.door.x) * site.fn[1] - (s.z - site.door.z) * site.fn[0]) < site.fw / 2 + 0.5;

// The front: the door (a dark frame round a hot pink panel), a red carpet with brass posts and a velvet rope either
// side, the club's name in pink neon over the awning and "Showgirls" in smaller letters under it.
export function buildClubFront({ plain, neon, sign }, s) {
  const { fn, door } = s, along = (w, t) => [fn[0] ? t : w, fn[0] ? w : t], out = (k, u = 0) => [door.x + fn[0] * k + fn[1] * u, door.z + fn[1] * k - fn[0] * u];
  let [w, d] = along(2.2, 0.12), [x, z] = out(0.06); box(plain, w, 2.6, d, x, 1.3, z, '#1a1020');
  [w, d] = along(1.7, 0.08); [x, z] = out(0.13); box(neon, w, 2.25, d, x, 1.16, z, '#ff3fa4');
  [w, d] = along(1.9, 0.1); [x, z] = out(0.16); box(neon, w, 0.1, d, x, 2.55, z, '#ffd23e');
  [w, d] = along(2.4, 3.2); [x, z] = out(1.7); box(plain, w, 0.04, d, x, 0.2, z, '#a3122e'); // the carpet
  for (const u of [-1.6, 1.6]) {
    for (const k of [0.6, 2.9]) { [x, z] = out(k, u); box(plain, 0.1, 0.95, 0.1, x, 0.65, z, '#e2b54a'); box(plain, 0.18, 0.08, 0.18, x, 0.2, z, '#e2b54a'); }
    [w, d] = along(0.07, 2.3); [x, z] = out(1.75, u); box(plain, w, 0.07, d, x, 0.95, z, '#7a0f3a');
  }
  const ry = s.yaw, f = '"Yellowtail", cursive';
  [x, z] = out(0.6); sign({ text: CLUB_NAME, x, y: 5.0, z, ry, w: Math.min(s.fw * 0.75, 8), color: '#ff4fd8', font: f });
  [x, z] = out(0.62); sign({ text: 'Showgirls · Cocktails', x, y: 3.85, z, ry, w: Math.min(s.fw * 0.65, 7), color: '#7ff3ff', font: '"Bowlby One", Impact, sans-serif' });
}

// Pick the building, take its own sign down and put the club's front on it (city.js, after the roofs).
export function buildClub(gbs, spots, roofs, signs, near) {
  const site = CLUB.site = pickClubSite(spots, roofs, near); if (!site) return null;
  for (let k = signs.length - 1; k >= 0; k--) if (onClubFace(signs[k], site)) signs.splice(k, 1);
  buildClubFront(gbs, site);
  return site;
}

// ---- inside ----
// The room in its own metres (x across, z from the stage at -z to the door at +z), then moved to CLUB_AT.
export const ROOM = { x0: -12, x1: 12, z0: -10, z1: 10, h: 4.6 };
export const STAGE = { x0: -7, x1: 7, z0: -10, z1: -6, h: 0.55 }; // the stage, with the runway out to its last pole
export const RUNWAY = { x0: -1.1, x1: 1.1, z0: -6, z1: -1.4 };
export const TIP = { x0: -1.8, x1: 1.8, z0: -2.9, z1: -0.4 };
export const POLES = [{ x: -4, z: -7.9 }, { x: 4, z: -7.9 }, { x: 0, z: -1.65 }];
export const BAR = { x0: 8.4, x1: 9.3, z0: -4, z1: 6, h: 1.12 }; // the counter; the bartender works behind it
export const BOOTHS = [-4.5, 0.5, 5.5].map(z => ({ x0: -12, x1: -9.9, z0: z - 1.7, z1: z + 1.7, z, table: { x: -9.2, z } }));
export const TABLES = [[-4.6, 1.6], [4.4, 1.6], [-6.4, 5.4], [-2, 4.6], [2.6, 5.2]].map(([x, z]) => ({ x, z }));
// chairs by the runway (facing in) and at the tables (facing the stage): where people sit and which way they face
export const SEATS = [
  ...[-5, -3.6].flatMap(z => [{ x: -2.1, z, yaw: Math.PI / 2 }, { x: 2.1, z, yaw: -Math.PI / 2 }]),
  ...TABLES.map(t => ({ x: t.x, z: t.z + 0.85, yaw: Math.PI })),
  ...[-2.5, -0.2, 2.2, 4.4].map(z => ({ x: 7.75, z, yaw: Math.PI / 2, stool: true })),
];
export const DOOR = { x: 0, z: ROOM.z1 }; // the way back out, in the middle of the front wall
export const ARRIVE = { x: 0, z: ROOM.z1 - 1.4, yaw: Math.PI }; // just in, facing the stage
export const STAGE_TIP = { x: 0, z: 0.65, price: 20, cooldown: 3 };
export const DJ = { x: -8.6, z: -7.4, front: { x: -8.6, z: -5.8 }, price: 25, cooldown: 5 };
export const CLUB_TRACKS = [
  { name: 'Neon House', sound: 'club-house' },
  { name: 'Midnight Disco', sound: 'club-disco' },
  { name: 'Havana After Dark', sound: 'club-salsa' },
];
export const BOUNCER = { x: -1.9, z: ROOM.z1 - 1.1 };

// Everything the player bumps into, in world metres ({ x0, x1, z0, z1, y0, y1 }, like the blocks on a roof):
// `blocks` stop the feet (the stage and the bar's side are walled off right up to the ceiling, so the dancers and
// the bartender keep their space), `camRoof.blocks` stop the follow camera (the walls, the ceiling and the bar; game/camera.js cameraRoof).
// The ceiling is a block too, so a jump (or the jetpack) stops under it.
export function clubLayout(at = CLUB_AT) {
  const B = (x0, x1, z0, z1, y0, y1) => ({ x0: x0 + at.x, x1: x1 + at.x, z0: z0 + at.z, z1: z1 + at.z, y0, y1 });
  const { x0, x1, z0, z1, h } = ROOM, t = 1;
  const walls = [B(x0 - t, x1 + t, z0 - t, z0, 0, h + 1), B(x0 - t, x1 + t, z1, z1 + t, 0, h + 1), B(x0 - t, x0, z0, z1, 0, h + 1), B(x1, x1 + t, z0, z1, 0, h + 1)];
  const ceiling = B(x0, x1, z0, z1, h, h + 0.6);
  const stage = [STAGE, RUNWAY, TIP].map(s => B(s.x0, s.x1, s.z0, s.z1, 0, h));
  const dj = B(DJ.x - 1.0, DJ.x + 1.0, DJ.z - 0.55, DJ.z + 0.55, 0, 1.1);
  const bar = B(BAR.x0, x1, BAR.z0, BAR.z1, 0, h);
  const booths = BOOTHS.flatMap(b => [B(b.x0, b.x1, b.z0, b.z1, 0, 0.95), B(b.table.x - 0.45, b.table.x + 0.45, b.z - 0.7, b.z + 0.7, 0, 0.78)]);
  const tables = TABLES.map(c => B(c.x - 0.45, c.x + 0.45, c.z - 0.45, c.z + 0.45, 0, 0.78));
  const seats = SEATS.map(s => B(s.x - 0.25, s.x + 0.25, s.z - 0.25, s.z + 0.25, 0, s.stool ? 0.8 : 0.5));
  const area = B(x0, x1, z0, z1, 0, h);
  return {
    area, floor: 0, rails: [], walls, camRoof: { blocks: [...walls, ceiling, dj, B(BAR.x0, BAR.x1, BAR.z0, BAR.z1, 0, BAR.h)] },
    blocks: [...walls, ceiling, ...stage, bar, dj, ...booths, ...tables, ...seats],
    door: { x: DOOR.x + at.x, z: DOOR.z + at.z }, arrive: { x: ARRIVE.x + at.x, z: ARRIVE.z + at.z, yaw: ARRIVE.yaw },
    // where the player orders at the bar: anywhere along the front of the counter
    barFront: { x: BAR.x0 - 0.7 + at.x, z0: BAR.z0 + at.z, z1: BAR.z1 + at.z },
  };
}
// The Pink Room, for a private dance: a curtained doorway in the front wall, west of the exit, with a host beside it
// who takes the money. Behind it, a small room of its own (in the club's scene, well away from the main floor): a
// round platform with one pole, one dancer, and a velvet armchair facing it, where the player sits for the dance.
export const PRIVATE = { price: 150, curtain: { x: -7.5, z: ROOM.z1 }, host: { x: -6.1, z: ROOM.z1 - 0.8 }, back: { x: -7.5, z: ROOM.z1 - 1.3, yaw: Math.PI } };
export const VIP = { x0: -3.5, x1: 3.5, z0: -3.5, z1: 6, h: 3.4, at: { x: 0, z: 40 }, pole: { x: 0, z: -1.2 }, stage: { x0: -1.1, x1: 1.1, z0: -2.3, z1: -0.1, h: 0.25 }, seat: { x: -0.7, z: 2.4, top: 0.48 } };
VIP.seat.yaw = Math.atan2(VIP.pole.x - VIP.seat.x, VIP.pole.z - VIP.seat.z); // a little to one side, so the camera over the shoulder sees past the player
export function privateLayout(at = CLUB_AT) {
  const o = { x: at.x + VIP.at.x, z: at.z + VIP.at.z };
  const B = (x0, x1, z0, z1, y0, y1) => ({ x0: x0 + o.x, x1: x1 + o.x, z0: z0 + o.z, z1: z1 + o.z, y0, y1 });
  const { x0, x1, z0, z1, h } = VIP, t = 1, S = VIP.stage;
  const walls = [B(x0 - t, x1 + t, z0 - t, z0, 0, h + 1), B(x0 - t, x1 + t, z1, z1 + t, 0, h + 1), B(x0 - t, x0, z0, z1, 0, h + 1), B(x1, x1 + t, z0, z1, 0, h + 1)];
  const ceiling = B(x0, x1, z0, z1, h, h + 0.6);
  return {
    private: true, area: B(x0, x1, z0, z1, 0, h), floor: 0, rails: [], walls, camRoof: { blocks: [...walls, ceiling] },
    blocks: [...walls, ceiling, B(S.x0, S.x1, S.z0, S.z1, 0, h)],
    seat: { x: o.x + VIP.seat.x, z: o.z + VIP.seat.z, yaw: VIP.seat.yaw, top: VIP.seat.top },
  };
}

// keep a circle with its feet at height y out of everything in the room (layout from clubLayout), and inside its walls
export function collideClub(o, r, y, layout) {
  const hit = collideRoofs(o, r, y, [layout]), A = layout.area, ox = o.x, oz = o.z;
  o.x = Math.min(Math.max(o.x, A.x0 + r), A.x1 - r); o.z = Math.min(Math.max(o.z, A.z0 + r), A.z1 - r);
  return hit || ox !== o.x || oz !== o.z;
}

// One pass of a pole routine, u from 0 to 1 over ROUTINE seconds: walk round the pole holding on, a spin with the feet
// off the stage, a climb, a slow turning slide back down, a lean back with both hands on it. Returns where the
// dancer is round the pole (a, radians), how far out (r), how high the body is lifted (lift) and which move it is.
export const ROUTINE = 16;
export const MOVES = [['walk', 0.3], ['spin', 0.15], ['climb', 0.15], ['slide', 0.2], ['lean', 0.2]];
export function routineAt(u) {
  u = ((u % 1) + 1) % 1;
  let s = 0;
  for (const [move, len] of MOVES) {
    if (u < s + len || move === 'lean') {
      const k = Math.min(1, (u - s) / len);
      const r = (a, b) => a + (b - a) * k; // every move starts where the last one left off
      if (move === 'walk') return { move, k, a: k * Math.PI * 2.5, r: 0.6, lift: 0 };
      if (move === 'spin') return { move, k, a: Math.PI * (2.5 + 3 * k), r: r(0.6, 0.5), lift: Math.sin(k * Math.PI / 2) * 0.45 };
      if (move === 'climb') return { move, k, a: Math.PI * 5.5, r: r(0.5, 0.32), lift: r(0.45, 1.2) };
      if (move === 'slide') return { move, k, a: Math.PI * (5.5 + 0.5 * k), r: 0.32, lift: 1.2 * (1 - k) * (1 - k * 0.3) };
      return { move, k, a: Math.PI * 6, r: r(0.32, 0.6), lift: 0 };
    }
    s += len;
  }
}
