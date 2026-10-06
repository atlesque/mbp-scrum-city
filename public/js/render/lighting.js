import { G, P } from '../core/state.js';
import { clamp, lerp } from '../core/util.js';
import { all } from '../entities/registry.js';
import { lamps, lightWindows, winMat } from '../world/city.js';
import { lampsVersion } from '../world/props.js';
import { setModelNight } from '../world/models.js';
import { makeCanvas } from './textures.js';
import { HORIZON, ambientLight, camera, hemiLight, scene, sky, sunLight } from './scene.js';

// ================= LIGHTING =================
// The city drifts from sunset into night and back. As it darkens, street lamps and headlights come on,
// more windows light up and the sky fills with stars.
//
// Every lamp and headlight gets a cheap additive glow on the ground; only the few nearest the camera
// get a real light. Those lights are hidden in daylight, so the sunset city costs no more to draw than
// before; materials recompile once as the lamps come on at dusk and once as they go off at dawn.
const CYCLE = 420; // seconds for a full sunset -> night -> sunset loop
const LAMP_LIGHTS = 4, CAR_LIGHTS = 2, MAX_CARS = 48;
// point lights fall off with the square of distance; these give about the brightness of the hemisphere
// light on the ground 6 m below a lamp and 3 m in front of a car
const LAMP_I = 45, CAR_I = 22, BEAM_I = 260;

let clock = CYCLE * 0.15, forced = null, night = 0;
export const lighting = {
  get night() { return night; },
  // pin the time of day (0 sunset, 1 night) or pass null to let it run; for testing and the debug console
  set(n) { forced = n; },
  // how many real lamp lights are on and how many vehicles show headlight beams
  get lit() { return { lamps: lampSlots.filter(s => s.l.intensity > 0).length, beams: carPools.count }; },
};
// share of the loop spent dark: sunset until 0.35, dusk to 0.45, night until 0.85, dawn to 0.95
function darkness(p) { return clamp(Math.min((p - 0.35) / 0.1, (0.95 - p) / 0.1), 0, 1); }
const smooth = t => t * t * (3 - 2 * t);

const DAY = { hor: new THREE.Color('#f39a8f'), mid: new THREE.Color('#c25a9c'), top: new THREE.Color('#2b1855'), sky: new THREE.Color(0xffd8e8), gnd: new THREE.Color(0x5c3c70), amb: new THREE.Color(0x3c2c4c), sun: new THREE.Color(0xffb27a) };
const NIGHT = { hor: new THREE.Color('#3b2252'), mid: new THREE.Color('#1d1440'), top: new THREE.Color('#07051a'), sky: new THREE.Color(0x7a78c8), gnd: new THREE.Color(0x2a1c3c), amb: new THREE.Color(0x2a2050), sun: new THREE.Color(0x8c9cff) };

function glowTexture(stretch) {
  const S = 128, c = makeCanvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  if (stretch) { x.globalCompositeOperation = 'destination-in'; const f = x.createLinearGradient(0, 0, 0, S); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.75, 'rgba(0,0,0,1)'); x.fillStyle = f; x.fillRect(0, 0, S, S); }
  return new THREE.CanvasTexture(c);
}
const glowMat = (map, color) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 });
function flatQuad(w, l) { const g = new THREE.PlaneGeometry(w, l); g.rotateX(-Math.PI / 2); return g; }

let lampPools, lampsSeen = 0, carPools, carFlares, lampSlots, carSlots, beam;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _f = new THREE.Vector3();

export function buildLighting() {
  // a pool of light on the pavement under every lamp: one draw call for the whole city
  lampPools = new THREE.InstancedMesh(flatQuad(13, 13), glowMat(glowTexture(false), 0xffc98a), lamps.length);
  lamps.forEach((L, i) => { _m.makeTranslation(L.x, 0.17, L.z); lampPools.setMatrixAt(i, _m); });
  lampPools.frustumCulled = false; scene.add(lampPools);
  // headlight beams on the road and the glare of the lamps themselves, seen from the front
  carPools = new THREE.InstancedMesh(flatQuad(6, 14), glowMat(glowTexture(true), 0xfff0c8), MAX_CARS);
  carFlares = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9), glowMat(glowTexture(false), 0xfff6d8), MAX_CARS * 2);
  for (const m of [carPools, carFlares]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
  const point = () => { const l = new THREE.PointLight(0xffd29a, 0, 24, 2); scene.add(l); return { l, at: null, k: 0 }; };
  lampSlots = Array.from({ length: LAMP_LIGHTS }, point);
  carSlots = Array.from({ length: CAR_LIGHTS }, () => { const s = point(); s.l.color.set(0xfff0d0); s.l.distance = 16; return s; });
  // the player's own headlights throw a proper beam
  beam = new THREE.SpotLight(0xfff2d6, 0, 50, 0.5, 0.6, 2); scene.add(beam, beam.target);
}

// keep the lights on the wanted sources, fading out the ones that lost their place before moving them
function assign(slots, wanted, dt, pos) {
  for (const s of slots) {
    s.k = clamp(s.k + (s.at && wanted.includes(s.at) ? dt : -dt) * 5, 0, 1);
    if (s.k === 0) s.at = null;
  }
  for (const w of wanted) if (!slots.some(s => s.at === w)) { const s = slots.find(q => !q.at); if (s) s.at = w; }
  for (const s of slots) { if (s.at) pos(s.l, s.at); }
}
function nearest(list, x, z, n, key) {
  return list.map(o => [o, (key ? key(o).x : o.x) - x, (key ? key(o).z : o.z) - z]).map(([o, dx, dz]) => [o, dx * dx + dz * dz]).sort((a, b) => a[1] - b[1]).slice(0, n).map(a => a[0]);
}

