// Three.js comes from the CDN as an ES module. The game's modules use it as the global `THREE`,
// so main.js imports this file first and everything after it sees the global.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js';

// Keep the r128 look: colours are used as written, with no sRGB conversion on the way in or out.
THREE.ColorManagement.enabled = false;
globalThis.THREE = THREE;
