import { HAIR, SKIN, charMat, makeCharacter, randomLook, seatedLegs } from '../characters/character.js';
import { selectWeapon } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { kb } from '../core/controls.js';
import { emit } from '../core/events.js';
import { save } from '../core/save.js';
import { G, I, P, cam, inv } from '../core/state.js';
import { $, angDiff, clamp, pick } from '../core/util.js';
import { addEntity } from '../entities/registry.js';
import { GB, UNIT, addGeo, box, cylG } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { makeCanvas, neonTexture } from '../render/textures.js';
import { showBig, toast } from '../ui/hud.js';
import { BAR, BOOTHS, BOUNCER, CLUB, CLUB_AT, CLUB_CLOSED_AT, CLUB_NAME, DOOR, POLES, ROOM, ROUTINE, RUNWAY, SEATS, STAGE, TABLES, TIP, clubLayout, routineAt } from '../world/club.js';

// ================= INSIDE THE VELVET FLAMINGO =================
// E at the club's door fades out and puts the player in the club, a room drawn in a scene of its own (main.js
// renders it instead of the city while P.club is set). Like the gun shop's menu, the city waits outside: nothing
// out there moves, and the heat is where you left it when you come back out. No guns inside: the bouncer sees to
// that, so it's fists only (and no throwing them) until you are back on the street. The room is built the first time you go in.
const REACH = 1.8;
export const DRINK = { name: 'Flamingo Fizz', price: 20, hp: 15 };
const ECHO = { wet: 0.3, delay: 0.03, tail: 0.55 }; // a small room with a hard floor (Sound.room)
const BEAT = 0.5; // the house groove plays at 120 bpm: dancers and heads move to it
export const LAYOUT = clubLayout();
let S = null; // the scene and everyone in it, once built
let held = null; // what was in the player's hand at the door

// ---- the door in the street ----
const ClubDoor = {
  kind: 'clubdoor',
  blipLayer: 1,
  interaction(p) {
    if (G.stairs || p.y > 2) return null;
    const dist = Math.hypot(this.x - p.x, this.z - p.z); if (dist >= REACH) return null;
    if (G.wanted >= CLUB_CLOSED_AT) return { keys: ['use'], priority: 1, dist, prompt: `The bouncer won't let you in with that heat on you. Lose some first (under ${CLUB_CLOSED_AT} ★)`, run: () => {} };
    return { keys: ['use'], priority: 1, dist, prompt: `Press <kbd>${kb('use')}</kbd> to go into the ${CLUB_NAME}`, run: () => goThrough(true) };
  },
  blip(radar) { radar.dot(this.x, this.z, '#ff4fd8', 7, false, 'sq'); },
};
export function spawnClubDoor(site) { return addEntity(Object.assign(Object.create(ClubDoor), { site, x: site.street.x, z: site.street.z })); }

// what the player can use inside: the door back out, and the bar (game/interact.js asks this instead of the city)
export function clubInteractions(p, near) {
  if (G.stairs) return;
  const L = LAYOUT, d = Math.hypot(p.x - L.door.x, p.z - (L.door.z - 0.9));
  if (d < REACH) near.push({ keys: ['use'], priority: 1, dist: d, prompt: `Press <kbd>${kb('use')}</kbd> to head back out`, run: () => goThrough(false) });
  const b = L.barFront, bd = Math.abs(p.x - b.x);
  if (bd < 1.1 && p.z > b.z0 && p.z < b.z1) near.push({ keys: ['use'], priority: 1, dist: bd, prompt: `Press <kbd>${kb('use')}</kbd> for a ${DRINK.name} ($${DRINK.price}, +${DRINK.hp} health)`, run: buyDrink });
}
export function buyDrink() {
  if (inv.money < DRINK.price) { Sound.deny(); toast(`A ${DRINK.name} is $${DRINK.price}. Come back with some cash.`, 2.5); return false; }
  inv.money -= DRINK.price; Sound.buy(); P.hp = Math.min(100, P.hp + DRINK.hp);
  toast(`One ${DRINK.name}, on the rocks. <b>+${DRINK.hp} health</b>`, 2.5); save();
  return true;
}

