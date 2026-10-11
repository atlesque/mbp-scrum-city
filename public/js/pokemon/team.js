// Saveable team rules, shared by the shop, encounters and follower.
const FAMILIES = {
  pikachu: { name: 'Pikachu', color: '#ffd438', accent: '#743d26', move: 'Thunder Shock', effect: '#ffe65a', damage: 18, speed: 7.5, catchRate: 0.7 },
  bulbasaur: { name: 'Bulbasaur', color: '#62c8a0', accent: '#378e54', move: 'Vine Whip', effect: '#60ee89', damage: 21, speed: 6, catchRate: 0.8 },
  charmander: { name: 'Charmander', color: '#f39346', accent: '#ffe2a0', move: 'Ember', effect: '#ff843e', damage: 23, speed: 6.5, catchRate: 0.75 },
  squirtle: { name: 'Squirtle', color: '#6dcbed', accent: '#aa7345', move: 'Water Gun', effect: '#68ddff', damage: 20, speed: 6.5, catchRate: 0.8 },
};
function form(name, family, stage = 1, extra = {}) {
  const base = FAMILIES[family];
  return { ...base, name, family, stage, damage: base.damage + (stage - 1) * 8,
    catchRate: Math.max(0.3, base.catchRate - (stage - 1) * 0.15),
    minLevel: stage === 1 ? 1 : stage === 2 ? 16 : 36,
    maxLevel: stage === 1 ? 12 : stage === 2 ? 28 : 46,
    wildWeight: stage === 1 ? 10 : stage === 2 ? 2 : 0.5, ...extra };
}
FAMILIES.pidgey = { color: '#b99262', accent: '#f3dfb1', move: 'Gust', effect: '#dceffa', damage: 16, speed: 8, catchRate: 0.85 };
FAMILIES.rattata = { color: '#a078c3', accent: '#f3d7b0', move: 'Quick Attack', effect: '#e8c6ff', damage: 17, speed: 8.5, catchRate: 0.88 };
FAMILIES.zubat = { color: '#637ac6', accent: '#ad6dbd', move: 'Air Cutter', effect: '#bba9ff', damage: 18, speed: 8, catchRate: 0.82 };
FAMILIES.caterpie = { color: '#7bc65a', accent: '#f3e89b', move: 'Bug Bite', effect: '#b8ec70', damage: 15, speed: 5, catchRate: 0.9 };
FAMILIES.weedle = { color: '#d7ad73', accent: '#e68d9c', move: 'Poison Sting', effect: '#d58fe8', damage: 17, speed: 5.5, catchRate: 0.9 };
FAMILIES.oddish = { color: '#677ab9', accent: '#53a55b', move: 'Absorb', effect: '#82e899', damage: 19, speed: 5, catchRate: 0.85 };
FAMILIES.psyduck = { color: '#f6d261', accent: '#f0e3ab', move: 'Confusion', effect: '#e8a0ee', damage: 22, speed: 6, catchRate: 0.8 };
FAMILIES.sandshrew = { color: '#dab86a', accent: '#fff0b6', move: 'Dig', effect: '#dfbd83', damage: 21, speed: 6.5, catchRate: 0.82 };
FAMILIES.diglett = { color: '#ad7856', accent: '#e8a1ad', move: 'Mud Slap', effect: '#bd9468', damage: 20, speed: 7, catchRate: 0.85 };
FAMILIES.magnemite = { color: '#a9bdcc', accent: '#657384', move: 'Spark', effect: '#a5efff', damage: 24, speed: 6, catchRate: 0.75 };
export const SPECIES = {
  caterpie: form('Caterpie', 'caterpie', 1, { evolvesTo: 'metapod', evolveLevel: 7, maxLevel: 6 }),
  metapod: form('Metapod', 'caterpie', 2, { color: '#69ad56', evolvesTo: 'butterfree', evolveLevel: 10, minLevel: 7, maxLevel: 9 }),
  butterfree: form('Butterfree', 'caterpie', 3, { color: '#a69ac5', accent: '#e9e4ee', minLevel: 10, maxLevel: 30, move: 'Gust' }),
  weedle: form('Weedle', 'weedle', 1, { evolvesTo: 'kakuna', evolveLevel: 7, maxLevel: 6 }),
  kakuna: form('Kakuna', 'weedle', 2, { color: '#edca4a', evolvesTo: 'beedrill', evolveLevel: 10, minLevel: 7, maxLevel: 9 }),
  beedrill: form('Beedrill', 'weedle', 3, { color: '#edc746', minLevel: 10, maxLevel: 30, move: 'Twineedle' }),
  oddish: form('Oddish', 'oddish', 1, { evolvesTo: 'gloom', evolveLevel: 21 }),
  gloom: form('Gloom', 'oddish', 2, { evolvesTo: 'vileplume', evolutionItem: 'leafstone', minLevel: 21, color: '#7588ba' }),
  vileplume: form('Vileplume', 'oddish', 3, { minLevel: 25, color: '#6779ad', move: 'Petal Dance' }),
  psyduck: form('Psyduck', 'psyduck', 1, { evolvesTo: 'golduck', evolveLevel: 33 }),
  golduck: form('Golduck', 'psyduck', 2, { color: '#5eafd5', minLevel: 33, maxLevel: 45, move: 'Water Pulse', effect: '#68ddff' }),
  sandshrew: form('Sandshrew', 'sandshrew', 1, { evolvesTo: 'sandslash', evolveLevel: 22 }),
  sandslash: form('Sandslash', 'sandshrew', 2, { minLevel: 22, maxLevel: 40 }),
  diglett: form('Diglett', 'diglett', 1, { evolvesTo: 'dugtrio', evolveLevel: 26 }),
  dugtrio: form('Dugtrio', 'diglett', 2, { minLevel: 26, maxLevel: 40 }),
  magnemite: form('Magnemite', 'magnemite', 1, { evolvesTo: 'magneton', evolveLevel: 30 }),
  magneton: form('Magneton', 'magnemite', 2, { minLevel: 30, maxLevel: 45 }),
  pikachu: form('Pikachu', 'pikachu', 1, { evolvesTo: 'raichu', evolutionItem: 'thunderstone' }),
  raichu: form('Raichu', 'pikachu', 2, { color: '#dd963f', minLevel: 22, maxLevel: 34 }),
  bulbasaur: form('Bulbasaur', 'bulbasaur', 1, { evolvesTo: 'ivysaur', evolveLevel: 16 }),
  ivysaur: form('Ivysaur', 'bulbasaur', 2, { evolvesTo: 'venusaur', evolveLevel: 32, color: '#4bb3a0' }),
  venusaur: form('Venusaur', 'bulbasaur', 3, { minLevel: 32, color: '#439e8e' }),
  charmander: form('Charmander', 'charmander', 1, { evolvesTo: 'charmeleon', evolveLevel: 16 }),
  charmeleon: form('Charmeleon', 'charmander', 2, { evolvesTo: 'charizard', evolveLevel: 36, color: '#dc6253' }),
  charizard: form('Charizard', 'charmander', 3),
  squirtle: form('Squirtle', 'squirtle', 1, { evolvesTo: 'wartortle', evolveLevel: 16 }),
  wartortle: form('Wartortle', 'squirtle', 2, { evolvesTo: 'blastoise', evolveLevel: 36, color: '#7faadd' }),
  blastoise: form('Blastoise', 'squirtle', 3, { color: '#5f8cba' }),
  pidgey: form('Pidgey', 'pidgey', 1, { evolvesTo: 'pidgeotto', evolveLevel: 18 }),
  pidgeotto: form('Pidgeotto', 'pidgey', 2, { evolvesTo: 'pidgeot', evolveLevel: 36, minLevel: 18 }),
  pidgeot: form('Pidgeot', 'pidgey', 3),
  rattata: form('Rattata', 'rattata', 1, { evolvesTo: 'raticate', evolveLevel: 20 }),
  raticate: form('Raticate', 'rattata', 2, { color: '#bc985a', minLevel: 20, maxLevel: 34 }),
  zubat: form('Zubat', 'zubat', 1, { evolvesTo: 'golbat', evolveLevel: 22 }),
  golbat: form('Golbat', 'zubat', 2, { minLevel: 22, maxLevel: 34 }),
};
export const MAX_POKEMON_LEVEL = 50;
export const xpToNextLevel = level => level * 20;
const levelOf = v => Number.isFinite(v) ? Math.max(1, Math.min(MAX_POKEMON_LEVEL, Math.floor(v))) : 1;
export function randomEncounter(random = Math.random) {
  const entries = Object.entries(SPECIES), total = entries.reduce((n, [, d]) => n + d.wildWeight, 0);
  let roll = random() * total;
  const [species, def] = entries.find(([, d]) => (roll -= d.wildWeight) < 0) || entries[entries.length - 1];
  return { species, level: def.minLevel + Math.floor(random() * (def.maxLevel - def.minLevel + 1)) };
}
export function gainExperience(record, amount) {
  const before = record.species, startLevel = levelOf(record.level);
  record.level = startLevel; record.xp = (record.xp || 0) + (Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0);
  while (record.level < MAX_POKEMON_LEVEL && record.xp >= xpToNextLevel(record.level)) {
    record.xp -= xpToNextLevel(record.level); record.level++;
  }
  if (record.level === MAX_POKEMON_LEVEL) record.xp = 0;
  while (SPECIES[record.species].evolvesTo && record.level >= SPECIES[record.species].evolveLevel) record.species = SPECIES[record.species].evolvesTo;
  return { levelsGained: record.level - startLevel, evolvedFrom: before, evolvedTo: before !== record.species ? record.species : null };
}
export const freshTeam = () => ({ balls: 5, party: [], selected: -1 });
export function normalizeTeam(raw) {
  if (!raw || typeof raw !== 'object') return freshTeam();
  const party = (Array.isArray(raw.party) ? raw.party : []).filter(p => p && Object.hasOwn(SPECIES, p.species)).slice(0, 6)
    .map(p => {
      const level = levelOf(p.level);
      return { species: p.species, hp: Number.isFinite(p.hp) ? Math.max(0, Math.min(100, p.hp)) : 100, level,
        xp: level === MAX_POKEMON_LEVEL ? 0 : Number.isFinite(p.xp) ? Math.max(0, Math.min(xpToNextLevel(level) - 1, Math.floor(p.xp))) : 0 };
    });
  const selected = Number.isInteger(raw.selected) && party[raw.selected]?.hp > 0 ? raw.selected : -1;
  return { balls: Number.isFinite(raw.balls) ? Math.max(0, Math.min(999, Math.floor(raw.balls))) : 5, party, selected };
}
export function selectPokemon(team, index) {
  if (index !== -1 && (!Number.isInteger(index) || !team.party[index] || team.party[index].hp <= 0)) return false;
  team.selected = index; return true;
}
export function catchChance(species, hp = 100) {
  return Math.min(0.98, SPECIES[species].catchRate + (1 - Math.max(0, Math.min(100, hp)) / 100) * 0.3);
}
export function catchPokemon(team, species, random = Math.random, level = 1, hp = 100) {
  if (!Object.hasOwn(SPECIES, species)) return 'invalid';
  if (team.party.length >= 6) return 'full';
  if (team.balls <= 0) return 'empty';
  team.balls--;
  if (random() >= catchChance(species, hp)) return 'escaped';
  team.party.push({ species, hp: Math.max(1, Math.min(100, hp)), level: levelOf(level), xp: 0 });
  if (team.selected < 0) team.selected = team.party.length - 1;
  return 'caught';
}
