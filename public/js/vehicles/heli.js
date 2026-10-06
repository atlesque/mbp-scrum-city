import { charMat } from '../characters/character.js';
import { explosion } from '../combat/combat.js';
import { SIGHT_EVERY, newSight, reactTo } from '../combat/sight.js';
import { Sound } from '../core/audio.js';
import { pan3d, vol3d } from '../core/spatial.js';
import { G, P } from '../core/state.js';
import { angDiff, lerp, rnd } from '../core/util.js';
import { addEntity, removeEntity } from '../entities/registry.js';
import { reward } from '../game/pickups.js';
import { hurtPlayer } from '../game/player.js';
import { addHeat } from '../game/wanted.js';
import { PGEO, emit, muzzleFlash, pmat, tracer } from '../render/effects.js';
import { GB, box } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { showBig } from '../ui/hud.js';
import { groundAt } from '../world/city.js';
import { blocked, raySphere, tallBoxes, wallHitFace } from '../world/collision.js';
import { lightRed } from './materials.js';

// ================= HELICOPTER =================
// The 4+ star chopper: circles the player, sweeps a searchlight and fires minigun bursts.
// It takes about 20 rifle hits or one direct rocket, smokes as it weakens and spins down when killed.
export const HELI_HP = 700;
// hit volumes in the chopper's own frame: the cabin, the tail boom and the rotor disc
const BODY_R = 3, TAIL_BACK = 4.4, TAIL_R = 1.6, ROTOR_Y = 1, ROTOR_R = 4.5;
// the searchlight hangs under the cabin and its cone widens by BEAM_SPREAD per metre
const BEAM_Y = -0.8, BEAM_SPREAD = 0.06;
// up to SHADOW_BOXES buildings near the beam cast shadows in it (see lightMaterial)
const SHADOW_BOXES = 16;
const shade = {
  origin: { value: new THREE.Vector3() }, tip: { value: new THREE.Vector3() }, nBox: { value: 0 },
  bMin: { value: Array.from({ length: SHADOW_BOXES }, () => new THREE.Vector3()) },
  bMax: { value: Array.from({ length: SHADOW_BOXES }, () => new THREE.Vector3()) },
};
const _near = [];
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
const Heli = {
  kind: 'heli',
  blipLayer: 4,
  update(dt) {
    const h = this;
    h.rotor.rotation.y += dt * 30; h.rotor2.rotation.y = h.rotor.rotation.y;
    // damage shows: grey smoke below 60%, thick black smoke and sparks below 30%
    const hpF = h.hp / HELI_HP;
    if (!h.falling && hpF < 0.6 && Math.random() < (hpF < 0.3 ? 0.9 : 0.4)) {
      emit(h.x, h.y + 0.6, h.z, 1, hpF < 0.3 ? '#2a2430' : '#8a8490', 1.5, 1.6, 0.7, 1.5, 1);
      if (hpF < 0.3 && Math.random() < 0.3) emit(h.x, h.y + 0.6, h.z, 1, '#ff8a3a', 2, 0.3, 0.25, 0, 1);
    }
    if (h.falling) {
      h.vy -= 14 * dt; h.y += h.vy * dt; h.grp.rotation.y += dt * 5; h.grp.rotation.z += dt * 0.6;
      if (Math.random() < 0.8) emit(h.x, h.y, h.z, 1, '#3a3240', 2, 1.5, 0.8, 2, 1);
      if (h.y <= 1) { explosion(h.x, 1, h.z, 9, 200, true); removeHeli(40); return; }
      h.grp.position.set(h.x, h.y, h.z); return;
    }
    if (G.wanted < 4) {
      h.y += dt * 8; h.x += Math.sin(h.yaw) * dt * 20; h.z += Math.cos(h.yaw) * dt * 20; h.beam.visible = h.spot.visible = false;
      h.grp.position.set(h.x, h.y, h.z);
      if (h.y > 70) removeHeli(20);
      return;
    }
    h.beam.visible = h.spot.visible = true;
    h.ang += dt * 0.22;
    const tx = P.x + Math.cos(h.ang) * 26, tz = P.z + Math.sin(h.ang) * 26, ty = 28;
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz), sp = Math.min(d, 16 * dt);
    if (d > 0.01) { h.x += dx / d * sp; h.z += dz / d * sp; }
    h.y = lerp(h.y, ty, dt * 0.5);
    h.yaw += angDiff(h.yaw, Math.atan2(P.x - h.x, P.z - h.z)) * dt * 2;
    h.grp.position.set(h.x, h.y + Math.sin(G.time * 1.3) * 0.3, h.z); h.grp.rotation.set(0.12, h.yaw, 0);
    h.lr.visible = (G.time * 2 | 0) % 2 === 0;
    aimLight(h);
    const dist = Math.hypot(P.x - h.x, P.z - h.z, h.y);
    h.losT -= dt;
    if (h.losT <= 0) { h.los = P.alive && dist < 80 && !blocked(h.x, h.y - 1, h.z, P.x, P.y + 1, P.z); h.losT = SIGHT_EVERY; }
    // the minigun only opens up on a player in view, after a short reaction, and stops when they duck out of sight
    const ready = reactTo(h.sight, h.los && dist < 70, dt);
    if (!h.los) h.burst = 0;
    h.fireT -= dt;
    if (h.burst > 0) {
      h.burstT -= dt;
      if (h.burstT <= 0) {
        h.burst--; h.burstT = 0.09;
        const from = new THREE.Vector3(h.x, h.y - 1, h.z), to = new THREE.Vector3(P.x, P.y + 1, P.z);
        const hit = Math.random() < 0.2 && !blocked(from.x, from.y, from.z, to.x, to.y, to.z);
        if (!hit) to.add(new THREE.Vector3(rnd(-2, 2), rnd(-1, 0.5), rnd(-2, 2)));
        tracer(from, to, true); muzzleFlash(from); Sound.shot('minigun', vol3d(h.x, h.z) * 0.6, pan3d(h.x, h.z)); if (hit) hurtPlayer(5);
        emit(to.x, 0.1, to.z, 2, '#d8c8b0', 3, 0.3, 0.1);
      }
    } else if (h.fireT <= 0 && ready) { h.burst = 10; h.fireT = rnd(2.5, 3.5); }
    if (h.los) G.seenNow = true;
  },
  raycast(o, d, maxT) {
    const h = this; if (h.falling) return null;
    let t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, h.x, h.y, h.z, BODY_R);
    const tx = h.x - Math.sin(h.yaw) * TAIL_BACK, tz = h.z - Math.cos(h.yaw) * TAIL_BACK;
    t = Math.min(t, raySphere(o.x, o.y, o.z, d.x, d.y, d.z, tx, h.y + 0.3, tz, TAIL_R));
    // the spinning blades read as a solid disc
    if (Math.abs(d.y) > 1e-4) {
      const tr = (h.y + ROTOR_Y - o.y) / d.y;
      if (tr > 0 && Math.hypot(o.x + d.x * tr - h.x, o.z + d.z * tr - h.z) < ROTOR_R) t = Math.min(t, tr);
    }
    return t < maxT ? { t } : null;
  },
  onShot(hit, dmg) { this.damage(dmg); return { head: false }; },
  onRocket(dmg) { this.damage(dmg * 2); },
  blast(x, y, z, R, dmg) { if (Math.hypot(this.x - x, this.y - y, this.z - z) < R + 3) this.damage(dmg); },
  damage(dmg) {
    const h = this; if (h.falling) return; h.hp -= dmg; emit(h.x, h.y, h.z, 4, '#ffd23e', 7, 0.3, 0.16);
    if (h.hp <= 0) { h.falling = true; h.vy = 0; h.beam.visible = h.spot.visible = false; reward(h.x, h.z, 2000, 'Chopper down'); addHeat(10); }
  },
  blip(radar) { radar.dot(this.x, this.z, radar.flash ? '#ffd23e' : '#ff3b4e', 11, true, 'sq'); },
  dispose() { scene.remove(this.grp, this.beam, this.spot); },
};

