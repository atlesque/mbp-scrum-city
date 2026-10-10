import { kb } from '../../core/controls.js';
import { BODY } from '../firetruck-mesh.js';
import { carKind } from './car.js';

// Trucks: a car, only much bigger and heavier (the fire engine, models/firetruck.js, and the army truck, models/army.js). It drives like a car with a long
// wheelbase, slower to get going and to turn; it shoves cars aside instead of bouncing off them, bikes don't ride over
// it, and it goes up with a bigger bang. Nothing hurts whoever is driving it: crashes, shots and blasts all land on the truck. See kinds/bike.js for what each field means.
export const truck = carKind({
  hw: BODY.hw, hl: BODY.hl, sill: 1.9, wx: 1.05, wz: 2.7, h: 3.2, circles: [3.0, 1.0, -1.0, -3.0], front: BODY.hl + 0.05,
}, K => ({
  handling: { ...K.handling, top: 22, boostTop: 27, accel: 5, boostAccel: 7, brake: 15, reverseTop: 5, reverseAccel: 4, handbrake: 6, coast: 1.6,
    turnLow: 1.5, turnHigh: 0.75, maxSteer: 0.55, steerRate: 4, grip: 12, gripFast: 8, drift: { ...K.handling.drift, min: 14, turn: 1.0 } },
  fx: { ...K.fx, smokeY: 2.6, smokeSize: 0.9, fireY: 2.4, fireSize: 0.5, spread: 1.4 },
  blast: { y: 1.2, r: 11, dmg: 280 },
  wreckReward: { heat: 5, cash: [80, 260] },
  bumper: { back: -BODY.hl - 0.1, front: BODY.hl + 0.5, half: BODY.hw + 0.15, slow: 0.95 },
  crash: { exitSpeed: 9, hurt: 0 },
  shieldsDriver: true,
  ram: { mass: 12, hull: [3.0, BODY.hw], heavierAt: 3, sameAt: Infinity },
  camera: { dist: 11.5, aimDist: 6.5, height: 3.6, fovPerSpeed: 0.3, minArm: 5 },
  laneHalf: 2.2, reachMax: 1.8, engineVoice: 'diesel', engineNear: 0.09,
  topAt: undefined, // far too tall to ride a bike over
  tip: M => `The ${M.name}. <em>${kb('forward')}</em>/<em>${kb('back')}</em> gas and brake, <em>${kb('left')}</em>/<em>${kb('right')}</em> steer, <em>${kb('sprint')}</em> boost, ${M.siren ? `<em>${kb('siren')}</em> siren, ` : ''}<em>${kb('ride')}</em> to get out. It's heavy: cars get shoved out of its way.`,
}));
