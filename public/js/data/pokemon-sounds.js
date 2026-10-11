// Original chiptune cues: small square/triangle voices to match the blocky models.
// Each evolutionary family has a different contour; later stages have a deeper voice.
const VOICES = {
  pikachu: [920, 1.5, 0.9], bulbasaur: [310, 0.75, 1.3], charmander: [480, 1.25, 0.6],
  squirtle: [620, 0.8, 1.15], pidgey: [1180, 1.2, 1.5], rattata: [790, 1.7, 0.7],
  zubat: [1400, 0.65, 1.3], caterpie: [1050, 1.1, 0.75], weedle: [860, 0.7, 1.6],
  oddish: [550, 1.4, 1.1], psyduck: [390, 0.85, 0.65], sandshrew: [270, 1.6, 0.85],
  diglett: [220, 1.3, 0.7], magnemite: [740, 1.8, 1.2],
};
const note = (hz, at = 0, duration = 0.12, end = hz, type = 'triangle') => ({ hz, at, duration, end, type });
const melody = (frequencies, spacing = 0.1) => frequencies.map((hz, i) => note(hz, i * spacing, spacing * 1.4));
export function pokemonNotes(cue, def = {}) {
  const [base, up, down] = VOICES[def.family] || VOICES.pikachu;
  const hz = base / (1 + ((def.stage || 1) - 1) * 0.3);
  switch (cue) {
    case 'cry': return [note(hz, 0, 0.13, hz * up, 'square'), note(hz * up, 0.15, 0.2, hz * down, 'square'), note(hz * down, 0.38, 0.13, hz * 0.8)];
    case 'attack': return [note(hz * 0.5, 0, 0.08, hz * up * 2, 'sawtooth'), note(hz * up * 2, 0.08, 0.18, hz * 0.4, 'square')];
    case 'throw': return [note(280, 0, 0.22, 1300)];
    case 'catch': return melody([523, 659, 784, 1046], 0.11);
    case 'escape': return [note(1100, 0, 0.16, 220, 'square'), note(330, 0.17, 0.12, 165)];
    case 'recall': return [note(1100, 0, 0.24, 180)];
    case 'faint': return [note(hz, 0, 0.4, 65, 'square')];
    case 'heal': return melody([659, 784, 659, 1046, 988, 1046], 0.15);
    case 'level': return melody([659, 831, 988, 1318], 0.09);
    case 'evolve': return melody([262, 330, 392, 523, 659, 784, 1046], 0.13);
    default: return [];
  }
}
