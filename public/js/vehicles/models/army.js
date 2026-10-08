import { buildArmyTruck } from '../armytruck-mesh.js';
import { BODY } from '../firetruck-mesh.js';

// the olive troop truck the army arrives in at five stars (see RIDES in data/wanted.js); no siren, no flashing lights.
// Soldiers never come in police cruisers. Never part of ordinary traffic.
export default {
  id: 'army', kind: 'truck', name: 'Army truck', short: 'Army truck', tag: 'army truck',
  hp: 500, army: true, crew: 4,
  mesh() {
    const t = buildArmyTruck();
    const seat = new THREE.Group(); seat.position.set(0.55, 0.7, BODY.hl - 2.2); t.grp.add(seat);
    return { grp: t.grp, m: t.meshes[0], seat, wheels: t.wheels, solid: t.meshes, lit: [] };
  },
  engine: { rev: 0.35, gears: [0, 6, 11, 16, 21, 27] },
  traffic: { weight: 0 },
};
