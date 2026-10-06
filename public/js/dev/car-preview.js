import '../three.js';
import '../vehicles/vehicle.js'; // first, as in the game: the car kind and the game modules import each other
import { car } from '../vehicles/kinds/car.js';
import { VEHICLE_MODELS } from '../vehicles/models/index.js';
import { makeCharacter, randomLook } from '../characters/character.js';

// Preview page for the car models: /dev/cars.html?car=bmw5&view=1&night&shot
// car picks the model, view a preset camera (or az,el,dist), night dims the lights, shot hides the UI. Drag to orbit.
// driver seats the player at the wheel (driver=afro: a passer-by with the tallest hair).
const q = new URLSearchParams(location.search);
const cars = Object.values(VEHICLE_MODELS).filter(m => m.kind === 'car');
const M = VEHICLE_MODELS[q.get('car')] || cars[cars.length - 1], night = q.has('night'), neutral = q.has('neutral');
if (q.has('shot')) document.body.classList.add('shot');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? '#141a33' : '#c9dbe9');
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
// the city's daytime lights (render/scene.js), dimmed at night; `neutral` swaps them for plain white daylight,
// for comparing paint colours with photos
if (neutral) scene.add(new THREE.HemisphereLight(0xf2f4f8, 0x55534f, 0.95 * Math.PI));
else scene.add(new THREE.HemisphereLight(night ? 0x5a6aa0 : 0xffd8e8, night ? 0x221f2c : 0x5c3c70, (night ? 0.35 : 0.85) * Math.PI), new THREE.AmbientLight(0x3c2c4c, 0.3 * Math.PI));
const sun = new THREE.DirectionalLight(neutral ? 0xffffff : night ? 0x8090c0 : 0xffb27a, (night ? 0.1 : neutral ? 0.7 : 0.9) * Math.PI); sun.position.set(40, 60, 50); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: night ? '#2a2a30' : '#77777c' }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

const mesh = M.mesh(); scene.add(mesh.grp);
const PLAYER = { skin: '#eab48f', shirt: '#2fb8c9', pa: '#ff6fae', pb: '#f6f1e7', pants: '#f4f0e6', hair: '#3a2416', hairStyle: 'mullet', glasses: true, shoes: '#f6f1e7' }; // as in main.js
if (q.has('driver')) car.seat({ mesh }, makeCharacter(q.get('driver') === 'afro' ? { ...randomLook(), hairStyle: 'afro' } : PLAYER));
const parts = [mesh.m, mesh.win, mesh.lamps, ...(mesh.wheels || [])].filter(Boolean).map(m => m.geometry.attributes.position.count / 3), tris = parts.reduce((s, n) => s + n, 0);
document.getElementById('info').textContent = `${M.name} (${M.id}) · ${tris.toLocaleString()} triangles (${parts.join(" + ")}) · drag to orbit, scroll to zoom`;

// preset views: [azimuth from the nose (deg), elevation (deg), distance]
const VIEWS = [[-38, 10, 7.5], [-142, 12, 7.5], [-90, 2, 8], [0, 4, 6.5], [180, 6, 6.5], [-30, 40, 8]];
const qv = (q.get('view') || '0').split(',').map(Number);
let [az, el, dist] = qv.length === 3 ? qv : VIEWS[qv[0]] || VIEWS[0];
function place() {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  camera.position.set(Math.sin(a) * Math.cos(e) * dist, 0.75 + Math.sin(e) * dist, Math.cos(a) * Math.cos(e) * dist);
  camera.lookAt(0, 0.7, 0);
}
let drag = null;
addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => { if (!drag) return; az -= (e.clientX - drag[0]) * 0.4; el = Math.min(85, Math.max(-5, el + (e.clientY - drag[1]) * 0.25)); drag = [e.clientX, e.clientY]; });
addEventListener('wheel', e => { dist = Math.min(30, Math.max(3, dist * (1 + e.deltaY * 0.001))); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const ui = document.getElementById('ui');
for (const c of cars) {
  const b = document.createElement('button'); b.textContent = c.id; if (c === M) b.className = 'on';
  b.onclick = () => { location.search = `?car=${c.id}${night ? '&night' : ''}${neutral ? '&neutral' : ''}${q.has('driver') ? '&driver=' + q.get('driver') : ''}`; }; ui.appendChild(b);
}
let frames = 0;
renderer.setAnimationLoop(() => { place(); renderer.render(scene, camera); if (++frames === 2) window.__ready = true; });