export function updateLighting(dt) {
  clock = (clock + dt) % CYCLE;
  night = forced != null ? forced : smooth(darkness(clock / CYCLE));
  const n = night;
  HORIZON.copy(DAY.hor).lerp(NIGHT.hor, n); scene.fog.color.copy(HORIZON); // HORIZON is also the background
  sky.material.uniforms.cMid.value.copy(DAY.mid).lerp(NIGHT.mid, n);
  sky.material.uniforms.cTop.value.copy(DAY.top).lerp(NIGHT.top, n);
  sky.material.uniforms.night.value = n;
  hemiLight.color.copy(DAY.sky).lerp(NIGHT.sky, n); hemiLight.groundColor.copy(DAY.gnd).lerp(NIGHT.gnd, n);
  hemiLight.intensity = lerp(0.85, 0.32, n) * Math.PI;
  ambientLight.color.copy(DAY.amb).lerp(NIGHT.amb, n); ambientLight.intensity = lerp(0.3, 0.2, n) * Math.PI;
  sunLight.color.copy(DAY.sun).lerp(NIGHT.sun, n); sunLight.intensity = lerp(0.9, 0.22, n) * Math.PI;
  winMat.emissiveIntensity = 1 + n * 0.5;
  lightWindows(0.22 + n * 0.4);
  setModelNight(n);

  // lamps switch on at dusk; the real lights go to the lamps nearest a point just ahead of the camera
  const on = clamp((n - 0.15) / 0.3, 0, 1);
  lampPools.material.opacity = 0.3 * on;
  // a knocked-down lamp (world/props.js) leaves no pool of light behind
  if (lampsSeen !== lampsVersion) {
    lampsSeen = lampsVersion;
    lamps.forEach((L, i) => { _m.makeTranslation(L.x, 0.17, L.z); if (L.dead) _m.scale(_s.set(0, 0, 0)); lampPools.setMatrixAt(i, _m); }); _s.set(1, 1, 1);
    lampPools.instanceMatrix.needsUpdate = true;
  }
  _f.set(0, 0, -1).applyQuaternion(camera.quaternion); _f.y = 0; _f.normalize();
  const fx = camera.position.x + _f.x * 12, fz = camera.position.z + _f.z * 12;
  assign(lampSlots, on > 0 ? nearest(lamps.filter(L => !L.dead), fx, fz, LAMP_LIGHTS) : [], dt, (l, L) => l.position.set(L.x, L.y, L.z));
  for (const s of lampSlots) s.l.intensity = LAMP_I * on * s.k;
  const shown = on > 0;
  if (lampSlots[0].l.visible !== shown) for (const l of [...lampSlots, ...carSlots].map(s => s.l).concat(beam)) l.visible = shown;

  // headlights on everything with someone at the wheel
  const cars = [];
  if (on > 0) for (const v of all('vehicle')) if (v.driver && !v.dead && Math.abs(v.x - P.x) < 160 && Math.abs(v.z - P.z) < 160) cars.push(v);
  carPools.material.opacity = 0.35 * on; carFlares.material.opacity = 0.9 * on;
  let pi = 0, fi = 0;
  for (const v of cars) {
    if (pi >= MAX_CARS) break;
    const bike = v.model.kind === 'bike', sy = Math.sin(v.yaw), cy = Math.cos(v.yaw), front = bike ? 1.1 : 2.2;
    _q.setFromAxisAngle(_e.set(0, 1, 0), v.yaw);
    _m.compose(_p.set(v.x + sy * (front + 7), 0.18, v.z + cy * (front + 7)), _q, _s.set(bike ? 0.7 : 1, 1, 1)); carPools.setMatrixAt(pi++, _m);
    for (const side of bike ? [0] : [-0.62, 0.62]) {
      _m.compose(_p.set(v.x + sy * (front + 0.05) + cy * side, bike ? 1.05 : 0.72, v.z + cy * (front + 0.05) - sy * side), _q, _s.set(1, 1, 1)); carFlares.setMatrixAt(fi++, _m);
    }
  }
  carPools.count = pi; carFlares.count = fi;
  carPools.instanceMatrix.needsUpdate = carFlares.instanceMatrix.needsUpdate = true;

  const mine = P.vehicle && cars.includes(P.vehicle) ? P.vehicle : null;
  const ahead = v => { const f = v.model.kind === 'bike' ? 1.1 : 2.2; return { x: v.x + Math.sin(v.yaw) * (f + 3), z: v.z + Math.cos(v.yaw) * (f + 3) }; };
  assign(carSlots, nearest(cars.filter(v => v !== mine), P.x, P.z, CAR_LIGHTS, ahead), dt, (l, v) => { const a = ahead(v); l.position.set(a.x, 1.1, a.z); });
  for (const s of carSlots) s.l.intensity = CAR_I * on * s.k;
  if (mine) {
    const sy = Math.sin(mine.yaw), cy = Math.cos(mine.yaw), f = mine.model.kind === 'bike' ? 1.1 : 2.2;
    beam.position.set(mine.x + sy * f, 1.0, mine.z + cy * f); beam.target.position.set(mine.x + sy * (f + 18), 0, mine.z + cy * (f + 18));
  }
  beam.intensity = mine ? BEAM_I * on : 0;
}
