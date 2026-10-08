// The game loads Three.js from the CDN and sets it as a global (public/js/three.js); give the modules the same global here.
import * as THREE from 'three';
import { vi } from 'vitest';

globalThis.THREE = THREE;

// Modules that need a browser (WebGL, canvas, the page) are swapped for inert stand-ins,
// so the data and rules around them can be tested in Node.
const stubTexture = () => new THREE.MeshBasicMaterial();
// a canvas whose 2D context takes any drawing call and does nothing (bike decals draw their lettering on one)
const stubCanvas = (width, height) => ({ width, height, getContext: () => new Proxy({}, { get: (o, k) => k in o ? o[k] : () => ({ width: 0 }) }) });
vi.mock('../../public/js/render/scene.js', () => ({
  scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: {}, canvasEl: {},
  sky: new THREE.Object3D(), muzzleLight: new THREE.PointLight(), boomLight: new THREE.PointLight(),
}));
vi.mock('../../public/js/render/textures.js', () => ({
  makeCanvas: stubCanvas, windowTextures: () => ({}), shirtMat: stubTexture, neonTexture: () => null, crossTexture: () => null,
  glyphSprite: () => new THREE.Object3D(),
}));
vi.mock('../../public/js/ui/hud.js', () => ({ updateHUD() {}, toast() {}, showBig() {}, showRadio() {}, drawWeaponIcon() {} }));
