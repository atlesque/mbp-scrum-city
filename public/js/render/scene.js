import { $ } from '../core/util.js';

// ================= RENDERER / SCENE =================
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // as r128 drew it
$('stage').appendChild(renderer.domElement);
export const canvasEl = renderer.domElement;
export const scene = new THREE.Scene();
export const HORIZON = new THREE.Color('#f39a8f');
scene.background = HORIZON;
scene.fog = new THREE.Fog(HORIZON, 60, 290);
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
scene.add(camera);
const SUN_DIR = new THREE.Vector3(1, 0.13, 0.32).normalize();
// Lights are physically based since r155; the factor of PI keeps the brightness they had in r128.
// render/lighting.js fades the first three between sunset and night.
export const hemiLight = new THREE.HemisphereLight(0xffd8e8, 0x5c3c70, 0.85 * Math.PI); scene.add(hemiLight);
export const ambientLight = new THREE.AmbientLight(0x3c2c4c, 0.3 * Math.PI); scene.add(ambientLight);
export const sunLight = new THREE.DirectionalLight(0xffb27a, 0.9 * Math.PI); sunLight.position.copy(SUN_DIR).multiplyScalar(100); scene.add(sunLight);
export const muzzleLight = new THREE.PointLight(0xffcf7a, 0, 14, 2); scene.add(muzzleLight);
export const boomLight = new THREE.PointLight(0xff8a3a, 0, 60, 2); scene.add(boomLight);

export const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sunDir: { value: SUN_DIR }, cHor: { value: HORIZON }, cMid: { value: new THREE.Color('#c25a9c') }, cTop: { value: new THREE.Color('#2b1855') }, night: { value: 0 } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 sunDir; uniform vec3 cHor; uniform vec3 cMid; uniform vec3 cTop; uniform float night; varying vec3 vDir;
    void main(){ vec3 d = normalize(vDir); float h = d.y;
      vec3 col = mix(cHor, cMid, smoothstep(0.02, 0.22, h)); col = mix(col, cTop, smoothstep(0.22, 0.75, h));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      col += vec3(1.0, 0.55, 0.25) * pow(s, 10.0) * 0.55 * (1.0 - night);
      float disc = smoothstep(0.9965, 0.9975, s) * (1.0 - night);
      vec3 q = floor(d * 260.0); float star = step(0.9975, fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453));
      col += vec3(0.9, 0.85, 1.0) * star * night * smoothstep(0.08, 0.3, h);
      float stripes = step(0.5, fract((d.y - 0.06) * 90.0)) + step(0.14, d.y);
      col = mix(col, mix(vec3(1.0,0.83,0.42), vec3(1.0,0.4,0.55), smoothstep(0.2,0.0,d.y-0.05)), disc * clamp(stripes,0.0,1.0));
      gl_FragColor = vec4(col, 1.0); }`
}));
sky.renderOrder = -10; scene.add(sky);
