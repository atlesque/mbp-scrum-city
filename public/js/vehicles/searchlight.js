import { scene } from '../render/scene.js';
import { tallBoxes, wallHitFace } from '../world/collision.js';

// ================= SEARCHLIGHT =================
// A chopper's searchlight: a soft cone of lit air (the beam) and a disc of light where it lands (the spot). The police
// chopper points it at the player (vehicles/heli.js); a chopper the player flies points it where they aim (kinds/heli.js).
// The cone widens by BEAM_SPREAD per metre.
export const BEAM_SPREAD = 0.06;
// up to SHADOW_BOXES buildings near the beam cast shadows in it (see lightMaterial)
const SHADOW_BOXES = 16;
// what the shader is told about where the light is and what stands round it; each searchlight has its own
export const newShade = () => ({
  origin: { value: new THREE.Vector3() }, tip: { value: new THREE.Vector3() }, radius: { value: 1 }, nBox: { value: 0 },
  bMin: { value: Array.from({ length: SHADOW_BOXES }, () => new THREE.Vector3()) },
  bMax: { value: Array.from({ length: SHADOW_BOXES }, () => new THREE.Vector3()) },
});
const _near = [];
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);

// a searchlight { beam, spot, shade }, added to the scene
export function makeSearchlight(shade = newShade()) {
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 16, 1, true), lightMaterial(shade, 0.2, { side: THREE.DoubleSide }, { BEAM: '' }));
  const spot = new THREE.Mesh(spotGeometry(), lightMaterial(shade, 0.45, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4 }));
  scene.add(beam, spot);
  return { beam, spot, shade };
}
export function showSearchlight(L, on) { L.beam.visible = L.spot.visible = on; }
export function removeSearchlight(L) { scene.remove(L.beam, L.spot); }

// Shine from `o` along the unit direction `d` for up to maxL metres. The light stops at the first building in the way,
// so the spot lands on that wall or roof; with ground true it also stops at the street. When it reaches neither,
// the beam fades out into the air at maxL and there is no spot, unless `lands` says maxL is on the street.
// Returns how far it reached.
export function shine(L, o, d, maxL, ground = false, lands = false) {
  let t = wallHitFace(o.x, o.y, o.z, d.x, d.y, d.z, maxL, _n), hit = lands || t < maxL;
  if (ground && d.y < -1e-4) { const tg = -o.y / d.y; if (tg < t) { t = tg; hit = true; _n.set(0, 1, 0); } }
  if (!(t > 0.01)) return 0;
  const r = Math.max(0.8, t * BEAM_SPREAD);
  _e.copy(d).multiplyScalar(t).add(o);
  L.beam.position.copy(o).lerp(_e, 0.5); L.beam.scale.set(r, t, r); L.beam.lookAt(_e); L.beam.rotateX(-Math.PI / 2);
  L.spot.visible = L.beam.visible && hit;
  L.spot.position.copy(_n).multiplyScalar(0.05).add(_e); L.spot.quaternion.setFromUnitVectors(_z, _n); L.spot.scale.setScalar(r * 2);
  shadeFrom(L.shade, o, _e, r);
  return t;
}
// Shine from `o` at the point (x, y, z), stopping at the first building in the way. Returns how far it reached.
export function shineAt(L, o, x, y, z) {
  _d.set(x, y, z).sub(o);
  const len = _d.length(); if (len < 0.01) return;
  return shine(L, o, _d.divideScalar(len), len, false, true);
}

