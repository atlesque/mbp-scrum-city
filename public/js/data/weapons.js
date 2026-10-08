// ================= GAME DATA =================
// Melee weapons come first (fists, then the street set), the guns after them. A melee weapon never runs out:
//   reach   how far in front of the player a swing lands, in metres (plus the target's own width)
//   arc     half the angle in front of the player a swing covers, in radians
//   knock   how hard a hit shoves someone (m/s); hard hits knock people down, and a kill throws the body
//   anim    the swing (combat/melee.js MELEE_ANIMS): punch, swing, stab, chop, saw
//   hits    how many people one swing can land on
//   blade   cuts rather than bruises; combo: every third punch is a kick; auto: hold to keep cutting
//   oneHit  any blow kills outright, except against a boss (npcs/types.js `boss`)
//   rate is the time between swings, and an upgrade level makes swings harder and quicker like it does for guns
const melee = (w) => ({ melee: true, infinite: true, mag: 0, spread: 0, range: w.reach, auto: false, pellets: 1, ammoPrice: 0, ammoPack: 0, recoil: 0, reload: 0, hits: 1, upRate: 0.06, ...w });
const thrown = (w) => ({ thrown: true, dropOnly: true, price: 0, mag: 0, spread: 0, range: 0, auto: false, pellets: 1, ammoPrice: 0, recoil: 0, reload: 0, up: 0, ...w });
export const WEAPONS = [
  melee({ id: 'fist', name: 'Fists', price: 0, dmg: 9, rate: 0.36, reach: 1.25, arc: 0.7, knock: 2.5, anim: 'punch', combo: true, up: 0, builtin: true }),
  melee({ id: 'knuckles', name: 'Brass Knuckles', price: 250, dmg: 16, rate: 0.36, reach: 1.25, arc: 0.7, knock: 3.2, anim: 'punch', combo: true, up: 150 }),
  melee({ id: 'knife', name: 'Knife', price: 400, dmg: 30, rate: 0.42, reach: 1.35, arc: 0.55, knock: 1, anim: 'stab', blade: true, up: 250 }),
  melee({ id: 'nightstick', name: 'Nightstick', price: 500, dmg: 24, rate: 0.5, reach: 1.7, arc: 0.8, knock: 4.5, anim: 'chop', up: 300 }),
  melee({ id: 'golf', name: 'Golf Club', price: 700, dmg: 30, rate: 0.66, reach: 2.0, arc: 0.9, knock: 6.5, anim: 'swing', twoHand: true, up: 400 }),
  melee({ id: 'bat', name: 'Baseball Bat', price: 800, dmg: 36, rate: 0.7, reach: 1.95, arc: 0.95, knock: 7.5, anim: 'swing', twoHand: true, hits: 2, up: 450 }),
  melee({ id: 'machete', name: 'Machete', price: 1200, dmg: 44, rate: 0.58, reach: 1.8, arc: 0.8, knock: 3, anim: 'chop', blade: true, up: 600 }),
  melee({ id: 'katana', name: 'Katana', price: 2500, dmg: 62, rate: 0.6, reach: 2.2, arc: 1.0, knock: 4, anim: 'swing', blade: true, twoHand: true, hits: 3, up: 1200 }),
  // dropped by firemen (npcs/types.js), never sold; one blow kills anyone short of a boss
  melee({ id: 'fireaxe', name: 'Fire Axe', price: 0, dmg: 52, oneHit: true, rate: 0.75, reach: 1.9, arc: 0.85, knock: 6, anim: 'chop', blade: true, hits: 2, up: 0, dropOnly: true }),
  melee({ id: 'chainsaw', name: 'Chainsaw', price: 4500, dmg: 13, rate: 0.09, reach: 1.8, arc: 0.6, knock: 0.6, anim: 'saw', blade: true, twoHand: true, auto: true, hits: 2, up: 2000, upRate: 0.04 }),
  { id: 'pistol', name: 'Pistol', price: 0, dmg: 26, rate: 0.26, mag: 12, spread: 0.012, range: 140, auto: false, pellets: 1, ammoPrice: 0, ammoPack: 0, infinite: true, recoil: 0.014, reload: 1.1, up: 350 },
  { id: 'smg', name: 'Micro SMG', price: 1200, dmg: 15, rate: 0.075, mag: 30, spread: 0.04, range: 110, auto: true, pellets: 1, ammoPrice: 120, ammoPack: 120, recoil: 0.007, reload: 1.4, up: 700, twoHand: true },
  { id: 'shotgun', name: 'Pump Shotgun', price: 2500, dmg: 30, rate: 0.85, mag: 6, spread: 0.06, range: 50, auto: false, pellets: 9, ammoPrice: 200, ammoPack: 24, recoil: 0.06, reload: 2.0, up: 1200, twoHand: true },
  { id: 'rifle', name: 'Assault Rifle', price: 6000, dmg: 36, rate: 0.11, mag: 30, spread: 0.016, range: 180, auto: true, pellets: 1, ammoPrice: 300, ammoPack: 120, recoil: 0.011, reload: 1.8, up: 2500, twoHand: true },
  { id: 'minigun', name: 'Minigun', price: 15000, dmg: 30, rate: 0.045, mag: 250, spread: 0.05, range: 150, auto: true, pellets: 1, ammoPrice: 800, ammoPack: 500, recoil: 0.004, reload: 3.0, up: 6000, twoHand: true, spin: true, upDmg: 0.6, upRate: 0.15 },
  { id: 'rpg', name: 'Rocket Launcher', price: 25000, dmg: 420, rate: 1.1, mag: 1, spread: 0.004, range: 300, auto: false, pellets: 1, ammoPrice: 600, ammoPack: 5, recoil: 0.07, reload: 1.6, up: 8000, rocket: true, twoHand: true, upDmg: 0.5, upBlast: 0.25 },
  // bolt-action with a two-step scope (combat/scope.js): wild from the hip, pin-point through the glass (scopeSpread)
  { id: 'sniper', name: 'Magnum Sniper', price: 9000, dmg: 140, rate: 1.4, mag: 10, spread: 0.05, scopeSpread: 0.0006, range: 300, auto: false, pellets: 1, ammoPrice: 400, ammoPack: 20, recoil: 0.09, reload: 3.0, up: 3000, twoHand: true, scope: true },
  // Thrown weapons (combat/throwables.js) aren't sold: they come off fallen soldiers and feds. There's no magazine,
  // inv.ammo holds how many are left and ammoPack is how many one pickup gives. Throwing the last one puts it away.
  //   grenade  bounces, then goes off after fuse seconds with a blast of radius blast
  //   molotov  bursts where it lands and leaves a pool of fire of radius fire that burns for burn seconds, dmg per second
  thrown({ id: 'grenade', name: 'Grenade', dmg: 260, rate: 0.9, ammoPack: 3, fuse: 2.4, blast: 7 }),
  thrown({ id: 'molotov', name: 'Molotov', dmg: 30, rate: 0.9, ammoPack: 3, fire: 3.6, burn: 7 }),
  // dropped by the aliens of the secret sixth star (npcs/types.js), never sold: a quick, accurate beam that fires
  // green laser bolts (laser: true) and hums instead of banging. Key 0, after the thrown weapons.
  { id: 'laser', name: 'Laser Rifle', price: 0, dmg: 44, rate: 0.14, mag: 32, spread: 0.006, range: 220, auto: true, pellets: 1, ammoPrice: 0, ammoPack: 64, recoil: 0.004, reload: 1.6, up: 0, twoHand: true, laser: true, dropOnly: true },
];
export const WBY = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
export const MELEE = WEAPONS.filter(w => w.melee), GUNS = WEAPONS.filter(w => !w.melee);
// what each upgrade level adds: +30% damage, +25% magazine and 8% faster fire, unless a weapon sets its own
// upDmg / upMag / upRate; upBlast grows a rocket's blast radius (blastMul scales the base radius)
export const wStat = (w, lvl) => ({
  dmg: w.dmg * (1 + (w.upDmg ?? 0.3) * lvl),
  mag: w.rocket ? 1 + lvl : Math.round(w.mag * (1 + (w.upMag ?? 0.25) * lvl)),
  rate: w.rate * (1 - (w.upRate ?? 0.08) * lvl),
  blastMul: 1 + (w.upBlast ?? 0) * lvl,
});
// top up every owned gun's magazine from its spare ammo (the pistol never runs out)
export function loadAll(inv) {
  for (const w of GUNS) {
    if (!inv.owned[w.id]) continue;
    const need = Math.max(0, wStat(w, inv.lvl[w.id] || 0).mag - (inv.mag[w.id] || 0));
    const take = w.infinite ? need : Math.min(need, inv.ammo[w.id] || 0);
    inv.mag[w.id] = (inv.mag[w.id] || 0) + take;
    if (!w.infinite) inv.ammo[w.id] = (inv.ammo[w.id] || 0) - take;
  }
}

// Weapons the player picked up (street pickups, enemy drops) are marked in inv.found and only lent: getting wasted
// takes them back. Bought weapons stay. Returns the ids taken, for the wasted screen.
export function loseFound(inv) {
  const lost = Object.keys(inv.found || {}).filter(id => inv.found[id] && inv.owned[id] && !WBY[id]?.builtin);
  for (const id of lost) { delete inv.owned[id]; inv.mag[id] = 0; inv.ammo[id] = 0; inv.lvl[id] = 0; }
  inv.found = {};
  return lost;
}
