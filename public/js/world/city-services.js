import { GB, box } from '../render/geometry.js';
import { neonTexture } from '../render/textures.js';
import { scene } from '../render/scene.js';
import { addCollider } from './collision.js';

let delivery = null;
function ring(x, z, color, radius) {
  const m = new THREE.Mesh(new THREE.RingGeometry(radius - 0.22, radius, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.27, z); scene.add(m); return m;
}
export function moveDeliveryMarker(stop) {
  if (!delivery && !stop) return;
  if (!delivery) delivery = ring(0, 0, '#ffd23e', 5);
  delivery.visible = !!stop;
  if (stop) delivery.position.set(stop.x, 0.08, stop.z);
}
export function makeServiceMarker(s, type) {
  ring(s.x, s.z, s.color, 4.8);
  const g = new GB(), kioskX = s.x + 6, kioskZ = s.z - 4;
  box(g, 2, 2.8, 1.6, kioskX, 1.6, kioskZ, '#433451');
  box(g, 2.25, 0.2, 1.85, kioskX, 3.1, kioskZ, s.color);
  box(g, 1.4, 1, 0.1, kioskX, 2, kioskZ + 0.85, '#222236');
  if (type === 'courier') for (const dx of [-4, 4]) {
    box(g, 0.15, 4, 0.15, s.x + dx, 2, s.z - 3.8, '#433451');
    addCollider(s.x + dx - 0.08, s.x + dx + 0.08, s.z - 3.88, s.z - 3.72, 4, false);
  }
  if (type === 'garage') {
    // An open canopy, preserving room to enter from either side of the lot.
    box(g, 12, 0.3, 8, s.x, 5.2, s.z, '#f7a8c4');
    for (const dx of [-5.8, 5.8]) {
      box(g, 0.3, 5, 0.3, s.x + dx, 2.7, s.z - 3.7, s.color);
      addCollider(s.x + dx - 0.15, s.x + dx + 0.15, s.z - 3.85, s.z - 3.55, 5.2, false);
    }
  }
  const m = new THREE.Mesh(g.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(m);
  addCollider(kioskX - 1, kioskX + 1, kioskZ - 0.8, kioskZ + 0.8, 3.2, false);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: neonTexture(s.name, s.color, '"Bowlby One", Impact, sans-serif'), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  sign.position.set(s.x, type === 'garage' ? 4.9 : 4, s.z - 3.8); scene.add(sign);
}