// a short fade to black hides the move, as on the roof stairs
function goThrough(inside) {
  if (G.stairs) return;
  G.stairs = true; $('fade').classList.add('on');
  setTimeout(() => {
    G.stairs = false; $('fade').classList.remove('on');
    if (P.alive && !P.vehicle) { if (inside) enterClub(); else leaveClub(); }
  }, 280);
}
const stand = (x, z, yaw) => {
  P.x = x; P.z = z; P.y = P.floor = 0; P.vy = 0; P.grounded = true; P.vx = P.vz = 0; P.moveSpeed = 0; P.roof = null;
  P.yaw = cam.yaw = yaw; P.c.root.position.set(P.x, 0, P.z); P.c.root.rotation.y = P.yaw;
};
export function enterClub() {
  if (P.club) return;
  const s = build();
  P.club = LAYOUT; stand(LAYOUT.arrive.x, LAYOUT.arrive.z, LAYOUT.arrive.yaw);
  s.scene.add(P.c.root); held = inv.cur; selectWeapon('fist');
  Object.assign(I, { mouseL: false, mouseR: false, clickQ: 0 }); G.scope = 0;
  // the street goes quiet behind the door and the club's own sound takes over
  Sound.hush(); Sound.bed({ day: 0, night: 0, wind: 0 }); Sound.room(ECHO); Sound.indoors();
  $('radarWrap').style.visibility = 'hidden';
  showBig(CLUB_NAME); emit('club:in', {});
}
// back on the pavement in front of the door, facing the street (also what respawn does if it comes to that)
export function leaveClub() {
  if (!P.club) return;
  P.club = null; scene.add(P.c.root); if (held && inv.owned[held]) selectWeapon(held); held = null;
  const s = CLUB.site; if (s) stand(s.street.x, s.street.z, s.yaw);
  Object.assign(I, { mouseL: false, mouseR: false, clickQ: 0 });
  Sound.hush(); $('radarWrap').style.visibility = '';
  emit('club:out', {});
}
export const clubScene = () => S && S.scene;

