// Small procedural models; each event owns and disposes its meshes and materials.
const mat = (color, glow = false, opacity = 1) => glow
  ? new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1, side: THREE.DoubleSide })
  : new THREE.MeshLambertMaterial({ color, flatShading: true });
function mesh(g, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); g.add(m); return m;
}
const box = (g, m, w, h, d, x, y, z) => mesh(g, new THREE.BoxGeometry(w, h, d), m, x, y, z);
export function eventModel(id) {
  const g = new THREE.Group(), parts = {};
  if (id === 'ufo') {
    const metal = mat('#7c91ab'), green = mat('#66ffab', true);
    mesh(g, new THREE.CylinderGeometry(4, 11, 2.5, 24), metal);
    mesh(g, new THREE.SphereGeometry(4, 16, 8), mat('#83ffcd', true, .65), 0, 2, 0).scale.y = .6;
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; mesh(g, new THREE.SphereGeometry(.55, 6, 4), green, Math.cos(a) * 8, -1, Math.sin(a) * 8); }
    parts.beam = mesh(g, new THREE.CylinderGeometry(.8, 6, 1, 20, 1, true), mat('#68ffc0', true, .22));
  } else if (id === 'godzilla') {
    const skin = mat('#263f40'), belly = mat('#607f77'), blue = mat('#46dfff', true);
    mesh(g, new THREE.SphereGeometry(1, 10, 8), skin, 0, 22, 0).scale.set(8, 15, 6);
    box(g, belly, 9, 16, 2, 0, 23, 5);
    box(g, skin, 10, 9, 12, 0, 37, 3); box(g, skin, 9, 4, 8, 0, 33, 9);
    for (const x of [-5, 5]) {
      box(g, skin, 7, 13, 7, x, 8, 0); box(g, skin, 7, 4, 12, x, 2, 3);
      const arm = box(g, skin, 3, 11, 4, x * 1.7, 25, 4); arm.rotation.x = -.7;
      box(g, blue, 1, 1.4, 1, x * .78, 39, 9.1);
      for (const xx of [-2, 0, 2]) box(g, mat('#c7d8cb'), 1, 1.4, 2, x + xx, 1, 9);
    }
    parts.plates = new THREE.Group(); g.add(parts.plates);
    for (let i = 0; i < 8; i++) {
      const p = mesh(parts.plates, new THREE.ConeGeometry(3.8 - i * .25, 7, 4), blue, 0, 34 - i * 3.1, -5.5 - i * .55); p.rotation.x = -.9;
    }
    const tail = mesh(g, new THREE.ConeGeometry(5, 27, 8), skin, 0, 8, -17); tail.rotation.x = -Math.PI / 2.6;
    parts.breath = mesh(g, new THREE.CylinderGeometry(1.2, 4, 1, 12, 1, true), mat('#36adff', true, .65));
    parts.core = mesh(g, new THREE.CylinderGeometry(.5, 1.5, 1, 10), mat('#d7ffff', true));
    parts.breath.visible = parts.core.visible = false;
  } else if (id === 'tsunami') {
    mesh(g, new THREE.BoxGeometry(17, 13, 430), mat('#24b4d1', true, .7), 0, 6, 0);
    const lip = mesh(g, new THREE.CylinderGeometry(4, 4, 430, 10), mat('#b9f9ff', true, .9), -6, 12, 0); lip.rotation.x = Math.PI / 2;
    for (let i = 0; i < 24; i++) box(g, mat('#efffff', true, .65), 5, 1.3, 9, -9, 1, -205 + i * 18);
  } else if (id === 'volcano') {
    mesh(g, new THREE.CylinderGeometry(7, 23, 22, 12, 1, true), mat('#4a313b'), 0, 11, 0);
    const lava = mesh(g, new THREE.CircleGeometry(7, 24), mat('#ff6a18', true), 0, 21, 0); lava.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const flow = box(g, mat('#ff5c12', true), 1.4, 25, .45, Math.sin(a) * 12, 11, Math.cos(a) * 12);
      flow.rotation.set(Math.cos(a) * .6, a, -Math.sin(a) * .6);
    }
  } else if (id === 'tornado') {
    parts.rings = [];
    const cloud = mat('#9e92b1', true, .5);
    for (let i = 0; i < 12; i++) {
      const ring = mesh(g, new THREE.TorusGeometry(2 + i * .9, 1.4, 5, 16), cloud, 0, 2 + i * 3, 0);
      ring.rotation.x = Math.PI / 2; parts.rings.push(ring);
    }
    for (let i = 0; i < 12; i++) { const a = i * 2.4; box(g, mat('#55475d'), 1.3, 1.5, 2, Math.sin(a) * 8, 3 + i * 2, Math.cos(a) * 8); }
  }
  return { g, ...parts };
}
export function fallingRock(g, lava = false) {
  const rock = mesh(g, new THREE.IcosahedronGeometry(lava ? 1 : 2, 0), mat(lava ? '#ff7625' : '#ffad56', true));
  const ring = mesh(g, new THREE.RingGeometry(4.5, 5, 24), mat('#ff633d', true, .65));
  ring.rotation.x = -Math.PI / 2;
  return { rock, ring };
}
export function disposeEvent(g) {
  const geos = new Set(), mats = new Set();
  g.traverse(o => { if (o.geometry) geos.add(o.geometry); if (o.material) mats.add(o.material); });
  for (const geo of geos) geo.dispose(); for (const material of mats) material.dispose();
  g.removeFromParent();
}
export function beamBetween(mesh, from, to) {
  const d = new THREE.Vector3().subVectors(to, from);
  mesh.position.copy(from).addScaledVector(d, .5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  mesh.scale.y = d.length();
}
