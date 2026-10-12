import { castBullet, castShot } from '../../public/js/combat/combat.js';
import { Sound } from '../../public/js/core/audio.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { G, P, inv } from '../../public/js/core/state.js';
import { addEntity, all, removeEntity } from '../../public/js/entities/registry.js';
import { emit } from '../../public/js/core/events.js';
import { addCollider, colliders, HASH, tallBoxes } from '../../public/js/world/collision.js';
import { catchChance, freshTeam } from '../../public/js/pokemon/team.js';
import { spawnPokemon, updatePokemon, cyclePartner } from '../../public/js/pokemon/world.js';
import { interact, updateInteraction } from '../../public/js/game/interact.js';
import { spawnVehicle } from '../../public/js/vehicles/vehicle.js';

beforeEach(() => {
  for (const e of all('pokemon')) removeEntity(e);
  colliders.length = tallBoxes.length = 0; HASH.clear();
  inv.pokemon = freshTeam();
  Object.assign(G, { state: 'play', time: 0 });
  Object.assign(P, { x: 0, z: 0, y: 0, alive: true, club: null, vehicle: null, roof: null });
});
it('a partner at heel never hides the car or door beside the player, and E goes to the door', () => {
  const prompt = { hidden: true, innerHTML: '' }; vi.stubGlobal('document', { getElementById: () => prompt });
  const car = spawnVehicle('sedan', 0, 2.5, 0), entered = vi.fn();
  const door = addEntity({ kind: 'test-door', interaction: () => ({ keys: ['use'], priority: 1, dist: 2, prompt: 'roof door', run: entered }) });
  try {
    const record = { species: 'pikachu', hp: 100, level: 3, xp: 0 };
    inv.pokemon.party = [record]; inv.pokemon.selected = 0;
    const partner = spawnPokemon('pikachu', 1, 0, record);
    removeEntity(door); updateInteraction();
    expect(G.near[0].prompt).toContain(car.model.name);
    expect(G.near.some(i => i.prompt.includes('recall'))).toBe(true); // still there for E when nothing else wants it
    addEntity(door); updateInteraction();
    expect(G.near[0].prompt).toBe('roof door');
    interact('use');
    expect(entered).toHaveBeenCalled();
    expect(partner.removed).toBeUndefined();
  } finally { removeEntity(car); removeEntity(door); vi.unstubAllGlobals(); }
});
it('wild encounters offer a catch only close by with line of sight', () => {
  const p = spawnPokemon('pikachu', 2, 0);
  expect(p.interaction(P).prompt).toContain('Pikachu');
  P.x = -10; expect(p.interaction(P)).toBeNull();
  P.x = 0; addCollider(0.8, 1.2, -1, 1, 5, true);
  expect(p.interaction(P)).toBeNull();
});
it('a selected partner follows and switches when team selection changes', () => {
  inv.pokemon.party = [{ species: 'pikachu', hp: 100 }, { species: 'squirtle', hp: 100 }];
  inv.pokemon.selected = 0;
  updatePokemon(0.1);
  let partner = all('pokemon').find(p => p.owned);
  P.x = 8;
  const before = Math.hypot(partner.x - P.x, partner.z - P.z);
  partner.update(0.5);
  expect(Math.hypot(partner.x - P.x, partner.z - P.z)).toBeLessThan(before);
  cyclePartner(); updatePokemon(0.1);
  partner = all('pokemon').find(p => p.owned);
  expect(partner.species).toBe('squirtle');
  expect(all('pokemon').filter(p => p.owned)).toHaveLength(1);
});
it('helps against an attacked NPC, respects walls and stops for death or a faint', () => {
  inv.pokemon.party = [{ species: 'charmander', hp: 100 }]; inv.pokemon.selected = 0;
  updatePokemon(0.1);
  const partner = all('pokemon').find(p => p.owned);
  const npc = { x: partner.x + 2, z: partner.z, y: 0, hp: 100, alive: true, def: { gun: 'pistol' }, hurt(dmg) { this.hp -= dmg; } };
  emit('npc:attacked', { npc, source: 'player' });
  partner.update(0.1); expect(npc.hp).toBeLessThan(100);
  const hp = npc.hp;
  addCollider(partner.x + 0.8, partner.x + 1.2, partner.z - 1, partner.z + 1, 5, true);
  partner.update(2); expect(npc.hp).toBe(hp);
  npc.alive = false; partner.update(0.1); expect(partner.target).toBeNull();
  inv.pokemon.party[0].hp = 0; updatePokemon(0.1);
  expect(all('pokemon').filter(p => p.owned)).toHaveLength(0);
});
it('recalls partners while dead or indoors and keeps wild population bounded', () => {
  inv.pokemon.party = [{ species: 'pikachu', hp: 100 }]; inv.pokemon.selected = 0;
  for (let i = 0; i < 25; i++) updatePokemon(1);
  expect(all('pokemon').filter(p => !p.owned).length).toBeLessThanOrEqual(16);
  P.alive = false; updatePokemon(0.1);
  expect(all('pokemon').some(p => p.owned)).toBe(false);
});

