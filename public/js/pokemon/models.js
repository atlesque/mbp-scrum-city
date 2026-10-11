import { GB, box } from '../render/geometry.js';
import { SPECIES } from './team.js';

// All geometry is made from the same flat-shaded boxes as the city. +Z is forward.
export function makePokemon(species) {
  const def = SPECIES[species], family = def.family, g = new GB();
  const b = (x, y, z, w, h, d, color = def.color) => box(g, w, h, d, x, y, z, color);
  if (['caterpie', 'weedle', 'oddish', 'psyduck', 'sandshrew', 'diglett', 'magnemite'].includes(family)) {
    const eyes = (x, y, z, gap = 0.18) => {
      for (const side of [-1, 1]) { b(x + side * gap, y, z, 0.12, 0.18, 0.05, '#24283c'); b(x + side * gap - 0.02, y + 0.04, z + 0.03, 0.04, 0.05, 0.02, '#fff8ee'); }
    };
    if (family === 'caterpie' || family === 'weedle') {
      if (def.stage === 1) {
        for (let i = 0; i < 4; i++) { b(0, 0.35 + i * 0.07, 0.45 - i * 0.4, 0.5 - i * 0.04, 0.5, 0.48); for (const side of [-1, 1]) b(side * 0.28, 0.1, 0.45 - i * 0.4, 0.16, 0.18, 0.2, def.accent); }
        b(0, 0.7, 0.5, 0.65, 0.65, 0.6); eyes(0, 0.8, 0.82);
        b(0, 1.14, 0.5, 0.13, 0.34, 0.13, family === 'weedle' ? '#fff5df' : '#ed6c70');
        if (family === 'caterpie') for (const side of [-1, 1]) b(side * 0.15, 1.28, 0.5, 0.25, 0.12, 0.13, '#ed6c70');
        else b(0, 0.7, 0.85, 0.25, 0.2, 0.12, def.accent);
      } else if (def.stage === 2) {
        b(0, 0.85, 0, 0.62, 1.55, 0.55); b(0, 0.8, 0.29, 0.8, 0.25, 0.1, def.accent); eyes(0, 1.2, 0.3);
        b(0, 0.19, 0, 0.4, 0.3, 0.4);
      } else {
        b(0, 1.05, 0, 0.45, 1.1, 0.5); b(0, 1.66, 0.1, 0.6, 0.5, 0.55); eyes(0, 1.7, 0.4);
        for (const side of [-1, 1]) {
          b(side * 0.23, 2.02, 0.1, 0.09, 0.35, 0.09, '#343447');
          b(side * 0.72, 1.35, -0.1, 0.95, family === 'caterpie' ? 1.3 : 0.65, 0.13, family === 'caterpie' ? '#eee5f3' : '#dceaf2');
          b(side * 0.68, 0.65, -0.1, 0.75, 0.52, 0.13, def.accent);
          b(side * 0.2, 0.3, 0, 0.16, 0.4, 0.2);
          if (family === 'weedle') { b(side * 0.55, 0.95, 0.45, 0.15, 0.18, 0.65, '#fff5df'); b(0, 1.0, 0.26, 0.46, 0.15, 0.04, '#343447'); }
          else b(side * 0.74, 1.4, -0.01, 0.6, 0.8, 0.04, '#c6b9da');
        }
      }
    } else if (family === 'oddish') {
      b(0, 0.65, 0, 0.85, 0.85, 0.75); eyes(0, 0.75, 0.4);
      for (const side of [-1, 1]) b(side * 0.25, 0.15, 0.1, 0.24, 0.3, 0.4);
      if (def.stage === 1) for (const [x, z] of [[0, 0], [-0.35, 0], [0.35, 0], [0, -0.3], [0, 0.3]]) b(x, 1.35, z, 0.2, x ? 0.6 : 0.9, 0.3, def.accent);
      else {
        for (const [x, z] of [[-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4]]) b(x, 1.35, z, def.stage === 3 ? 0.95 : 0.55, 0.35, def.stage === 3 ? 0.95 : 0.55, def.stage === 3 ? '#dc6474' : '#c17854');
        b(0, 1.5, 0, 0.45, 0.22, 0.45, '#f3d878');
        if (def.stage === 2) b(0.2, 0.48, 0.42, 0.1, 0.35, 0.08, '#b8e0ed');
      }
    } else if (family === 'diglett') {
      const heads = def.stage === 1 ? [[0, 0, 0.9]] : [[-0.4, 0, 0.9], [0.4, 0, 1.1], [0, -0.4, 1.4]];
      for (const [x, z, h] of heads) { b(x, h / 2 + 0.1, z, 0.6, h, 0.6); eyes(x, h - 0.12, z + 0.32, 0.14); b(x, h - 0.35, z + 0.37, 0.3, 0.17, 0.15, def.accent); }
      b(0, 0.1, 0, def.stage === 1 ? 0.95 : 1.6, 0.2, def.stage === 1 ? 0.8 : 1.3, '#968273');
    } else if (family === 'magnemite') {
      const cores = def.stage === 1 ? [[0, 1.0]] : [[0, 1.6], [-0.55, 0.65], [0.55, 0.65]];
      for (const [x, y] of cores) {
        b(x, y, 0, 0.65, 0.65, 0.65); b(x, y, 0.34, 0.33, 0.33, 0.04, '#f1f4ef'); b(x, y, 0.38, 0.1, 0.16, 0.03, '#24283c');
        b(x, y + 0.43, 0, 0.12, 0.25, 0.12, '#718492'); b(x, y + 0.54, 0, 0.3, 0.07, 0.15, '#dce5e7');
        for (const side of [-1, 1]) { b(x + side * 0.5, y, 0, 0.35, 0.14, 0.2, def.accent); for (const up of [-1, 1]) b(x + side * 0.65, y + up * 0.17, 0, 0.14, 0.26, 0.2, up > 0 ? '#d96976' : '#6e9bd9'); }
      }
    } else {
      b(0, 0.7, 0, 0.75, 0.9, 0.65); b(0, 1.35, 0.08, 0.8, 0.65, 0.65); eyes(0, 1.48, 0.42);
      b(0, 0.7, 0.35, 0.52, 0.65, 0.05, def.accent);
      for (const side of [-1, 1]) { b(side * 0.26, 0.13, 0.14, 0.32, 0.26, 0.5, def.accent); b(side * 0.5, 0.85, 0.1, 0.22, 0.5, 0.3); }
      if (family === 'psyduck') {
        b(0, 1.22, 0.52, 0.55, 0.24, 0.4, def.accent);
        for (const x of [-0.16, 0, 0.16]) b(x, 1.82, 0, 0.06, 0.32, 0.06, def.stage === 1 ? '#444039' : def.color);
        if (def.stage === 2) b(0, 1.6, 0.43, 0.14, 0.14, 0.06, '#e76e87');
      } else {
        b(0, 0.45, -0.55, 0.25, 0.25, 0.65);
        if (def.stage === 2) for (const x of [-0.3, 0, 0.3]) for (const y of [0.6, 0.95, 1.3]) b(x, y, -0.45, 0.19, 0.5, 0.4, '#916a36');
        else for (const y of [0.45, 0.75, 1.05]) b(0, y, -0.35, 0.8, 0.04, 0.07, '#a48243');
        for (const side of [-1, 1]) b(side * 0.3, 1.78, 0, 0.2, 0.3, 0.2);
      }
    }
    return meshFor(g, def.stage);
  }
  if (family === 'pidgey' || family === 'zubat') {
    if (family === 'pidgey') {
      b(0, 0.75, 0, 0.6, 0.8, 0.55); b(0, 1.32, 0.14, 0.6, 0.55, 0.55);
      b(0, 0.72, 0.29, 0.42, 0.55, 0.04, def.accent);
      b(0, 1.24, 0.5, 0.22, 0.15, 0.28, '#e0a25b');
      for (const side of [-1, 1]) {
        b(side * 0.45, 0.78, -0.04, 0.35, 0.6, 0.6);
        b(side * 0.19, 1.4, 0.43, 0.12, 0.13, 0.04, '#232532');
        b(side * 0.2, 0.16, 0.14, 0.15, 0.3, 0.3, '#dca56a');
      }
      b(0, 0.63, -0.47, 0.4, 0.18, 0.55, def.accent);
      if (def.stage > 1) { b(0, 1.65, -0.05, 0.3, 0.26, 0.7, '#d96352'); b(0, 1.69, -0.38, 0.2, 0.16, def.stage === 3 ? 0.9 : 0.4, '#f5cf69'); }
    } else {
      b(0, 1.15, 0, 0.55, 0.8, 0.45);
      for (const side of [-1, 1]) {
        b(side * 0.75, 1.3, -0.1, 1.1, 0.16, 0.35);
        b(side * 0.8, 1.02, -0.09, 0.85, 0.55, 0.13, def.accent);
        b(side * 0.28, 1.75, 0, 0.18, 0.4, 0.18);
        b(side * 0.18, 0.54, 0, 0.12, 0.45, 0.13);
      }
      b(0, 1.08, 0.24, 0.4, def.stage === 2 ? 0.58 : 0.35, 0.04, '#342334');
      for (const side of [-1, 1]) b(side * 0.12, def.stage === 2 ? 1.27 : 1.18, 0.28, 0.08, 0.17, 0.05, '#fff4de');
    }
    return meshFor(g, def.stage);
  }
  const quad = family === 'bulbasaur' || family === 'rattata';
  b(0, 0.64, 0, 0.7, quad ? 0.55 : 0.85, quad ? 0.95 : 0.55);
  b(0, quad ? 0.88 : 1.25, quad ? 0.48 : 0.06, 0.85, 0.66, 0.62);
  for (const side of [-1, 1]) {
    const x = side * 0.25;
    b(x, 0.14, 0.14, 0.27, 0.28, 0.4);
    if (quad) b(x, 0.14, -0.35, 0.27, 0.28, 0.4);
    else b(side * 0.43, 0.75, 0.12, 0.22, 0.42, 0.25);
    b(x, quad ? 0.99 : 1.36, quad ? 0.8 : 0.38, 0.13, 0.19, 0.04, '#202337');
    b(x - 0.025, quad ? 1.04 : 1.41, quad ? 0.83 : 0.41, 0.045, 0.06, 0.025, '#fff8ee');
  }
  b(0, quad ? 0.75 : 1.12, quad ? 0.81 : 0.39, 0.18, 0.045, 0.04, '#4f3934');
  if (family === 'pikachu') {
    for (const s of [-1, 1]) {
      b(s * 0.29, 1.9, 0.02, 0.2, 0.65, 0.2);
      b(s * 0.29, 2.2, 0.02, 0.2, 0.19, 0.2, '#322f30');
      b(s * 0.36, 1.14, 0.39, 0.18, 0.16, 0.04, '#ef5454');
      b(0, 0.6 + (s + 1) * 0.13, -0.29, 0.65, 0.12, 0.04, def.accent);
    }
    b(0.34, 0.65, -0.45, 0.2, 0.18, 0.45, def.accent);
    b(0.48, 0.9, -0.64, 0.42, 0.44, 0.18);
    b(0.67, 1.19, -0.64, 0.42, 0.2, 0.18);
    if (def.stage > 1) b(0, 0.64, 0.29, 0.5, 0.65, 0.04, '#fff1bf');
  } else if (family === 'bulbasaur') {
    b(-0.3, 1.27, 0.4, 0.22, 0.25, 0.25); b(0.3, 1.27, 0.4, 0.22, 0.25, 0.25);
    b(0, 1.12, -0.22, 0.75, 0.58, 0.75, def.accent);
    b(0, 1.5, -0.22, 0.42, 0.24, 0.42, '#58af55');
    if (def.stage > 1) {
      b(0, 1.7, -0.22, 0.4, 0.35, 0.4, '#d66585');
      if (def.stage === 3) {
        b(0, 1.62, -0.22, 0.18, 0.8, 0.18, '#7e6941');
        for (const [x, z] of [[-0.45, 0], [0.45, 0], [0, 0.45], [0, -0.45]]) b(x, 2.03, z - 0.22, 0.65, 0.18, 0.65, '#e48198');
        b(0, 2.17, -0.22, 0.4, 0.2, 0.4, '#f5d87a');
      }
    }
    for (const s of [-1, 1]) b(s * 0.356, 0.7, 0.1, 0.025, 0.18, 0.22, '#298778');
  } else if (family === 'charmander') {
    b(0, 0.63, 0.29, 0.45, 0.6, 0.035, def.accent);
    b(0, 0.35, -0.57, 0.25, 0.25, 0.7);
    b(0, 0.65, -0.86, 0.3, 0.4, 0.3, '#fa5936');
    b(0, 0.72, -0.87, 0.16, 0.28, 0.16, '#ffe65b');
    if (def.stage > 1) for (const side of [-1, 1]) b(side * 0.3, 1.7, -0.05, 0.16, 0.35, 0.16, def.stage === 3 ? '#f5e1bf' : def.color);
    if (def.stage === 3) for (const side of [-1, 1]) {
      b(side * 0.8, 1.13, -0.31, 0.8, 0.95, 0.15);
      b(side * 0.85, 1.17, -0.21, 0.58, 0.68, 0.08, '#4b8c9a');
    }
  } else if (family === 'rattata') {
    for (const side of [-1, 1]) { b(side * 0.34, 1.25, 0.4, 0.28, 0.4, 0.22); b(side * 0.34, 1.26, 0.53, 0.16, 0.24, 0.04, '#dbadc3'); }
    b(0, 0.78, 0.83, 0.4, 0.3, 0.24, def.accent);
    b(0, 0.87, 0.96, 0.18, 0.13, 0.06, '#765177');
    b(0, 0.65, 0.96, 0.22, 0.2, 0.06, '#fff5e7');
    b(0, 0.45, -0.82, 0.13, 0.13, 0.7); b(0.2, 0.45, -1.1, 0.5, 0.13, 0.13);
  } else {
    b(0, 0.68, -0.35, 0.83, 0.9, 0.3, def.accent);
    b(0, 0.68, -0.52, 0.56, 0.64, 0.08, '#855534');
    b(0, 0.62, 0.29, 0.5, 0.6, 0.04, '#ffe1a0');
    if (def.stage === 2) for (const side of [-1, 1]) b(side * 0.45, 1.65, 0, 0.25, 0.45, 0.15, '#e3f1ef');
    if (def.stage === 3) for (const side of [-1, 1]) {
      b(side * 0.35, 1.15, -0.2, 0.26, 0.28, 0.85, '#a3afbb');
      b(side * 0.35, 1.15, 0.24, 0.17, 0.18, 0.03, '#343c50');
    }
    b(0, 0.24, -0.64, 0.3, 0.3, 0.35); b(0, 0.43, -0.76, 0.22, 0.2, 0.2);
  }
  return meshFor(g, def.stage);
}
function meshFor(g, stage) {
  const mesh = new THREE.Mesh(g.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const root = new THREE.Group(); root.add(mesh); root.scale.setScalar(1 + (stage - 1) * 0.18); return root;
}
export function makeBall() {
  const g = new GB();
  box(g, 0.3, 0.14, 0.3, 0, 0.08, 0, '#f35865');
  box(g, 0.3, 0.14, 0.3, 0, -0.08, 0, '#fff6e7');
  box(g, 0.31, 0.04, 0.31, 0, 0, 0, '#302d40');
  box(g, 0.1, 0.1, 0.04, 0, 0, 0.17, '#fff6e7');
  return new THREE.Mesh(g.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
export function disposeModel(root) {
  root.removeFromParent();
  root.traverse(o => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
}
