import { describe, expect, it } from 'vitest';
import '../../public/js/vehicles/vehicle.js'; // first, as in the game: the car kind and the game modules import each other
import { makeCharacter } from '../../public/js/characters/character.js';
import { car } from '../../public/js/vehicles/kinds/car.js';
import { VEHICLE_MODELS } from '../../public/js/vehicles/models/index.js';

// the player (main.js), and the tallest hair a passer-by can have
const LOOKS = {
  player: { skin: '#eab48f', shirt: '#2fb8c9', pants: '#f4f0e6', hair: '#3a2416', hairStyle: 'mullet', glasses: true },
  afro: { skin: '#8a5a3c', shirt: '#ff4fa3', pants: '#2a2a40', hair: '#1a1214', hairStyle: 'afro' },
};
const NEW_CARS = ['modelyblue', 'eqa', 'bmw5'];

function seated(M, look) {
  const mesh = M.mesh(), ch = makeCharacter(look);
  car.seat({ mesh }, ch); mesh.grp.updateMatrixWorld(true);
  return { mesh, ch };
}
// how far the seated driver's head pokes through the roof or windscreen: each point of the head against the first
// surface of the body or glass straight above it
function headOut(M, look) {
  const { mesh, ch } = seated(M, look);
  const shell = [mesh.m, mesh.win].map(m => new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  const rc = new THREE.Raycaster(), p = ch.head.geometry.attributes.position, v = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  let worst = -Infinity;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(ch.head.matrixWorld);
    rc.set(new THREE.Vector3(v.x, 6, v.z), down);
    const hit = rc.intersectObjects(shell, false)[0];
    if (hit) worst = Math.max(worst, v.y - hit.point.y);
  }
  return worst;
}

describe('drivers fit in the detailed cars', () => {
  for (const id of NEW_CARS) {
    for (const [name, look] of Object.entries(LOOKS)) it(`${id}: ${name}'s head stays under the roof`, () => {
      expect(headOut(VEHICLE_MODELS[id], look)).toBeLessThan(-0.02);
    });
    it(`${id}: feet stay above the sills, out of sight under the car`, () => {
      const { ch } = seated(VEHICLE_MODELS[id], LOOKS.player), box = new THREE.Box3().setFromObject(ch.legL, true);
      expect(box.min.y).toBeGreaterThan(0.26);
    });
  }
  it('shots aim at the shrunk driver', () => {
    const M = VEHICLE_MODELS.eqa, c = { mesh: M.mesh(), x: 0, z: 0, yaw: 0 }, s = c.mesh.seat.position, k = c.mesh.seat.scale.y;
    expect(k).toBeLessThan(1);
    // a level shot through the side window at head height hits the head
    const hit = car.occupantHit(c, { x: -5, y: s.y + 1.74 * k, z: s.z }, { x: 1, y: 0, z: 0 }, 20);
    expect(hit && hit.head).toBe(true);
  });
});
