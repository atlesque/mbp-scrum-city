import { BODY, buildTruck } from '../firetruck-mesh.js';

// the fire engine (vehicles/firetruck-mesh.js) with the player at the wheel: taken from the fire brigade at a fire
// (see Truck.interaction in vehicles/firetruck.js); never part of ordinary traffic
export default {
  id: 'firetruck', kind: 'truck', name: 'Fire truck', short: 'Fire truck', tag: 'fire truck',
  hp: 500, siren: true, sirenY: 3,
  mesh() {
    const t = buildTruck();
    // the driver sits up in the cab, on the door side
    const seat = new THREE.Group(); seat.position.set(0.55, 0.65, BODY.hl - 1.3); t.grp.add(seat);
    return { grp: t.grp, m: t.meshes[0], lr: t.lights.r, lb: t.lights.w, seat, wheels: t.wheels, solid: t.meshes, lit: [t.lights.r, t.lights.w] };
  },
  engine: { rev: 0.4, gears: [0, 6, 11, 16, 21, 27] },
  traffic: { weight: 0 },
};
