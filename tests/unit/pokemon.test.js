import { beforeEach, expect, it } from 'vitest';
import { catchPokemon, freshTeam, normalizeTeam, selectPokemon } from '../../public/js/pokemon/team.js';
import { ITEM_TYPES } from '../../public/js/shops/items.js';
import { apply, migrate, serialize } from '../../public/js/core/save.js';

let team;
beforeEach(() => { team = freshTeam(); });
it('a catch spends one ball, adds a healthy Pokemon, and selects the first catch', () => {
  expect(catchPokemon(team, 'pikachu', () => 0)).toBe('caught');
  expect(team.balls).toBe(4);
  expect(team.party).toEqual([{ species: 'pikachu', hp: 100, level: 1, xp: 0 }]);
  expect(team.selected).toBe(0);
});
it('a failed catch spends a ball; empty balls and full teams cannot spend one', () => {
  expect(catchPokemon(team, 'pikachu', () => 0.99)).toBe('escaped');
  expect(team.balls).toBe(4);
  team.balls = 0;
  expect(catchPokemon(team, 'pikachu')).toBe('empty');
  team.balls = 10; team.party = Array.from({ length: 6 }, () => ({ species: 'pikachu', hp: 100, level: 1, xp: 0 }));
  expect(catchPokemon(team, 'squirtle')).toBe('full');
  expect(team.balls).toBe(10);
});
it('switches only to healthy team members and can recall', () => {
  team.party = [{ species: 'pikachu', hp: 0 }, { species: 'squirtle', hp: 60 }];
  expect(selectPokemon(team, 0)).toBe(false);
  expect(selectPokemon(team, 1)).toBe(true);
  expect(team.selected).toBe(1);
  expect(selectPokemon(team, -1)).toBe(true);
  expect(team.selected).toBe(-1);
});
it('buys balls only when affordable and heals fainted Pokemon', () => {
  const inv = { money: 99, pokemon: team };
  const ctx = { inv, pay(n) { if (inv.money < n) return false; inv.money -= n; return true; } };
  const item = { price: 100, amount: 5 };
  expect(ITEM_TYPES.pokeballs.act(item, 'buy', ctx)).toBe(false);
  inv.money = 100;
  expect(ITEM_TYPES.pokeballs.act(item, 'buy', ctx)).toBe(true);
  expect([inv.money, team.balls]).toEqual([0, 10]);
  team.party.push({ species: 'pikachu', hp: 0 });
  expect(ITEM_TYPES.pokemonTeam.act({}, 'heal', ctx)).toBe(true);
  expect(team.party[0].hp).toBe(100);
});
it('migrates old saves and round-trips team, health, balls and selection', () => {
  const old = migrate({ v: 2, money: 30, weapons: { owned: {}, lvl: {}, ammo: {} }, stats: {} });
  expect(old.pokemon).toEqual(freshTeam());
  team.party.push({ species: 'charmander', hp: 42, level: 7, xp: 12 }); team.selected = 0; team.balls = 12;
  const inv = { money: 30, owned: {}, lvl: {}, ammo: {}, found: {}, pokemon: team };
  const dest = { owned: {}, lvl: {}, ammo: {} };
  apply(JSON.parse(JSON.stringify(serialize(inv, {}))), dest, {});
  expect(dest.pokemon).toEqual(team);
  expect(dest.pokemon).not.toBe(team);
});
it('rejects invalid species and repairs malformed saved teams', () => {
  expect(catchPokemon(team, 'missing')).toBe('invalid');
  expect(team.balls).toBe(5);
  expect(normalizeTeam({ balls: -5, party: [{ species: 'missing' }, { species: 'pikachu', hp: 999 }], selected: 200 }))
    .toEqual({ balls: 0, party: [{ species: 'pikachu', hp: 100, level: 1, xp: 0 }], selected: -1 });
});
