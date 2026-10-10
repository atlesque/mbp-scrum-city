// ================= BULLET IMPACTS =================
// What a bullet sounds like where it lands, by what it lands on: recordings in public/sfx/ (sources and licences in
// public/sfx/CREDITS.md), `takes` of them per surface as impact-<surface>-1.mp3, impact-<surface>-2.mp3, ..., one
// picked at random for every hit. `vol` is how loud next to the other surfaces; all of them sit well under the
// gunshot. `puff` is the colour of the bits that fly up. A new surface is one line here, its takes in public/sfx/,
// and whatever is made of it named in combat/surface.js.
export const IMPACTS = {
  brick: { takes: 3, vol: 0.32, puff: '#e8d4c8' }, // the buildings, and the paving in the street
  sand: { takes: 3, vol: 0.3, puff: '#e9cf96' }, // the beach, and the parks' grass and paths
  wood: { takes: 3, vol: 0.34, puff: '#9a7450' }, // palm trunks, the lifeguard huts, the beach umbrellas' poles
  water: { takes: 3, vol: 0.32, puff: '#e6f8ff' }, // the sea
  metal: { takes: 3, vol: 0.3, puff: '#ffe9a8' }, // vehicles, the chopper, the tank, street lamps
  flesh: { takes: 3, vol: 0.34, puff: '#b0202a' }, // people, the player included
};
export const SURFACES = Object.keys(IMPACTS);
// every recording a surface can play, by file name (without .mp3)
export const impactFiles = s => Array.from({ length: IMPACTS[s]?.takes || 0 }, (_, i) => `impact-${s}-${i + 1}`);
export const ALL_IMPACT_FILES = SURFACES.flatMap(impactFiles);
