// Where a bullet lands on a person decides how much it hurts: the head most, the torso as
// much as the gun says, an arm or a leg least.
export const ZONE_DAMAGE = { head: 2.5, torso: 1, limb: 0.6 };

// heights and widths on an unscaled character (characters/character.js): legs end at the hips,
// the arms hang outside the shoulders, the head sits on top
const HIP_Y = 0.88, HEAD_Y = 1.52, SHOULDER_X = 0.27;

// the zone at a point on a standing person, in their own frame: y up from their feet, side out from their spine
export function zoneAt(y, side) {
  if (y >= HEAD_Y) return 'head';
  if (y < HIP_Y || Math.abs(side) > SHOULDER_X) return 'limb';
  return 'torso';
}

// the zone a ray hits on someone standing at (x, z) facing yaw, drawn yo up and at scale s; t is where it met their hit spheres.
// The spheres are rounder than a person, so the zone is read where the ray passes closest to their spine, not where it touched a sphere.
export function zoneOnBody(o, d, t, x, z, yaw, yo = 0, s = 1) {
  const ox = o.x - x, oz = o.z - z, flat = d.x * d.x + d.z * d.z;
  const tc = flat > 0.05 ? Math.max(0, -(ox * d.x + oz * d.z) / flat) : t; // a shot from straight above falls back on the touch point
  const px = ox + d.x * tc, pz = oz + d.z * tc, py = o.y + d.y * tc;
  return zoneAt((py - yo) / s, (px * Math.cos(yaw) - pz * Math.sin(yaw)) / s);
}

// the player can't be traced bullet by bullet, so an NPC's hit lands on a zone at these odds (about as hard as a body shot on average)
const ODDS = [['head', 0.12], ['torso', 0.55], ['limb', 0.33]];
export function rollZone(r = Math.random()) {
  for (const [zone, p] of ODDS) { if (r < p) return zone; r -= p; }
  return 'torso';
}

export const zoneDamage = (dmg, zone) => dmg * (ZONE_DAMAGE[zone] ?? 1);
