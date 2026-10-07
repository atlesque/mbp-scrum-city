import gs from './gs.js';
import bmw5 from './bmw5.js';
import eqa from './eqa.js';
import firetruck from './firetruck.js';
import modelyblue from './modely-blue.js';
import modely from './modely.js';
import police from './police.js';
import sedan from './sedan.js';
import t7 from './t7.js';

// Every vehicle model in the game. To add one, write a model file next to these and list it here.
// A model names its `kind` ('bike' or 'car', see vehicles/kinds/), which supplies the physics, seating
// and hit box; the model supplies the looks and can override any of the kind's numbers:
//   id, kind, name, short (HUD), tag (toasts), hp
//   handling   overrides for the kind's handling (top speed, accel, brakes, steering)
//   engine     { rev } pitch multiplier, { gears } speed (m/s) at each gear change
//   electric   true: no engine note, a pedestrian-warning hum below 30 km/h and road noise above it
//   traffic    { weight, speed: [min, max] }; weight 0 keeps it out of random traffic
//   police     true for cop cars: flashing lights, and they leave with the heat
//   siren      true when the player can switch a siren and flashing lights on (core/keymap.js 'siren'); sirenY: how high it sounds
// Bikes also give spec / geos / wheel / decal / decalAt (see models/gs.js); cars give mesh().
export const VEHICLE_MODELS = Object.fromEntries([gs, t7, sedan, modely, police, modelyblue, eqa, bmw5, firetruck].map(m => [m.id, m]));

// pick a model of a kind for traffic, weighted by traffic.weight
export function pickTrafficModel(kind) {
  const list = Object.values(VEHICLE_MODELS).filter(m => m.kind === kind && m.traffic && m.traffic.weight > 0);
  let r = Math.random() * list.reduce((s, m) => s + m.traffic.weight, 0);
  for (const m of list) { r -= m.traffic.weight; if (r <= 0) return m; }
  return list[0];
}
