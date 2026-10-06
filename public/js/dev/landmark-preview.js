import '../three.js';
import { LANDMARK_MODELS, landmarkMats, landmarkModel } from '../world/landmark-models/index.js';
import { triangles } from '../world/landmark-models/kit.js';

// Preview page for the detailed landmark models: /dev/landmarks.html?b=vac&view=1&night&shot
// b picks the building, view a preset camera (or drag to orbit), night switches the lights, shot hides the UI.
const q = new URLSearchParams(location.search);
const type = LANDMARK_MODELS[q.get('b')] ? q.get('b') : 'vac', night = q.has('night');
if (q.has('shot')) document.body.classList.add('shot');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(night ? '#141a33' : '#b9d3ea');
scene.background = SKY; scene.fog = new THREE.Fog(SKY, 250, 700);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 2000);

scene.add(new THREE.HemisphereLight(night ? 0x5a6aa0 : 0xdfeaf5, night ? 0x221f2c : 0x6d665c, (night ? 0.6 : 0.9) * Math.PI));
const sun = new THREE.DirectionalLight(night ? 0x8090c0 : 0xfff1dc, (night ? 0.12 : 0.75) * Math.PI); sun.position.set(-60, 90, -40); scene.add(sun);

// the block's surroundings: streets and pavements around the 32 x 32 m lot, as in the city
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: night ? '#3a3a40' : '#8a8a86' }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const flat = (w, d, y, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshLambertMaterial({ color: col })); m.position.y = y; scene.add(m); return m; };
flat(52, 52, 0.02, night ? '#26262c' : '#55555a'); flat(35, 35, 0.08, night ? '#5a5a60' : '#c4c0b8');

const model = landmarkModel(type); scene.add(model);
if (night) landmarkMats().lit.emissiveIntensity = 1;
const box = new THREE.Box3().setFromObject(model), H = box.max.y;
document.getElementById('info').textContent = `${LANDMARK_MODELS[type].name} · ${triangles(model).toLocaleString()} triangles · ${H.toFixed(0)} m · drag to orbit, scroll to zoom`;

// preset views: [azimuth from the street front (deg), elevation (deg), distance factor, target height factor]
const VIEWS = [[-35, 4, 1.25, 0.42], [40, 14, 1.35, 0.4], [150, 32, 1.6, 0.25], [0, 2, 1.1, 0.4]];
const qv = (q.get('view') || '0').split(',').map(Number); // a preset index, or az,el,dist,th for any view
let [az, el, dist, th] = qv.length === 4 ? qv : VIEWS[qv[0]] || VIEWS[0];
const R0 = Math.max(H, 40) * 1.2;
function place() {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el), r = R0 * dist;
  camera.position.set(Math.sin(a) * Math.cos(e) * r, Math.max(1.7, Math.sin(e) * r), -Math.cos(a) * Math.cos(e) * r);
  camera.lookAt(0, H * th, 0);
}
let drag = null;
addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => { if (!drag) return; az += (e.clientX - drag[0]) * 0.3; el = Math.min(85, Math.max(1, el + (e.clientY - drag[1]) * 0.2)); drag = [e.clientX, e.clientY]; });
addEventListener('wheel', e => { dist = Math.min(4, Math.max(0.4, dist * (1 + e.deltaY * 0.001))); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const ui = document.getElementById('ui');
for (const k of Object.keys(LANDMARK_MODELS)) for (const [label, extra] of [['', ''], [' night', '&night']]) {
  const b = document.createElement('button'); b.textContent = LANDMARK_MODELS[k].name.split(' (')[0] + label;
  if (k === type && night === !!extra) b.className = 'on';
  b.onclick = () => { location.search = `?b=${k}${extra}`; }; ui.appendChild(b);
}
let frames = 0;
renderer.setAnimationLoop(() => { place(); renderer.render(scene, camera); if (++frames === 2) window.__ready = true; });
