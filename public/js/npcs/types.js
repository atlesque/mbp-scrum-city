import { pick } from '../core/util.js';
import { HAIR, SKIN, randomLook } from '../characters/character.js';

// Every kind of person in the city. To add one, add an entry here; spawn it with spawnNpc(id, x, z).
//   behaviour  an entry in BEHAVIOURS (npcs/behaviours.js): wander, hunt, ride
//   faction    'civilian' people panic at gunfire and count as witnesses; 'law' hunt the player while wanted
//   look       a function returning a character look, or an object laid over a plain uniformed look
//   cash       what the body drops when the player takes them down: a number or a [min, max] range
//   drops      extra pickups the body may leave, as { type: chance }; types are DROP_TYPES in game/pickups.js (armor, ammo)
//   weaponDrops  weapons the body may leave, as { weapon id: chance }; picking one up lends it until the player is wasted
//   leaveDrops   weapons a driver may leave behind when dragged out of or scared off their vehicle, as { weapon id: chance }
//   heat       wanted heat added when the player takes them down
//   radar      blip colour, or 'siren' for flashing red and blue; omit to stay off the radar
//   despawn    distance from the player at which they are cleared away
//   boss       too tough to go down to one blow from a weapon that kills outright (the fire axe)
//   leaveBelow  walk off once the wanted level drops under this many stars (the aliens only stay for the sixth)
//   fightBack  chance that someone the player punches (and doesn't knock down) squares up and punches back, for punch damage
// Armed types also set gun, dmg, rate (seconds between bursts), burst, gap (seconds within a burst),
// acc (hit chance), range and speed. rocket: true fires slow rockets instead (dmg is the blast's), and
// minRange keeps them far enough out not to be caught in their own blast.
export const NPC_TYPES = {
  civilian: { name: 'Civilian', faction: 'civilian', behaviour: 'wander', hp: 40, walkSpeed: 1.4, runSpeed: 6.3, look: randomLook, cash: [30, 120], heat: 3, screams: true, despawn: 115, fightBack: 0.3, punch: 5 },
  // car drivers now and then carry a repair tool (game/repair.js), dropped when taken down or left behind when pulled out
  motorist: { name: 'Driver', faction: 'civilian', behaviour: 'ride', hp: 40, walkSpeed: 1.4, runSpeed: 6.3, look: randomLook, cash: [40, 140], heat: 3, screams: true, despawn: 115,
    weaponDrops: { repair: 0.15 }, leaveDrops: { repair: 0.1 } },
  biker: { name: 'Biker', faction: 'civilian', behaviour: 'ride', hp: 50, walkSpeed: 1.4, runSpeed: 6.3, look: bikerLook, cash: [30, 120], heat: 3, screams: true, despawn: 115 },
  // on an e-step (vehicles/kinds/step.js): commuters in everyday clothes, now and then a helmet
  stepper: { name: 'Stepper', faction: 'civilian', behaviour: 'ride', hp: 40, walkSpeed: 1.4, runSpeed: 6.3, look: stepperLook, cash: [20, 100], heat: 3, screams: true, despawn: 115 },
  // the guy on the pimped e-step (models/pimpstep.js): big afro, trimmed beard, shades, a purple tracksuit to match the
  // step, a gold chain and clean white sneakers. There's only ever one of him about, and he carries a fat roll.
  stepking: { name: 'Step king', faction: 'civilian', behaviour: 'ride', hp: 55, walkSpeed: 1.5, runSpeed: 6.6, cash: [250, 600], heat: 3, screams: true, despawn: 140,
    look: () => ({ skin: '#94644a', hair: '#17110d', hairStyle: 'bigafro', beard: true, glasses: true, shirt: '#5a16a8', sleeve: '#5a16a8', longSleeve: true,
      pants: '#151419', shorts: false, chain: '#e8b83a', shoes: '#f4f2f0' }) },
  // off the fire truck (vehicles/firetruck.js) to put out crash fires; each carries a fire axe and drops it when taken down
  fireman: { name: 'Fireman', faction: 'civilian', behaviour: 'douse', hp: 90, walkSpeed: 1.8, runSpeed: 5.6, cash: [20, 90], heat: 4, weaponDrops: { fireaxe: 1 }, screams: true, despawn: 160,
    look: () => uniform({ shirt: '#b8995a', pants: '#b8995a', stripes: '#e8ff5a', hat: 'fire', hatColor: '#c8141e', longSleeve: true, gloves: '#2a241c', shoes: '#141316', shorts: false, glasses: false }) },
  cop: { name: 'Police', faction: 'law', behaviour: 'hunt', hp: 70, speed: 4.8, gun: 'pistol', dmg: 7, rate: 1.2, burst: 1, gap: 0.2, acc: 0.38, range: 34, cash: 150, drops: { armor: 0.35, ammo: 0.6 }, weaponDrops: { nightstick: 0.2 }, heat: 5, radar: 'siren', despawn: 130,
    look: () => uniform({ shirt: '#8ab8ec', pants: '#1d2a4a', hat: 'cap', hatColor: '#1d2a4a', badge: true, shorts: false, hairStyle: 'short', glasses: Math.random() < 0.5 }) },
  swat: { name: 'SWAT', faction: 'law', behaviour: 'hunt', hp: 170, speed: 5.0, gun: 'smg', dmg: 4, rate: 1.7, burst: 4, gap: 0.1, acc: 0.32, range: 30, cash: 300, drops: { armor: 0.5, ammo: 0.75 }, heat: 6, radar: '#ff3b4e', despawn: 130,
    look: { shirt: '#22242c', pants: '#1b1c22', hat: 'helmet', hatColor: '#121318', vest: '#30333e', glasses: true, longSleeve: true, gloves: '#111' } },
  fbi: { name: 'Federal agent', faction: 'law', behaviour: 'hunt', hp: 230, speed: 5.4, gun: 'rifle', dmg: 6, rate: 1.6, burst: 3, gap: 0.12, acc: 0.34, range: 40, cash: 500, drops: { armor: 0.6, ammo: 0.85 }, weaponDrops: { molotov: 0.35 }, heat: 7, radar: '#ff3b4e', despawn: 130,
    look: { shirt: '#17171c', pants: '#17171c', glasses: true, tie: true, longSleeve: true, hairStyle: 'short' } },
  army: { name: 'Soldier', faction: 'law', behaviour: 'hunt', hp: 330, speed: 4.8, gun: 'rifle', dmg: 6, rate: 1.5, burst: 3, gap: 0.11, acc: 0.36, range: 46, cash: 750, drops: { armor: 0.75, ammo: 0.9 }, weaponDrops: { grenade: 0.4 }, heat: 8, radar: '#ff3b4e', despawn: 130,
    look: { shirt: '#5d6b3c', pants: '#4c5732', hat: 'helmet', hatColor: '#4a5530', vest: '#3e4728', longSleeve: true, shoes: '#2a2418' } },
  jugg: { name: 'Juggernaut', faction: 'law', boss: true, behaviour: 'hunt', hp: 1600, speed: 3.0, gun: 'rpg', rocket: true, dmg: 60, rate: 3.4, burst: 1, gap: 0.2, acc: 0.45, range: 50, minRange: 14, cash: 3000, drops: { armor: 1, ammo: 1 }, weaponDrops: { minigun: 1 }, heat: 12, scale: 1.32, bigFlash: true, radar: '#ff3b4e', despawn: 130,
    look: { shirt: '#2b302b', pants: '#222622', hat: 'helmet', hatColor: '#1a1d1a', vest: '#3a403a', glasses: true, longSleeve: true, gloves: '#111' } },
  // the secret sixth star: beamed down from the UFO (vehicles/ufo.js), they hunt with laser rifles and often drop one
  alien: { name: 'Alien', faction: 'law', behaviour: 'hunt', hp: 280, speed: 5.4, gun: 'laser', dmg: 8, rate: 1.3, burst: 3, gap: 0.16, acc: 0.42, range: 52, cash: 1200, drops: { armor: 0.6, ammo: 0.8 }, weaponDrops: { laser: 0.5 }, heat: 10, radar: '#6dff8a', despawn: 140, leaveBelow: 6,
    look: { skin: '#8fdc6e', shirt: '#c9ced8', pants: '#aab1be', hairStyle: 'bald', alienEyes: true, antennae: true, longSleeve: true, gloves: '#3a3f4a', shoes: '#3a3f4a' } },
};

// a plain base that uniforms are laid over
function uniform(look) { return Object.assign({ skin: pick(SKIN), hair: pick(HAIR), hairStyle: 'short', shoes: '#15141a' }, look); }

export function makeLook(def) {
  const look = typeof def.look === 'function' ? def.look() : uniform(def.look);
  look.scale = def.scale;
  return look;
}

function bikerLook() {
  return Object.assign(randomLook(), { pa: null, pb: null, shirt: pick(['#1b1c22', '#2e323c', '#4a5260', '#5b4a3a', '#20283a']), pants: pick(['#1d1e24', '#2b2f38', '#3b3f45']), shorts: false, longSleeve: true, gloves: '#121214', hat: 'helmet', hatColor: pick(['#111114', '#f2f2f2', '#c8102e', '#1c69d4', '#ffd23e']), glasses: true, shoes: '#18171a' });
}
function stepperLook() {
  const L = randomLook();
  if (Math.random() < 0.25) Object.assign(L, { hat: 'helmet', hatColor: pick(['#f2f2f2', '#16b39a', '#1b1c21', '#ff6fae']) });
  return L;
}
