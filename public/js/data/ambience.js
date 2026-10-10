// ================= AMBIENCE =================
// The recordings the city plays around you (game/ambience.js): looped beds for the city by day and by night and
// the wind up on the roofs, the surf along the shore, gulls over the beach and the park fountains. Files are in
// public/sfx/ (without .mp3; sources and licences in public/sfx/CREDITS.md). Each is silent until it has loaded.
export const AMB = {
  day: 'amb-city-day',
  night: 'amb-city-night',
  wind: 'amb-wind',
  surf: 'amb-surf',
  fountain: 'amb-fountain',
  gulls: ['amb-gull-1', 'amb-gull-2', 'amb-gull-3'],
};
export const ALL_AMB_FILES = Object.values(AMB).flat();
