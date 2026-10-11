import { charMat } from '../../characters/character.js';
import { GB, UNIT, box, hexa, addGeo } from '../../render/geometry.js';

export default {
  id: 'jet', kind: 'jet', name: 'Ghost fighter', short: 'Ghost fighter', tag: 'fighter', hp: 1600,
  traffic: { weight: 0 }, engine: { rev: 1, gears: [0, 18, 36, 50] },
  mesh() {
    const g = new GB(), grey = '#697684', dark = '#292f3c';
    box(g, 1.3, 0.9, 8.8, 0, 0.5, -0.3, grey);
    hexa(g, [[-0.65, 0.05, 3.8], [0.65, 0.05, 3.8], [0.65, 0.95, 3.8], [-0.65, 0.95, 3.8],
      [-0.05, 0.4, 6], [0.05, 0.4, 6], [0.05, 0.55, 6], [-0.05, 0.55, 6]], grey);
    for (const side of [-1, 1]) {
      box(g, 5.2, 0.15, 2.1, side * 2.9, 0.35, -0.7, grey, side * 0.4);
      box(g, 2.4, 0.12, 1.3, side * 1.7, 0.65, -3.8, grey, side * 0.25);
      box(g, 0.4, 0.4, 2.8, side * 1.1, 0.2, -2.8, dark);
      box(g, 0.18, 0.18, 2.2, side * 2.8, 0.15, -0.5, '#d3d3cc');
      addGeo(g, UNIT, side * 0.6, 1.4, -3.6, 0.15, 1.9, 1.7, 0, 0, side * 0.2, grey);
      box(g, 0.5, 0.5, 0.14, side * 1.1, 0.2, -4.25, '#ff9d49');
    }
    const grp = new THREE.Group(), body = new THREE.Mesh(g.geometry(), charMat); grp.add(body);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 2), new THREE.MeshPhongMaterial({ color: '#91c5dc', transparent: true, opacity: 0.55 }));
    canopy.position.set(0, 1.2, 1.6); grp.add(canopy);
    const gear = new THREE.Group(); grp.add(gear);
    const gg = new GB();
    for (const [x, z] of [[0, 2.8], [-1, -1.8], [1, -1.8]]) {
      box(gg, 0.12, 0.5, 0.12, x, -0.3, z, '#b1b7bb'); box(gg, 0.24, 0.35, 0.5, x, -0.62, z, '#252631');
    }
    gear.add(new THREE.Mesh(gg.geometry(), charMat));
    const seat = new THREE.Group(); seat.position.set(0, 0.2, 1.7); seat.scale.setScalar(0.65); grp.add(seat);
    return { grp, body, gear, seat, solid: [body], lit: [] };
  },
};