// ---- the room ----
// sequins: a small canvas of glints in shades of the outfit's colour, a little self-lit so they catch the eye
const sequinCache = {};
function sequinMat(base) {
  if (sequinCache[base]) return sequinCache[base];
  const c = makeCanvas(32, 32), x = c.getContext('2d'), col = new THREE.Color(base);
  x.fillStyle = base; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 90; i++) {
    const k = 0.6 + Math.random() * 0.9, g = col.clone().multiplyScalar(k);
    x.fillStyle = Math.random() < 0.12 ? '#ffffff' : '#' + g.getHexString(); x.fillRect(Math.floor(Math.random() * 16) * 2, Math.floor(Math.random() * 16) * 2, 2, 2);
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter;
  return (sequinCache[base] = new THREE.MeshLambertMaterial({ map: t, emissive: col.clone().multiplyScalar(0.35) }));
}
// The dancers: club outfits, all covered up. Sequinned tops with matching shorts, or a sequinned dress over them,
// and boots. The torso and the dress take the sequins.
const DANCERS = [
  { skin: SKIN[1], hair: HAIR[2], hairStyle: 'long', outfit: '#ff3fa4', boots: '#f4f0f6' },
  { skin: SKIN[4], hair: HAIR[0], hairStyle: 'bigafro', outfit: '#9b5bff', dress: true, boots: '#2a2226' },
  { skin: SKIN[2], hair: HAIR[3], hairStyle: 'long', outfit: '#ffd23e', boots: '#2a2226' },
];
function makeDancer(o) {
  const c = makeCharacter({ skin: o.skin, shirt: o.outfit, pants: o.outfit, shorts: true, hair: o.hair, hairStyle: o.hairStyle, shoes: o.boots });
  const mat = sequinMat(o.outfit);
  for (const m of c.body.children) if (m.isMesh && m.geometry === UNIT) m.material = mat;
  if (o.dress) { const d = new THREE.Mesh(UNIT, mat); d.scale.set(0.56, 0.36, 0.36); d.position.y = 0.78; c.body.add(d); }
  // boots up to the knee
  const bg = new GB(); box(bg, 0.18, 0.3, 0.2, 0, -0.68, 0, o.boots);
  for (const leg of [c.legL, c.legR]) leg.add(new THREE.Mesh(bg.geometry(), charMat));
  return c;
}
function build() {
  if (S) return S;
  const sc = new THREE.Scene(), g = new THREE.Group(); g.position.set(CLUB_AT.x, 0, CLUB_AT.z); sc.add(g);
  sc.background = new THREE.Color('#0b0410'); sc.fog = new THREE.Fog('#0b0410', 18, 46);
  const plain = new GB(), neon = new GB(), { x0, x1, z0, z1, h } = ROOM, W = x1 - x0, D = z1 - z0;
  // floor, ceiling, walls with a dark dado and a brass rail, neon strips along the top
  box(plain, W, 0.1, D, 0, -0.05, 0, '#2c1230');
  for (let i = 0; i < 12; i++) box(plain, W, 0.005, 0.06, 0, 0.003, z0 + 1.5 + i * 1.6, '#3a1a40'); // a stripe in the carpet
  box(plain, W, 0.2, D, 0, h + 0.1, 0, '#140818');
  for (const [cx, cz, w, d] of [[0, z0 - 0.1, W, 0.2], [0, z1 + 0.1, W, 0.2], [x0 - 0.1, 0, 0.2, D], [x1 + 0.1, 0, 0.2, D]]) {
    box(plain, w, h, d, cx, h / 2, cz, '#4a1a52');
    box(plain, w + (d > 1 ? 0.06 : 0), 1.1, d + (w > 1 ? 0.06 : 0), cx, 0.55, cz, '#22091f');
    box(plain, w + (d > 1 ? 0.08 : 0), 0.06, d + (w > 1 ? 0.08 : 0), cx, 1.12, cz, '#d8a84a');
  }
  const strip = (w, d, x, z, col) => box(neon, w, 0.07, d, x, h - 0.5, z, col);
  strip(W - 0.2, 0.05, 0, z1 - 0.06, '#ff3fa4'); strip(0.05, D, x0 + 0.06, 0, '#3ff0ff'); strip(0.05, D, x1 - 0.06, 0, '#3ff0ff');
  // the stage, the runway out to the third pole and the round end it stands on, each with a pink lip
  for (const s of [STAGE, RUNWAY, TIP]) {
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, w = s.x1 - s.x0, d = s.z1 - s.z0;
    box(plain, w, STAGE.h, d, cx, STAGE.h / 2, cz, '#120812');
    box(neon, w + 0.04, 0.05, 0.05, cx, STAGE.h - 0.03, s.z1, '#ff3fa4');
    if (s !== STAGE) for (const x of [s.x0, s.x1]) box(neon, 0.05, 0.05, d, x, STAGE.h - 0.03, cz, '#ff3fa4');
  }
  for (const x of [STAGE.x0, STAGE.x1]) box(neon, 0.05, 0.05, 4, x, STAGE.h - 0.03, (STAGE.z0 + STAGE.z1) / 2, '#ff3fa4');
  // the tinsel curtain behind the stage
  const tinsel = new GB();
  for (let x = STAGE.x0 + 0.1, i = 0; x < STAGE.x1; x += 0.22, i++) box(tinsel, 0.2, 2.6, 0.03, x, STAGE.h + 1.3, z0 + 0.12, ['#d9c4e8', '#ff6fc2', '#b25ad8'][i % 3]);
  const tinselMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  g.add(new THREE.Mesh(tinsel.geometry(), tinselMat));
  // poles: chrome, stage to ceiling, on a round foot
  for (const p of POLES) {
    addGeo(plain, cylG(10), p.x, (STAGE.h + h) / 2, p.z, 0.08, h - STAGE.h, 0.08, 0, 0, 0, '#e9e4f2');
    addGeo(plain, cylG(14), p.x, STAGE.h + 0.02, p.z, 0.5, 0.04, 0.5, 0, 0, 0, '#c9c0d8');
    addGeo(neon, cylG(14), p.x, h - 0.04, p.z, 0.4, 0.06, 0.4, 0, 0, 0, '#ff9ae0');
  }
  // the bar: a dark counter with a lit edge, the bottles backlit on the shelves behind
  { const cx = (BAR.x0 + BAR.x1) / 2, cz = (BAR.z0 + BAR.z1) / 2, d = BAR.z1 - BAR.z0;
    box(plain, BAR.x1 - BAR.x0, BAR.h, d, cx, BAR.h / 2, cz, '#2b1033');
    box(plain, BAR.x1 - BAR.x0 + 0.25, 0.06, d + 0.2, cx - 0.1, BAR.h + 0.03, cz, '#6a2e1a');
    box(neon, 0.04, 0.05, d, BAR.x0 - 0.02, BAR.h - 0.08, cz, '#3ff0ff');
    box(plain, 0.55, 2.2, d + 1, x1 - 0.3, 1.1, cz, '#1d0a22');
    box(neon, 0.04, 1.3, d + 0.6, x1 - 0.58, 2.1, cz, '#173444'); // the mirror, lit from behind
    for (const y of [1.55, 2.15, 2.75]) {
      box(plain, 0.5, 0.04, d + 0.6, x1 - 0.5, y, cz, '#6a4a3a');
      for (let z = BAR.z0, k = 0; z < BAR.z1; z += 0.32, k++) box(neon, 0.1, 0.32, 0.1, x1 - 0.5, y + 0.18, z + 0.16, ['#ffb347', '#7cf29a', '#ff6b6b', '#4fb3ff', '#ffe066'][(k * 3 + Math.round(y * 10)) % 5]);
    }
  }
  // booths: a velvet sofa along the wall, arms at either end, and a round table with a little lamp
  for (const b of BOOTHS) {
    box(plain, 1.2, 0.5, b.z1 - b.z0, -11.0, 0.25, b.z, '#8a0f3e'); box(plain, 0.5, 1.3, b.z1 - b.z0, -11.75, 0.65, b.z, '#6a0a30');
    for (const z of [b.z0 + 0.15, b.z1 - 0.15]) box(plain, 1.7, 0.85, 0.3, -11.15, 0.42, z, '#6a0a30');
    table(plain, neon, b.table.x, b.table.z);
  }
  for (const t of TABLES) table(plain, neon, t.x, t.z);
  for (const s of SEATS) chair(plain, s);
  // speakers at the stage's corners and a sign over the stage
  for (const sx of [-1, 1]) { box(plain, 0.7, 1.1, 0.6, sx * 7.6, h - 1.2, z0 + 0.6, '#0c0c10'); addGeo(plain, cylG(12), sx * 7.6, h - 1.25, z0 + 0.91, 0.4, 0.02, 0.4, Math.PI / 2, 0, 0, '#3a3a44'); }
  // the door out, with Exit over it
  box(plain, 2, 2.5, 0.1, DOOR.x, 1.25, DOOR.z - 0.05, '#1a1020'); box(neon, 1.6, 2.2, 0.06, DOOR.x, 1.1, DOOR.z - 0.11, '#5a1838');
  g.add(new THREE.Mesh(plain.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })), new THREE.Mesh(neon.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  const sign = (text, color, font, w, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: neonTexture(text, color, font), transparent: true, depthWrite: false })); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); };
  sign(CLUB_NAME, '#ff4fd8', '"Yellowtail", cursive', 5.6, 0, STAGE.h + 3.3, z0 + 0.16, 0);
  sign('Bar', '#3ff0ff', '"Bowlby One", Impact, sans-serif', 2.2, x1 - 0.12, 3.5, (BAR.z0 + BAR.z1) / 2, -Math.PI / 2);
  sign('Exit', '#5dff9e', '"Bowlby One", Impact, sans-serif', 1.3, DOOR.x, 2.75, DOOR.z - 0.14, Math.PI);
  // a mirror ball over the floor
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshLambertMaterial({ color: '#d8d4e8', emissive: '#4a4458', flatShading: true }));
  ball.position.set(0, h - 0.7, 2.2); g.add(ball);
  addGeo(plain, cylG(6), 0, h - 0.25, 2.2, 0.02, 0.5, 0.02, 0, 0, 0, '#888');

  // lights: dim purple all round, pink over the stage, cyan at the bar, red in the booths, amber at the tables, and a
  // coloured spot on each pole whose colour drifts round the wheel; each spot has a faint beam to show it
  sc.add(new THREE.AmbientLight('#6a4a8a', 0.55 * Math.PI), new THREE.HemisphereLight('#ff9ad8', '#2a1040', 0.35 * Math.PI));
  const point = (col, i, x, y, z, dist) => { const l = new THREE.PointLight(col, i, dist, 1.6); l.position.set(x, y, z); g.add(l); return l; };
  const stageLight = point('#ff4fb8', 14, 0, h - 0.4, -6.5, 14);
  point('#3fe0ff', 9, 9.6, h - 0.6, 1, 10); point('#ff3050', 7, -10, h - 0.8, 0.5, 12); point('#ffb050', 6, 0, h - 0.6, 4, 12);
  const spots = POLES.map((p, i) => {
    const top = { x: p.x, y: h - 0.1, z: p.z + 2.6 }, drop = top.y - STAGE.h, len = Math.hypot(2.6, drop), cone = 0.3;
    const l = new THREE.SpotLight('#ffffff', 40, 10, cone, 0.5, 1.4); l.position.set(top.x, top.y, top.z);
    l.target.position.set(p.x, STAGE.h, p.z); g.add(l, l.target);
    // the beam: an open cone from the lamp down to the foot of the pole, its point at the lamp
    const beam = new THREE.Mesh(new THREE.ConeGeometry(len * Math.tan(cone) * 0.8, len, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(p.x, (top.y + STAGE.h) / 2, p.z + 1.3); beam.rotation.x = Math.atan2(2.6, drop); g.add(beam);
    return { l, beam, hue: i / POLES.length };
  });

  // people
  const at = (c, x, y, z, yaw) => { c.root.position.set(x, y, z); c.root.rotation.y = yaw; g.add(c.root); return c; };
  const dancers = DANCERS.map((o, i) => ({ c: at(makeDancer(o), POLES[i].x, STAGE.h, POLES[i].z, 0), pole: POLES[i], offset: i * ROUTINE * 0.37, phase: 0 }));
  const sit = (c, x, z, yaw, top) => {
    c.legL.geometry = c.legR.geometry = seatedLegs(c); c.legL.rotation.set(-0.1, 0, 0); c.legR.rotation.set(-0.1, 0, 0);
    c.shadow.visible = false; c.armL.rotation.set(-0.9, 0, 0.1); c.armR.rotation.set(-0.9, 0, -0.1);
    return at(c, x, top + 0.06 - 0.9, z, yaw);
  };
  const patrons = [];
  for (const s of SEATS) if (Math.random() < 0.75) patrons.push({ c: sit(makeCharacter(randomLook()), s.x, s.z, s.yaw, s.stool ? 0.8 : 0.5), t: Math.random() * 9, cheer: 0 });
  for (const b of BOOTHS) for (const dz of [-0.75, 0.75]) if (Math.random() < 0.7) patrons.push({ c: sit(makeCharacter(randomLook()), -10.75, b.z + dz, Math.PI / 2, 0.5), t: Math.random() * 9, cheer: 0 });
  const bouncer = at(makeCharacter({ skin: SKIN[4], shirt: '#141418', longSleeve: true, sleeve: '#141418', pants: '#141418', hairStyle: 'bald', hair: HAIR[0], glasses: true, tie: true, shoes: '#0c0c0e', scale: 1.14 }), BOUNCER.x, 0, BOUNCER.z, Math.PI / 2);
  bouncer.armL.rotation.set(-1.25, 0, -0.8); bouncer.armR.rotation.set(-1.25, 0, 0.8); // arms folded
  const barman = { c: at(makeCharacter({ skin: pick(SKIN), shirt: '#f2f2f2', longSleeve: true, pants: '#1a1a22', vest: '#1a1a22', tie: true, hair: pick(HAIR), hairStyle: 'short' }), 10.4, 0, 1, -Math.PI / 2), z: 1, to: 1, wait: 2 };
  S = { scene: sc, group: g, dancers, patrons, bouncer, barman, spots, stageLight, ball, tinselMat, t: 0 };
  return S;
}
function table(plain, neon, x, z) {
  addGeo(plain, cylG(14), x, 0.75, z, 0.9, 0.05, 0.9, 0, 0, 0, '#1a0a1e'); addGeo(plain, cylG(8), x, 0.37, z, 0.1, 0.74, 0.1, 0, 0, 0, '#d8a84a');
  addGeo(neon, cylG(8), x, 0.85, z, 0.12, 0.16, 0.12, 0, 0, 0, '#ffb347');
}
function chair(plain, s) {
  const y = s.stool ? 0.78 : 0.48, bx = -Math.sin(s.yaw) * 0.22, bz = -Math.cos(s.yaw) * 0.22;
  box(plain, 0.46, 0.08, 0.46, s.x, y, s.z, s.stool ? '#d8a84a' : '#8a0f3e', s.yaw);
  addGeo(plain, cylG(6), s.x, y / 2, s.z, 0.06, y, 0.06, 0, 0, 0, '#d8a84a');
  if (!s.stool) box(plain, 0.46, 0.5, 0.06, s.x + bx, y + 0.28, s.z + bz, '#8a0f3e', s.yaw);
}

// ---- every frame inside (main.js runs this instead of the city) ----
const _c = new THREE.Color();
export function updateClub(dt) {
  if (!S || !P.club) return;
  S.t += dt; const t = S.t, beat = Math.sin(t / BEAT * Math.PI * 2);
  for (const d of S.dancers) poseDancer(d, t, dt, beat);
  for (const p of S.patrons) {
    const c = p.c; c.head.rotation.x = 0.07 * Math.max(0, beat);
    if (p.cheer > 0) { p.cheer -= dt; c.armR.rotation.set(-2.9 + Math.sin(t * 9) * 0.3, 0, -0.2); if (p.cheer <= 0) c.armR.rotation.set(-0.9, 0, -0.1); }
    else if ((p.t -= dt) <= 0) { p.t = 4 + Math.random() * 10; p.cheer = 1 + Math.random(); }
  }
  // the barman works his way along the counter, stopping to polish it
  const m = S.barman;
  if (m.wait > 0) { m.wait -= dt; m.c.armR.rotation.set(-1.2, Math.sin(t * 6) * 0.4, 0); m.c.legL.rotation.x = m.c.legR.rotation.x = 0; }
  else {
    const step = Math.sign(m.to - m.z) * Math.min(Math.abs(m.to - m.z), dt * 1.2); m.z += step; m.c.root.position.z = m.z;
    const s = Math.sin(t * 7) * 0.5; m.c.legL.rotation.x = s; m.c.legR.rotation.x = -s; m.c.armR.rotation.set(-s * 0.6, 0, 0);
    m.c.root.rotation.y = step >= 0 ? 0 : Math.PI;
    if (Math.abs(m.to - m.z) < 0.01) { m.wait = 2 + Math.random() * 3; m.to = BAR.z0 + 0.6 + Math.random() * (BAR.z1 - BAR.z0 - 1.2); m.c.root.rotation.y = -Math.PI / 2; }
  }
  // the bouncer keeps an eye on you
  const b = S.bouncer, want = Math.atan2(P.x - CLUB_AT.x - b.root.position.x, P.z - CLUB_AT.z - b.root.position.z);
  b.head.rotation.y = clamp(angDiff(b.root.rotation.y, want), -1.1, 1.1);
  // the lights drift round the colour wheel; the mirror ball turns
  for (const s of S.spots) { _c.setHSL((s.hue + t * 0.05) % 1, 0.85, 0.6); s.l.color.copy(_c); s.beam.material.color.copy(_c); }
  S.stageLight.intensity = 12 + 3 * Math.max(0, beat);
  S.ball.rotation.y += dt * 0.8;
  S.tinselMat.color.setScalar(0.85 + 0.15 * Math.sin(t * 3.1));
  if (inv.cur !== 'fist') selectWeapon('fist'); // a number key in here takes nothing out
  Sound.loops('spot', SPEAKERS);
}
// the house groove from the two speakers by the stage
const SPEAKERS = [-1, 1].map(sx => ({ key: 'club' + sx, sound: 'club-house', x: CLUB_AT.x + sx * 7.6, y: ROOM.h - 1.2, z: CLUB_AT.z + ROOM.z0 + 0.8, vol: 1.6, prof: { ref: 6, max: 60 } }));

// A dancer's pose for this moment of the routine (world/club.js routineAt). Going round the pole, the near side (the
// body's +x, the left arm) faces it; climbing, sliding and leaning back, the dancer faces it with both hands on it.
function poseDancer(d, t, dt, beat) {
  const c = d.c, m = routineAt((t + d.offset) / ROUTINE), p = d.pole;
  c.root.position.set(p.x + Math.sin(m.a) * m.r, STAGE.h, p.z + Math.cos(m.a) * m.r); // in the room's own metres
  const round = m.move === 'walk' || m.move === 'spin';
  c.root.rotation.y = m.a + (round ? Math.PI / 2 : Math.PI);
  c.body.position.y = m.lift; c.body.rotation.set(0, 0, 0); c.head.rotation.set(0, 0, 0);
  c.legL.rotation.set(0, 0, 0); c.legR.rotation.set(0, 0, 0); c.shadow.visible = m.lift < 0.1;
  if (m.move === 'walk') {
    d.phase += dt * 5.5; const s = Math.sin(d.phase);
    c.legL.rotation.x = s * 0.45; c.legR.rotation.x = -s * 0.45; c.body.rotation.z = 0.06 * beat;
    c.armL.rotation.set(0, 0, 2.75); c.armR.rotation.set(-0.3 + 0.2 * beat, 0, -0.35);
  } else if (m.move === 'spin') {
    c.legL.rotation.x = -1.2; c.legR.rotation.x = -0.45; c.body.rotation.z = 0.2;
    c.armL.rotation.set(0, 0, 2.75); c.armR.rotation.set(0, 0, -1.5);
  } else if (m.move === 'climb' || m.move === 'slide') {
    const up = Math.min(1, m.r < 0.33 ? 1 : (0.5 - m.r) / 0.18);
    c.armL.rotation.set(-2.7 * up, 0, 0.12); c.armR.rotation.set(-2.5 * up, 0, -0.12);
    c.legL.rotation.set(-0.5, 0, -0.15); c.legR.rotation.set(m.move === 'slide' ? -1.4 : -0.2, 0, 0.15);
    if (m.move === 'slide') c.body.rotation.x = -0.15;
  } else {
    // lean back from the pole and come up again, hips to the beat
    const lean = Math.sin(m.k * Math.PI);
    c.armL.rotation.set(-1.75, 0, -0.15); c.armR.rotation.set(-1.75, 0, 0.15);
    c.body.rotation.x = -0.5 * lean; c.body.rotation.z = 0.08 * beat; c.head.rotation.x = -0.4 * lean;
    c.legL.rotation.x = 0.2 * lean; c.legR.rotation.x = -0.1 * lean;
  }
}
