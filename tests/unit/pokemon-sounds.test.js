import { describe, expect, it } from 'vitest';
import { pokemonNotes } from '../../public/js/data/pokemon-sounds.js';
import { SPECIES } from '../../public/js/pokemon/team.js';

describe('Pokémon sound palette', () => {
  it('gives all 35 species a distinct, bounded cry', () => {
    const cries = Object.values(SPECIES).map(def => pokemonNotes('cry', def));
    expect(new Set(cries.map(n => JSON.stringify(n))).size).toBe(Object.keys(SPECIES).length);
    for (const notes of cries) for (const n of notes) {
      expect(n.hz).toBeGreaterThan(40); expect(n.end).toBeGreaterThan(40);
      expect(n.at + n.duration).toBeLessThan(2);
    }
  });
  it('provides short cues for every Pokémon interaction and distinct attack voices', () => {
    for (const cue of ['throw', 'catch', 'escape', 'recall', 'faint', 'heal', 'level', 'evolve', 'attack']) {
      const notes = pokemonNotes(cue, SPECIES.pikachu);
      expect(notes.length, cue).toBeGreaterThan(0);
      for (const n of notes) { expect(n.hz).toBeGreaterThan(0); expect(n.duration).toBeGreaterThan(0); expect(n.at + n.duration).toBeLessThan(3); }
    }
    expect(pokemonNotes('attack', SPECIES.squirtle)).not.toEqual(pokemonNotes('attack', SPECIES.charmander));
    expect(pokemonNotes('unknown')).toEqual([]);
  });
});
