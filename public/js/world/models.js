import { scene } from '../render/scene.js';
import { addCollider } from './collision.js';

// ================= MODELS =================
// Buildings made in another tool (Blender, SketchUp, ...) and dropped into public/models/ as glTF binary (.glb).
// The file is drawn in metres with Y up, its origin at the middle of the footprint at ground level and
// its front facing +Z (glTF's own "front"; Blender exports a building that faces its Front view, -Y, that way).
// On load each model is turned into the city's look: Lambert materials with colours used as written,
// meshes merged into one per material, and any emissive material (lit windows, signs) fading in after dark.
// Collision comes from boxes named `collider...` in the file, or the model's bounding box when it has none.
export const MODEL_DIR = '/models/';
// GLTFLoader imports 'three'; index.html maps that to the same CDN build public/js/three.js loads
const JSM = 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/';
const cache = new Map(); // file -> Promise<model | null>
export const glowMaterials = new Set();
let tools;
const loadTools = () => tools || (tools = Promise.all([import(JSM + 'loaders/GLTFLoader.js'), import(JSM + 'utils/BufferGeometryUtils.js')])
  .then(([{ GLTFLoader }, { mergeGeometries }]) => ({ loader: new GLTFLoader(), mergeGeometries })));

// Load and prepare a model once; every later call shares it. Resolves to null when the file is missing or broken.
export function loadModel(file) {
  if (!cache.has(file)) cache.set(file, loadTools().then(async ({ loader, mergeGeometries }) => {
    const res = await fetch(MODEL_DIR + file);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const gltf = await loader.parseAsync(await res.arrayBuffer(), MODEL_DIR);
    return prepareModel(gltf.scene, mergeGeometries);
  }).catch(e => { console.warn(`model ${file} could not be loaded, using the fallback:`, e.message || e); return null; }));
  return cache.get(file);
}

const _c = new THREE.Color(), _b = new THREE.Box3();
// glTF stores colours linear; the game uses colours as written (sRGB values straight to the screen)
const toDisplay = c => c.convertLinearToSRGB();
function cityMaterial(src) {
  const m = new THREE.MeshLambertMaterial({
    name: src.name, color: toDisplay(src.color ? src.color.clone() : new THREE.Color(1, 1, 1)), map: src.map || null,
    vertexColors: !!src.vertexColors, emissive: toDisplay(src.emissive ? src.emissive.clone() : new THREE.Color(0)), emissiveMap: src.emissiveMap || null,
    emissiveIntensity: src.emissiveIntensity ?? 1, transparent: !!src.transparent, opacity: src.opacity ?? 1, alphaTest: src.alphaTest || 0, side: src.side ?? THREE.FrontSide,
  });
  for (const t of [m.map, m.emissiveMap]) if (t) { t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; }
  if (m.emissiveMap || m.emissive.r + m.emissive.g + m.emissive.b > 0) { m.userData.glow = m.emissiveIntensity; glowMaterials.add(m); }
  return m;
}
const MERGE_ATTRS = ['position', 'normal', 'uv', 'color'];
// Turn a loaded glTF scene into { group, colliders, triangles }: merged meshes and collider boxes in model space.
// colliders are [x0, x1, z0, z1, top] in metres.
export function prepareModel(root, mergeGeometries) {
  root.updateMatrixWorld(true);
  const boxes = [], buckets = new Map(), meshes = [];
  root.traverse(o => {
    if (/^collider/i.test(o.name)) { _b.setFromObject(o); boxes.push([_b.min.x, _b.max.x, _b.min.z, _b.max.z, _b.max.y]); o.userData.collider = true; }
  });
  root.traverse(o => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.userData.collider) return;
    meshes.push(o);
  });
  if (!boxes.length && meshes.length) {
    _b.makeEmpty(); for (const o of meshes) _b.expandByObject(o);
    boxes.push([_b.min.x, _b.max.x, _b.min.z, _b.max.z, _b.max.y]);
  }
  let triangles = 0;
  for (const o of meshes) {
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!MERGE_ATTRS.includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    if (!g.attributes.normal) g.computeVertexNormals();
    const col = g.attributes.color;
    if (col) for (let i = 0; i < col.count; i++) { toDisplay(_c.setRGB(col.getX(i), col.getY(i), col.getZ(i))); col.setXYZ(i, _c.r, _c.g, _c.b); }
    if (g.index) g = g.toNonIndexed();
    triangles += g.attributes.position.count / 3;
    const key = src.uuid + '|' + Object.keys(g.attributes).sort().join();
    if (!buckets.has(key)) buckets.set(key, { mat: cityMaterial(src), geos: [] });
    buckets.get(key).geos.push(g);
  }
  const group = new THREE.Group();
  for (const { mat, geos } of buckets.values()) {
    const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    if (merged) group.add(new THREE.Mesh(merged, mat));
    else for (const g of geos) group.add(new THREE.Mesh(g, mat));
  }
  return { group, colliders: boxes, triangles };
}

// Which way the model's +Z front turns to face the street: n, e, s or w (the same angle signs use in city.js).
export const FACE_YAW = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };
// a model-space box turned by quarter turns and moved to (cx, cz): returns [x0, x1, z0, z1]
export function turnBox([x0, x1, z0, z1], cx, cz, face) {
  const a = FACE_YAW[face], c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const xs = [], zs = [];
  for (const x of [x0, x1]) for (const z of [z0, z1]) { xs.push(cx + x * c + z * s); zs.push(cz - x * s + z * c); }
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
}
// Put a prepared model in the world at (cx, cz), front facing `face`, with its colliders. Returns the placed object.
export function placeModel(model, cx, cz, face) {
  const o = model.group.clone(); // shares the merged geometry and materials
  o.position.set(cx, 0, cz); o.rotation.y = FACE_YAW[face];
  o.updateMatrix(); o.matrixAutoUpdate = false; o.updateMatrixWorld(true);
  scene.add(o);
  for (const b of model.colliders) { const [x0, x1, z0, z1] = turnBox(b, cx, cz, face); addCollider(x0, x1, z0, z1, b[4], true); }
  return o;
}
// called by render/lighting.js with the darkness (0 day, 1 night): emissive parts glow faintly by day, fully at night
export function setModelNight(n) { for (const m of glowMaterials) m.emissiveIntensity = m.userData.glow * (0.25 + 0.75 * n); }
