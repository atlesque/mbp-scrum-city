// ================= GAME DATA =================
export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', price: 0, dmg: 26, rate: 0.26, mag: 12, spread: 0.012, range: 140, auto: false, pellets: 1, ammoPrice: 0, ammoPack: 0, infinite: true, recoil: 0.014, reload: 1.1, up: 350 },
  { id: 'smg', name: 'Micro SMG', price: 1200, dmg: 15, rate: 0.075, mag: 30, spread: 0.04, range: 110, auto: true, pellets: 1, ammoPrice: 120, ammoPack: 120, recoil: 0.007, reload: 1.4, up: 700, twoHand: true },
  { id: 'shotgun', name: 'Pump Shotgun', price: 2500, dmg: 30, rate: 0.85, mag: 6, spread: 0.06, range: 50, auto: false, pellets: 9, ammoPrice: 200, ammoPack: 24, recoil: 0.06, reload: 2.0, up: 1200, twoHand: true },
  { id: 'rifle', name: 'Assault Rifle', price: 6000, dmg: 36, rate: 0.11, mag: 30, spread: 0.016, range: 180, auto: true, pellets: 1, ammoPrice: 300, ammoPack: 120, recoil: 0.011, reload: 1.8, up: 2500, twoHand: true },
  { id: 'minigun', name: 'Minigun', price: 15000, dmg: 30, rate: 0.045, mag: 250, spread: 0.05, range: 150, auto: true, pellets: 1, ammoPrice: 800, ammoPack: 500, recoil: 0.004, reload: 3.0, up: 6000, twoHand: true, spin: true, upDmg: 0.6, upRate: 0.15 },
  { id: 'rpg', name: 'Rocket Launcher', price: 25000, dmg: 420, rate: 1.1, mag: 1, spread: 0.004, range: 300, auto: false, pellets: 1, ammoPrice: 600, ammoPack: 5, recoil: 0.07, reload: 1.6, up: 8000, rocket: true, twoHand: true, upDmg: 0.5, upBlast: 0.25 },
  // bolt-action with a two-step scope (combat/scope.js): wild from the hip, pin-point through the glass (scopeSpread)
  { id: 'sniper', name: 'Magnum Sniper', price: 9000, dmg: 140, rate: 1.4, mag: 10, spread: 0.05, scopeSpread: 0.0006, range: 300, auto: false, pellets: 1, ammoPrice: 400, ammoPack: 20, recoil: 0.09, reload: 3.0, up: 3000, twoHand: true, scope: true },
];
export const WBY = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
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
  for (const w of WEAPONS) {
    if (!inv.owned[w.id]) continue;
    const need = Math.max(0, wStat(w, inv.lvl[w.id] || 0).mag - (inv.mag[w.id] || 0));
    const take = w.infinite ? need : Math.min(need, inv.ammo[w.id] || 0);
    inv.mag[w.id] = (inv.mag[w.id] || 0) + take;
    if (!w.infinite) inv.ammo[w.id] = (inv.ammo[w.id] || 0) - take;
  }
}
