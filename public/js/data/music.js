// Neon FM builds up with the wanted level: each layer joins at its star count and stays for every level above.
export const MUSIC_LAYERS = {
  pad: 0,    // detuned saw chords
  bass: 0,   // eighth-note saw bass
  kick: 1,   // four on the floor
  snare: 1,  // backbeat with a gated reverb tail
  hats: 1,   // offbeat closed hats
  arp: 2,    // square arpeggio over the chords
  lead: 3,   // the hook melody
  drive: 4,  // sixteenth hats, open hats, claps and an octave-jumping bass
  chase: 5,  // crash, tom fills, stabs and the lead doubled an octave up
  theremin: 6, // the secret sixth star: a warbling sci-fi sine gliding over the chords
};
export const MAX_INTENSITY = Math.max(...Object.values(MUSIC_LAYERS));
// the set of layers playing at a wanted level
export function musicLayers(level) {
  const l = Math.max(0, Math.min(MAX_INTENSITY, Math.floor(level) || 0));
  const on = {};
  for (const [k, min] of Object.entries(MUSIC_LAYERS)) on[k] = l >= min;
  return on;
}
// lead hook: [step in the bar, chord tone, octave up, length in steps]
export const LEAD = [[0, 2, 1, 3], [3, 1, 1, 1], [4, 0, 1, 2], [6, 1, 1, 2], [8, 2, 1, 4], [12, 0, 2, 2], [14, 2, 1, 2]];
