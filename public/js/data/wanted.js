export const WANTED = [null,
  { max: 3, every: 5, mix: [['cop', 1]] },
  { max: 5, every: 4, mix: [['cop', 1]], cars: true },
  { max: 7, every: 3.2, mix: [['cop', 0.45], ['swat', 0.55]], cars: true },
  { max: 9, every: 2.6, mix: [['swat', 0.45], ['fbi', 0.55]], cars: true, heli: true },
  { max: 10, every: 2.2, mix: [['fbi', 0.3], ['army', 0.55], ['jugg', 0.15]], cars: true, heli: true, tank: true },
];
export const HEAT = [0, 1, 10, 25, 50, 90];
// strength (0..1) of the red inner glow on the minimap at each star level; none at zero stars
export const RADAR_GLOW = [0, 0.3, 0.45, 0.62, 0.8, 1];
// the glow pulses from this star level up
export const RADAR_PULSE_FROM = 4;
// highest star level whose heat threshold has been reached
export function heatToLevel(heat, table = HEAT) { for (let i = table.length - 1; i >= 1; i--) if (heat >= table[i]) return i; return 0; }
// pick an NPC type from a level's [[type, weight], ...] mix
export function mixPick(mix, r = Math.random()) { for (const [t, w] of mix) { r -= w; if (r <= 0) return t; } return mix[0][0]; }
