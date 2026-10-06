import { scene } from '../render/scene.js';

// Black tyre marks left on the ground by sliding cars: one instanced strip per wheel per frame, the oldest
// reused once MAX are down.
const MAX = 800, W = 0.28;
const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
const mat = new THREE.MeshBasicMaterial({ color: '#141018', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
let marks = null, next = 0;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

// a strip from (x0, z0) to (x1, z1) lying on ground height y
export function skidMark(x0, z0, x1, z1, y) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 0.02 || len > 3) return;
  if (!marks) {
    marks = new THREE.InstancedMesh(geo, mat, MAX); marks.count = 0; marks.frustumCulled = false; marks.renderOrder = 1;
    scene.add(marks);
  }
  _m.compose(_p.set((x0 + x1) / 2, y + 0.012, (z0 + z1) / 2), _q.setFromAxisAngle(_y, Math.atan2(dx, dz)), _s.set(W, 1, len + 0.04));
  marks.setMatrixAt(next, _m); next = (next + 1) % MAX; marks.count = Math.min(MAX, marks.count + 1);
  marks.instanceMatrix.needsUpdate = true;
}