// The searchlight points at the street under the player and stops at the first building in the way:
// the beam ends there and the spot of light lands on that wall or roof instead of the street.
export function aimLight(h) {
  const p = h.grp.position;
  _o.set(p.x, p.y + BEAM_Y, p.z); _d.set(P.x, groundAt(P.x, P.z), P.z).sub(_o);
  const L = _d.length(); if (L < 0.01) return;
  _d.divideScalar(L);
  const t = wallHitFace(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, L, _n), r = Math.max(0.8, t * BEAM_SPREAD);
  _e.copy(_d).multiplyScalar(t).add(_o);
  h.beam.position.copy(_o).lerp(_e, 0.5); h.beam.scale.set(r, t, r); h.beam.lookAt(_e); h.beam.rotateX(-Math.PI / 2);
  h.spot.position.copy(_n).multiplyScalar(0.05).add(_e); h.spot.quaternion.setFromUnitVectors(_z, _n); h.spot.scale.setScalar(r * 2);
  shadeFrom(_o, _e, r);
  return t;
}
// The cone is wider than the line down its middle, so in an alley its sides would still cut through the walls.
// Hand the shader the buildings near the beam, nearest the chopper first; it drops any bit of the cone or
// the spot that the light could not reach in a straight line.
function shadeFrom(o, e, r) {
  const pad = r + 1, x0 = Math.min(o.x, e.x) - pad, x1 = Math.max(o.x, e.x) + pad, z0 = Math.min(o.z, e.z) - pad, z1 = Math.max(o.z, e.z) + pad;
  _near.length = 0;
  for (const b of tallBoxes) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) _near.push(b);
  const d2 = b => (Math.max(b.x0 - o.x, 0, o.x - b.x1) ** 2) + (Math.max(b.z0 - o.z, 0, o.z - b.z1) ** 2);
  if (_near.length > SHADOW_BOXES) _near.sort((a, b) => d2(a) - d2(b));
  const n = Math.min(_near.length, SHADOW_BOXES);
  for (let i = 0; i < n; i++) { const b = _near[i]; shade.bMin.value[i].set(b.x0, -1, b.z0); shade.bMax.value[i].set(b.x1, b.h, b.z1); }
  shade.nBox.value = n; shade.origin.value.copy(o); shade.tip.value.copy(e);
}
export const searchlightShade = shade;
// Additive light that is dropped wherever a building stands between the lamp and the fragment.
// The beam (BEAM) also fades towards its edges, its far end and the camera, so the cone reads as a soft
// shaft of lit air instead of hard-edged panels that seem to cut across the walls of a narrow street.
function lightMaterial(opacity, extra, defines = {}) {
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
      uniform vec3 color; uniform float opacity; uniform vec3 origin; uniform vec3 tip; uniform int nBox; uniform vec3 bMin[N]; uniform vec3 bMax[N];
      varying vec3 vW; varying vec3 vV; varying vec3 vC;
      void main() {
        float f = 1.0;
        #ifdef BEAM
          // the cone is thin, so its surface faces straight out from the line down its middle
          vec3 axis = normalize(tip - origin), rad = vW - origin;
          float along = dot(rad, axis) / distance(tip, origin);
          rad -= axis * dot(rad, axis);
          float facing = abs(dot(normalize(mat3(viewMatrix) * rad), normalize(-vV)));
          f = facing * sqrt(facing) * (1.0 - smoothstep(0.75, 1.0, along)) * smoothstep(1.5, 8.0, length(vV));
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

export function spawnHeli() {
  const g = new GB();
  box(g, 1.8, 1.6, 4, 0, 0, 0, '#1b2a4a'); box(g, 1.6, 1.0, 1.4, 0, 0.1, 1.9, '#3a5a7a'); box(g, 0.4, 0.4, 4, 0, 0.3, -3.8, '#1b2a4a');
  box(g, 0.1, 1.2, 0.8, 0, 0.8, -5.6, '#1b2a4a'); box(g, 2.06, 0.3, 1.2, 0, 0.1, -0.3, '#f4f4f4');
  box(g, 0.1, 0.1, 3.4, 0.9, -1.1, 0, '#222'); box(g, 0.1, 0.1, 3.4, -0.9, -1.1, 0, '#222'); box(g, 0.1, 0.5, 0.1, 0.9, -0.85, 0.8, '#222'); box(g, 0.1, 0.5, 0.1, -0.9, -0.85, 0.8, '#222');
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(g.geometry(), charMat));
  const rotor = new THREE.Mesh(PGEO, pmat('#141418')); rotor.scale.set(9, 0.06, 0.35); rotor.position.y = 1.0; grp.add(rotor);
  const rotor2 = new THREE.Mesh(PGEO, pmat('#141418')); rotor2.scale.set(0.35, 0.06, 9); rotor2.position.y = 1.0; grp.add(rotor2);
  const lr = new THREE.Mesh(PGEO, lightRed); lr.scale.setScalar(0.25); lr.position.set(0, -0.85, 1); grp.add(lr);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 16, 1, true), lightMaterial(0.2, { side: THREE.DoubleSide }, { BEAM: '' }));
  const spot = new THREE.Mesh(spotGeometry(), lightMaterial(0.45, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4 }));
  scene.add(beam, spot);
  const a = rnd(0, 6.28);
  const h = Object.assign(Object.create(Heli), { grp, rotor, rotor2, lr, beam, spot, x: P.x + Math.cos(a) * 120, z: P.z + Math.sin(a) * 120, y: 34, hp: HELI_HP, alive: true, ang: a, fireT: 3, burst: 0, burstT: 0, los: false, losT: 0, sight: newSight(), vy: 0, falling: false, yaw: 0 });
  grp.position.set(h.x, h.y, h.z); scene.add(grp);
  G.heli = addEntity(h);
  showBig('Chopper inbound');
}
// clear the chopper away; the next one may come `cooldown` seconds later
export function removeHeli(cooldown) {
  if (!G.heli) return;
  removeEntity(G.heli); G.heli = null;
  if (cooldown != null) G.heliT = cooldown;
}
