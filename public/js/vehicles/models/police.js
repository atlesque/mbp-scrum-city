import { carMesh } from './sedan.js';

// the black-and-white cruiser that answers 2+ stars; never part of ordinary traffic
export default {
  id: 'police', kind: 'car', name: 'Police cruiser', short: 'Cruiser', tag: 'cruiser',
  hp: 130, police: true,
  mesh: () => carMesh(null, true),
  engine: { rev: 0.6, gears: [0, 9, 17, 25, 34, 44] },
  traffic: { weight: 0 },
};