it('does not double-spend during a throw and removes a successful encounter', () => {
  const p = spawnPokemon('pikachu', 2, 0);
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  try {
    p.catch(); p.catch();
    expect(inv.pokemon.balls).toBe(4);
    expect(inv.pokemon.party).toHaveLength(1);
    p.update(1.2);
    expect(p.removed).toBe(true);
    expect(p.ball).toBeNull();
  } finally { random.mockRestore(); }
});
it('an escaped Pokemon stays catchable and empty balls cannot start a throw', () => {
  const p = spawnPokemon('squirtle', 2, 0);
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  try {
    p.catch(); p.update(1.2);
    expect(p.removed).toBeUndefined();
    expect(p.root.scale.x).toBe(1);
    expect(p.interaction(P)).not.toBeNull();
    inv.pokemon.balls = 0; p.catch();
    expect(p.catching).toBeNull();
    expect(inv.pokemon.party).toHaveLength(0);
  } finally { random.mockRestore(); }
});

it('battle XP evolves the partner and replaces its world model', () => {
  const record = { species: 'charmander', hp: 100, level: 15, xp: 299 };
  inv.pokemon.party = [record]; inv.pokemon.selected = 0;
  updatePokemon(0.1);
  const partner = all('pokemon').find(p => p.owned);
  const npc = { x: partner.x + 2, z: partner.z, alive: true, def: { hp: 80 } };
  emit('npc:attacked', { npc, source: 'player' });
  emit('npc:killed', { npc, byPlayer: true });
  expect(record.species).toBe('charmeleon');
  expect(record.level).toBe(16);
  updatePokemon(0.1);
  expect(partner.removed).toBe(true);
  expect(all('pokemon').find(p => p.owned).species).toBe('charmeleon');
});

it('damage increases catch chance and fainted wilds disappear', () => {
  const p = spawnPokemon('psyduck', 2, 0);
  const dir = new THREE.Vector3(0, 0, -1), hit = {};
  const healthy = catchChance(p.species, 100);
  p.onShot(hit, 50, dir);
  expect(p.hp).toBe(50);
  expect(p.interaction(P).prompt).toContain('HP 50/100');
  expect(catchChance(p.species, p.hp)).toBeGreaterThan(healthy);
  p.onShot(hit, 100, dir);
  expect(p.removed).toBe(true);
  expect(p.interaction(P)).toBeNull();
});
it('enemy damage faints an owned partner without removing it from the saved team', () => {
  const record = { species: 'sandshrew', hp: 100, level: 4, xp: 0 };
  inv.pokemon.party = [record]; inv.pokemon.selected = 0;
  const p = spawnPokemon(record.species, 2, 0, record);
  p.blast(2, 0.3, 0, 4, 200, false);
  expect(record.hp).toBe(0);
  expect(inv.pokemon.selected).toBe(-1);
  expect(inv.pokemon.party).toHaveLength(1);
  expect(p.removed).toBe(true);
});
it('cannot damage an encounter during capture or catch an already fainted Pokemon', () => {
  const p = spawnPokemon('pikachu', 2, 0);
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  try {
    p.catch(); p.onShot({}, 1000, new THREE.Vector3());
    expect(p.hp).toBe(100);
    p.update(1.2); p.catch();
    expect(inv.pokemon.balls).toBe(4);
    expect(inv.pokemon.party).toHaveLength(1);
  } finally { random.mockRestore(); }
});

