// ================= GUNSHOTS =================
// What each gun sounds like when it fires: recordings of real guns in public/sfx/ (sources and licences in
// public/sfx/CREDITS.md), `takes` of them per gun as shot-<id>-1.mp3, shot-<id>-2.mp3, ..., one picked at random
// for every shot so a burst never repeats itself. `vol` is how loud next to the other guns. 'cannon' is the
// tank's main gun. A gun without a line plays the synthesized shot in core/audio.js.
export const SHOTS = {
  pistol: { takes: 3, vol: 0.9 }, // Walther PPQ, 9 mm
  smg: { takes: 3, vol: 0.7 }, // Carl Gustav M/45, 9 mm
  shotgun: { takes: 2, vol: 1.1 }, // Benelli Nova 12 gauge, then the pump
  rifle: { takes: 4, vol: 0.85 }, // AK-47
  minigun: { takes: 4, vol: 0.6 }, // PPSh-41, slowed a little and cut short
  rpg: { takes: 2, vol: 0.9 }, // a 12 gauge slowed right down for the backblast, then the rocket motor
  sniper: { takes: 3, vol: 1.2 }, // Mosin-Nagant, then the bolt
  laser: { takes: 3, vol: 0.7 }, // the aliens' laser rifle: no real gun sounds like it, so it is synthesized (public/sfx/CREDITS.md)
  cannon: { takes: 1, vol: 1.4 },
};
// every recording a gun can play, by file name (without .mp3)
export const shotFiles = id => Array.from({ length: SHOTS[id]?.takes || 0 }, (_, i) => `shot-${id}-${i + 1}`);
export const ALL_SHOT_FILES = Object.keys(SHOTS).flatMap(shotFiles);
