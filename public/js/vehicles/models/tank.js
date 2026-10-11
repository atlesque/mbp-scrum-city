import { TANK_HP } from '../../data/tank.js';
import { buildTank } from '../tank.js';

// Uses the army tank's blocky hull and turret; excluded from civilian traffic and parking lots.
export default {
  id: 'tank', kind: 'tank', name: 'Army tank', short: 'Army tank', tag: 'tank', hp: TANK_HP,
  traffic: { weight: 0 }, engine: { voice: 'diesel', rev: 0.3, gears: [0, 3, 6, 10] },
  mesh() {
    const t = buildTank(), seat = new THREE.Group(); seat.position.set(0, 0.3, 1); t.grp.add(seat);
    return { ...t, m: t.meshes[0], seat, wheels: [], solid: t.meshes, lit: [] };
  },
};