// The cone is wider than the line down its middle, so in an alley its sides would still cut through the walls.
// Hand the shader the buildings near the beam, nearest the chopper first; it drops any bit of the cone or
// the spot that the light could not reach in a straight line.
function shadeFrom(shade, o, e, r) {
  const pad = r + 1, x0 = Math.min(o.x, e.x) - pad, x1 = Math.max(o.x, e.x) + pad, z0 = Math.min(o.z, e.z) - pad, z1 = Math.max(o.z, e.z) + pad;
  _near.length = 0;
  for (const b of tallBoxes) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) _near.push(b);
  const d2 = b => (Math.max(b.x0 - o.x, 0, o.x - b.x1) ** 2) + (Math.max(b.z0 - o.z, 0, o.z - b.z1) ** 2);
  if (_near.length > SHADOW_BOXES) _near.sort((a, b) => d2(a) - d2(b));
  const n = Math.min(_near.length, SHADOW_BOXES);
  for (let i = 0; i < n; i++) { const b = _near[i]; shade.bMin.value[i].set(b.x0, -1, b.z0); shade.bMax.value[i].set(b.x1, b.h, b.z1); }
  shade.nBox.value = n; shade.origin.value.copy(o); shade.tip.value.copy(e); shade.radius.value = r;
}
// Additive light that is dropped wherever a building stands between the lamp and the fragment.
// The beam (BEAM) glows by how close the line of sight passes to the middle of the cone, so it reads as a
// soft shaft of lit air from any side, even looking up it from the street, instead of hard-edged panels
// that seem to cut across the walls of a narrow street.
function lightMaterial(shade, opacity, extra, defines = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shade, color: { value: new THREE.Color('#fff4c8') }, opacity: { value: opacity } },
    defines,
    vertexShader: `varying vec3 vW; varying vec3 vV; varying vec3 vC;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0), v = viewMatrix * w; vW = w.xyz; vV = v.xyz;
        #ifdef USE_COLOR
          vC = color;
        #else
          vC = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * v;
      }`,
    fragmentShader: `#define N ${SHADOW_BOXES}
      uniform vec3 color; uniform float opacity; uniform vec3 origin; uniform vec3 tip; uniform float radius; uniform int nBox; uniform vec3 bMin[N]; uniform vec3 bMax[N];
      varying vec3 vW; varying vec3 vV; varying vec3 vC;
      void main() {
        float f = 1.0;
        #ifdef BEAM
          // in view space: the eye is at 0 and looks along u; find where that line passes the cone's middle line
          vec3 o = (viewMatrix * vec4(origin, 1.0)).xyz, a = (viewMatrix * vec4(tip, 1.0)).xyz - o, u = normalize(vV);
          float len = length(a); a /= len;
          float b = dot(u, a), du = dot(u, -o), da = dot(a, -o), den = max(1.0 - b * b, 1e-4);
          float s = (b * da - du) / den, t = (da - b * du) / den;
          float along = clamp(t / len, 0.0, 1.0), miss = length(-o + u * s - a * t) / max(radius * along, 0.05);
          f = (1.0 - smoothstep(0.35, 1.0, miss)) * (1.0 - smoothstep(0.8, 1.0, along)) * smoothstep(2.0, 10.0, length(vV));
        #endif
        vec3 d = vW - origin;
        d = mix(d, vec3(1e-4), vec3(lessThan(abs(d), vec3(1e-4))));
        vec3 inv = 1.0 / d;
        for (int i = 0; i < N; i++) {
          if (i >= nBox) break;
          vec3 a = (bMin[i] - origin) * inv, b = (bMax[i] - origin) * inv, lo = min(a, b), hi = max(a, b);
          float tIn = max(max(lo.x, lo.y), lo.z), tOut = min(min(hi.x, hi.y), hi.z);
          if (tIn < tOut && tOut > 0.0 && tIn < 0.999) discard;
        }
        gl_FragColor = vec4(color * vC, opacity * f);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...extra,
  });
}
// a soft disc of light, bright in the middle and fading to nothing at the rim (black adds nothing)
function spotGeometry() {
  const g = new THREE.RingGeometry(0, 1, 24, 4), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const q = Math.min(1, Math.hypot(pos.getX(i), pos.getY(i))), f = (1 - q * q) ** 2; col.fill(f, i * 3, i * 3 + 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
