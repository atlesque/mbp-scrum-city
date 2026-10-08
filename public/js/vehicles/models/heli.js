import { buildHeliMesh, makePilot, seatPilot, slump } from '../heli-mesh.js';
import { makeSearchlight } from '../searchlight.js';

// the police chopper, brought down by shooting its pilot (vehicles/heli.js) and left standing for the player to fly
// (kinds/heli.js); never part of ordinary traffic
export default {
  id: 'heli', kind: 'heli', name: 'Police helicopter', short: 'Chopper', tag: 'chopper',
  hp: 1400, // as tough as the police chopper (HELI_HP in vehicles/heli.js)
  mesh() {
    const m = buildHeliMesh();
    // the dead pilot still slumped at the controls, until the player takes the seat
    const pilot = makePilot(); seatPilot(m.seat, pilot); slump(pilot);
    return { ...m, pilot, light: makeSearchlight() };
  },
  engine: { rev: 1 },
  traffic: { weight: 0 },
};