it('caught Pokemon neither block friendly shots nor take player bullets or explosions', () => {
  const record = { species: 'pikachu', hp: 80, level: 4, xp: 0 };
  inv.pokemon.party = [record]; inv.pokemon.selected = 0;
  const p = spawnPokemon(record.species, 2, 0, record);
  expect(p.raycast(new THREE.Vector3(2, 0.3, 4), new THREE.Vector3(0, 0, -1), 10)).toBeNull();
  p.onShot({}, 1000); p.blast(2, 0.3, 0, 5, 1000, true); p.hurt(1000);
  expect(record.hp).toBe(80);
  expect(inv.pokemon.selected).toBe(0);
  expect(p.removed).toBeUndefined();
  expect(p.health).toBeUndefined(); // reserved for the repair tool's callable health trait
});
it('aim and bullet rays pass through every wild Pokemon to the target behind it', () => {
  const target = addEntity({ kind: 'test-target', raycast: (o, d, max) => max > 6 ? { t: 6 } : null });
  try {
    for (const species of ['pikachu', 'psyduck', 'charizard']) {
      const p = spawnPokemon(species, 2, 0);
      const origin = new THREE.Vector3(2, p.bodyY, 4), dir = new THREE.Vector3(0, 0, -1);
      expect(castShot(origin, dir, 10).entity, species).toBe(target);
      expect(castBullet(origin, dir, 10).entity, species).toBe(target);
      expect(p.interaction(P)?.keys).toContain('use');
      removeEntity(p);
    }
  } finally { removeEntity(target); }
});

it('pursues and defeats a fleeing NPC instead of losing it or teleporting back to the player', () => {
  const record = { species: 'bulbasaur', hp: 100, level: 1, xp: 0 };
  inv.pokemon.party = [record]; inv.pokemon.selected = 0;
  const partner = spawnPokemon(record.species, 0, -3, record);
  const npc = { x: 0, z: 12, y: 0, hp: 80, alive: true, def: { runSpeed: 6.3 }, hurt(damage) { this.hp -= damage; this.alive = this.hp > 0; } };
  emit('npc:attacked', { npc, source: 'player' });
  for (let i = 0; i < 160 && npc.alive; i++) { npc.z += 6.3 * 0.05; partner.update(0.05); }
  expect(npc.alive).toBe(false);
  expect(partner.z).toBeGreaterThan(20);
  expect(record.hp).toBeGreaterThan(0);
});

it('plays action cues only for successful actions, including battle and Center healing', () => {
  const sound = vi.spyOn(Sound, 'pokemon');
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  try {
    const p = spawnPokemon('pikachu', 2, 0);
    inv.pokemon.balls = 0; p.catch(); expect(sound).not.toHaveBeenCalled();
    inv.pokemon.balls = 5; p.catch(); p.update(1.2);
    expect(sound).toHaveBeenCalledWith('throw');
    expect(sound).toHaveBeenCalledWith('catch', p.def);
    updatePokemon(0.1);
    const partner = all('pokemon').find(p => p.owned);
    expect(sound).toHaveBeenCalledWith('cry', partner.def, expect.any(Object));
    const npc = { x: partner.x + 1, z: partner.z, alive: true, hurt() {}, def: {} };
    emit('npc:attacked', { npc, source: 'player' }); partner.update(0.1);
    expect(sound).toHaveBeenCalledWith('attack', partner.def, partner);
    sound.mockClear(); partner.hurt(200, true); expect(sound).not.toHaveBeenCalled();
    partner.hurt(200, false); expect(sound).toHaveBeenCalledWith('faint', partner.def, partner);
    emit('shop:purchase', { item: { type: 'pokemonTeam' }, action: 'heal' });
    expect(sound).toHaveBeenCalledWith('heal');
    emit('shop:purchase', { item: { type: 'pokemonTeam' }, action: 'evolve:0' });
    expect(sound).toHaveBeenCalledWith('evolve');
  } finally { sound.mockRestore(); random.mockRestore(); }
});
