// Writes public/models/test-building.glb: a tiny two-storey corner shop used by the tests, and a worked example
// of the model format world/models.js expects (metres, Y up, origin at the footprint's middle on the ground,
// front facing +Z, lit windows as their own emissive material, a `collider` box).
// Run with `node tests/make-test-model.mjs`.
import { writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter reads its output through FileReader, which Node lacks
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend?.(); }); } readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); }); } };

// glTF colours are linear: write the sRGB colours we mean as linear values
const col = hex => new THREE.Color(hex).convertSRGBToLinear();
const mat = (name, hex, extra = {}) => new THREE.MeshStandardMaterial({ name, color: col(hex), roughness: 1, metalness: 0, ...extra });
const walls = mat('Walls', '#f2b8a0'), roof = mat('Roof', '#6d5a6e'), door = mat('Door', '#3a3446');
const lit = mat('Windows_lit', '#2b3550', { emissive: col('#ffd890') });
const root = new THREE.Group(); root.name = 'TestBuilding';
const add = (name, m, w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.name = name; o.position.set(x, y, z); root.add(o); return o; };
add('Body', walls, 12, 7, 10, 0, 3.5, 0);
add('RoofSlab', roof, 12.6, 0.5, 10.6, 0, 7.25, 0);
add('Door', door, 1.6, 2.4, 0.2, -3.5, 1.2, 5.05);
for (const x of [-3.5, 0, 3.5]) add('UpperWindow', lit, 2.2, 1.6, 0.2, x, 5, 5.05);
add('ShopWindow', lit, 5, 2, 0.2, 1.8, 1.6, 5.05);
// a striped awning over the shop window, coloured per vertex
const awning = new THREE.BoxGeometry(6, 0.15, 1.6, 6, 1, 1).toNonIndexed(), pos = awning.attributes.position, colours = [];
for (let i = 0; i < pos.count; i += 3) { const stripe = Math.floor((pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 + 3) % 2 ? '#ff6fae' : '#fff6ee', c = col(stripe); for (let k = 0; k < 3; k++) colours.push(c.r, c.g, c.b); }
awning.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
const aw = new THREE.Mesh(awning, mat('Awning', '#ffffff', { vertexColors: true })); aw.name = 'Awning'; aw.position.set(1.8, 3, 5.9); root.add(aw);
// what the player bumps into: the body without the awning and roof overhang
add('collider', new THREE.MeshBasicMaterial({ name: 'Collider' }), 12, 7.5, 10, 0, 3.75, 0);

const glb = await new GLTFExporter().parseAsync(root, { binary: true });
const out = new URL('../public/models/test-building.glb', import.meta.url);
await writeFile(out, Buffer.from(glb));
console.log('wrote', out.pathname, glb.byteLength, 'bytes');
