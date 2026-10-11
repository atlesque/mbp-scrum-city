import { ITEM_TYPES } from '../../public/js/shops/items.js';
import { expect, it } from 'vitest';
import { catchPokemon, freshTeam, gainExperience, normalizeTeam, randomEncounter, SPECIES } from '../../public/js/pokemon/team.js';

it('catches a wild Pokemon at its encounter level and persists experience', () => {
  const team = freshTeam();
  catchPokemon(team, 'pidgey', () => 0, 7);
  expect(team.party[0]).toEqual({ species: 'pidgey', hp: 100, level: 7, xp: 0 });
  expect(normalizeTeam(team).party[0]).toEqual(team.party[0]);
});
it('levels up and evolves a starter at the correct thresholds', () => {
  const p = { species: 'charmander', hp: 62, level: 15, xp: 290 };
  const result = gainExperience(p, 10);
  expect(p).toEqual({ species: 'charmeleon', hp: 62, level: 16, xp: 0 });
  expect(result.evolvedTo).toBe('charmeleon');
  p.level = 35; p.xp = 699;
  gainExperience(p, 1);
  expect([p.species, p.level, p.xp]).toEqual(['charizard', 36, 0]);
});
it('keeps unused XP, handles several levels and caps progression', () => {
  const p = { species: 'rattata', hp: 100, level: 1, xp: 0 };
  gainExperience(p, 65);
  expect([p.level, p.xp]).toEqual([3, 5]);
  p.level = 49; p.xp = 0;
  gainExperience(p, 100000);
  expect([p.level, p.xp, p.species]).toEqual([50, 0, 'raticate']);
  gainExperience(p, -100);
  expect(p.level).toBe(50);
});
it('spawns a diverse random pool with levels appropriate to each evolutionary stage', () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    let call = 0;
    const encounter = randomEncounter(() => call++ === 0 ? i / 1000 : 0.6);
    seen.add(encounter.species);
    expect(encounter.level).toBeGreaterThanOrEqual(SPECIES[encounter.species].minLevel);
    expect(encounter.level).toBeLessThanOrEqual(SPECIES[encounter.species].maxLevel);
  }
  expect(seen.size).toBe(35);
});
it('migrates an existing caught partner to level one and rejects broken progression', () => {
  const team = normalizeTeam({ balls: 5, selected: 0, party: [{ species: 'pikachu', hp: 40 }] });
  expect(team.party[0]).toEqual({ species: 'pikachu', hp: 40, level: 1, xp: 0 });
  const p = normalizeTeam({ party: [{ species: 'pikachu', hp: 40, level: -200, xp: Infinity }] }).party[0];
  expect([p.level, p.xp]).toEqual([1, 0]);
});

it('Pikachu uses a purchased Thunder Stone, preserving its level and experience', () => {
  const p = { species: 'pikachu', hp: 80, level: 22, xp: 12 };
  gainExperience(p, 1); expect(p.species).toBe('pikachu');
  const ctx = { inv: { money: 299, pokemon: { balls: 5, party: [p], selected: 0 } }, pay(n) { if (this.inv.money < n) return false; this.inv.money -= n; return true; } };
  expect(ITEM_TYPES.pokemonTeam.act({}, 'evolve:0', ctx)).toBe(false);
  ctx.inv.money = 300;
  expect(ITEM_TYPES.pokemonTeam.act({}, 'evolve:0', ctx)).toBe(true);
  expect([p.species, p.level, p.xp, ctx.inv.money]).toEqual(['raichu', 22, 13, 0]);
  expect(ITEM_TYPES.pokemonTeam.act({}, 'evolve:0', ctx)).toBe(false);
});

it('new families evolve at their own thresholds and save normally', () => {
  for (const [species, level, evolved] of [['caterpie', 10, 'butterfree'], ['weedle', 10, 'beedrill'], ['oddish', 21, 'gloom'], ['psyduck', 33, 'golduck'], ['sandshrew', 22, 'sandslash'], ['diglett', 26, 'dugtrio'], ['magnemite', 30, 'magneton']]) {
    const p = { species, level: level - 1, xp: 0, hp: 100 };
    gainExperience(p, (level - 1) * 20);
    expect(p.species).toBe(evolved);
    expect(normalizeTeam({ party: [p] }).party[0]).toEqual(p);
  }
});

it('Gloom uses a Leaf Stone and keeps its saved progression', () => {
  const p = { species: 'gloom', hp: 45, level: 25, xp: 12 };
  const inv = { money: 300, pokemon: { party: [p], selected: 0 } };
  const ctx = { inv, pay(n) { if (inv.money < n) return false; inv.money -= n; return true; } };
  expect(ITEM_TYPES.pokemonTeam.render({}, ctx, 0)).toContain('Leaf Stone → Vileplume');
  expect(ITEM_TYPES.pokemonTeam.act({}, 'evolve:0', ctx)).toBe(true);
  expect(p).toEqual({ species: 'vileplume', hp: 45, level: 25, xp: 12 });
  expect(inv.money).toBe(0);
});
it('weakening changes the catch result and preserves remaining health', () => {
  const healthy = freshTeam(), weak = freshTeam();
  expect(catchPokemon(healthy, 'magnemite', () => 0.85, 8, 100)).toBe('escaped');
  expect(catchPokemon(weak, 'magnemite', () => 0.85, 8, 30)).toBe('caught');
  expect(weak.party[0].hp).toBe(30);
});
