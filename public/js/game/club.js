import { HAIR, SKIN, charMat, makeCharacter, randomLook, seatedLegs } from '../characters/character.js';
import { selectWeapon } from '../combat/combat.js';
import { Sound } from '../core/audio.js';
import { kb } from '../core/controls.js';
import { emit } from '../core/events.js';
import { save } from '../core/save.js';
import { G, I, P, cam, inv } from '../core/state.js';
import { $, angDiff, clamp, pick, withSeed } from '../core/util.js';
import { addEntity } from '../entities/registry.js';
import { GB, UNIT, addGeo, box, cylG } from '../render/geometry.js';
import { scene } from '../render/scene.js';
import { makeCanvas, neonTexture } from '../render/textures.js';
import { showBig, toast } from '../ui/hud.js';
import { BAR, BOOTHS, BOUNCER, CLUB, CLUB_AT, CLUB_CLOSED_AT, CLUB_NAME, CLUB_TRACKS, DJ, STAGE_TIP, DOOR, POLES, PRIVATE, ROOM, ROUTINE, RUNWAY, SEATS, STAGE, TABLES, TIP, VIP, clubLayout, privateLayout, routineAt } from '../world/club.js';

// ================= INSIDE THE VELVET FLAMINGO =================
// E at the club's door fades out and puts the player in the club, a room drawn in a scene of its own (main.js
// renders it instead of the city while P.club is set). Like the gun shop's menu, the city waits outside: nothing
// out there moves, and the heat is where you left it when you come back out. No guns inside: the bouncer sees to
// that, so it's fists only (and no throwing them) until you are back on the street. The room is built the first time you go in.
const REACH = 1.8;
export const DRINK = { name: 'Flamingo Fizz', price: 20, hp: 15 };
const ECHO = { wet: 0.3, delay: 0.03, tail: 0.55 }; // a small room with a hard floor (Sound.room)
const BEAT = 0.5; // the house groove plays at 120 bpm: dancers and heads move to it
export const LAYOUT = clubLayout(), PINK = privateLayout();
let S = null; // the scene and everyone in it, once built
export const clubShow = { time: 0, tipUntil: 0, requestUntil: 0, track: 0 };
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
  if (P.club === PINK) { near.push({ keys: ['use'], priority: 1, dist: 0, prompt: `Press <kbd>${kb('use')}</kbd> to head back to the floor`, run: () => fadeThen(backToFloor) }); return; }
  const tipDist = Math.hypot(p.x - CLUB_AT.x - STAGE_TIP.x, p.z - CLUB_AT.z - STAGE_TIP.z);
  if (tipDist < REACH) near.push({ keys: ['use'], priority: 2, dist: tipDist, prompt: `Press <kbd>${kb('use')}</kbd> to tip the stage ($${STAGE_TIP.price})`, run: tipStage });
  const djDist = Math.hypot(p.x - CLUB_AT.x - DJ.front.x, p.z - CLUB_AT.z - DJ.front.z);
  if (djDist < REACH) near.push({ keys: ['use'], priority: 2, dist: djDist, prompt: `Press <kbd>${kb('use')}</kbd> for a DJ request: ${CLUB_TRACKS[(clubShow.track + 1) % CLUB_TRACKS.length].name} ($${DJ.price})`, run: requestTrack });
  const hd = Math.hypot(p.x - (PRIVATE.host.x + CLUB_AT.x), p.z - (PRIVATE.host.z + CLUB_AT.z));
  if (hd < REACH) near.push({ keys: ['use'], priority: 1, dist: hd, prompt: `Press <kbd>${kb('use')}</kbd> for a private dance in the Pink Room ($${PRIVATE.price})`, run: () => { if (payPrivate()) fadeThen(intoPinkRoom); } });
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

// These are approached on the floor, like the bar. Cooldowns use club time, so pauses freeze them.
const canUseFloor = at => P.alive && G.state === 'play' && P.club === LAYOUT && !G.stairs
  && Math.hypot(P.x - CLUB_AT.x - at.x, P.z - CLUB_AT.z - at.z) < REACH;
export function tipStage() {
  if (!canUseFloor(STAGE_TIP) || clubShow.time < clubShow.tipUntil) return false;
  if (inv.money < STAGE_TIP.price) { Sound.deny(); toast('A stage tip is $20.', 2); return false; }
  inv.money -= STAGE_TIP.price; clubShow.tipUntil = clubShow.time + STAGE_TIP.cooldown;
  if (S) {
    S.tipFlash = 3;
    for (const p of S.patrons) p.cheer = 2.5;
    for (const d of S.dancers) d.thanks = 2;
    throwBills();
  }
  Sound.buy(); toast('The stage lights up. Thanks for the tip!', 2.5); save(); emit('club:tip', { price: STAGE_TIP.price }); return true;
}
export function requestTrack() {
  if (!canUseFloor(DJ.front) || clubShow.time < clubShow.requestUntil) return false;
  if (inv.money < DJ.price) { Sound.deny(); toast(`A DJ request is $${DJ.price}.`, 2); return false; }
  inv.money -= DJ.price; clubShow.track = (clubShow.track + 1) % CLUB_TRACKS.length;
  clubShow.requestUntil = clubShow.time + DJ.cooldown;
  if (S) { S.tipFlash = 2; for (const p of S.patrons) p.cheer = 1.5; }
  Sound.buy(); toast(`Now playing: ${CLUB_TRACKS[clubShow.track].name}`, 3); save(); return true;
}
function throwBills() {
  // A fixed pool avoids adding geometry or materials every time the player tips.
  for (let i = 0; i < S.bills.length; i++) {
    const b = S.bills[i]; b.life = 2.8 + i * 0.07;
    b.mesh.visible = true; b.mesh.position.set(STAGE_TIP.x, 1.2, STAGE_TIP.z - 0.5);
    b.vx = (Math.random() - 0.5) * 1.7; b.vy = 2 + Math.random(); b.vz = -1.4 - Math.random();
  }
}

// the host takes the money up front
export function payPrivate() {
  if (inv.money < PRIVATE.price) { Sound.deny(); toast(`A private dance is $${PRIVATE.price}. Come back with some cash.`, 2.5); return false; }
  inv.money -= PRIVATE.price; Sound.buy(); save();
  return true;
}
// a short fade to black hides the move, as on the roof stairs
function fadeThen(fn) {
  if (G.stairs) return;
  G.stairs = true; $('fade').classList.add('on');
  setTimeout(() => { G.stairs = false; $('fade').classList.remove('on'); if (P.alive && !P.vehicle) fn(); }, 280);
}
const goThrough = inside => fadeThen(inside ? enterClub : leaveClub);
// through the curtain: sat in the armchair in front of the Pink Room's pole until E takes you back out to the floor
export function intoPinkRoom() {
  if (!P.club) return;
  build(); P.club = PINK; stand(PINK.seat.x, PINK.seat.z, PINK.seat.yaw); P.sitting = true; cam.pitch = 0.05;
  if (S.pink) S.pink.offset = -S.t; // the dance starts from the top
}
export function backToFloor() {
  if (P.club !== PINK) return;
  standUp(); P.club = LAYOUT; stand(PRIVATE.back.x + CLUB_AT.x, PRIVATE.back.z + CLUB_AT.z, PRIVATE.back.yaw);
}
function standUp() {
  if (!P.sitting) return;
  P.sitting = false; const c = P.c; c.legL.geometry = c.legR.geometry = c.legGeo; c.shadow.visible = true;
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
  standUp(); P.club = null; scene.add(P.c.root); if (held && inv.owned[held]) selectWeapon(held); held = null;
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
// The dancers (and the one in the Pink Room): sequinned bikinis (a top with a band round the back, and bottoms
// over the hips) and knee boots. Everything a bikini covers stays covered.
const DANCERS = [
  { skin: SKIN[1], hair: HAIR[2], hairStyle: 'long', outfit: '#ff3fa4', boots: '#f4f0f6' },
  { skin: SKIN[4], hair: HAIR[0], hairStyle: 'bigafro', outfit: '#9b5bff', boots: '#2a2226' },
  { skin: SKIN[2], hair: HAIR[3], hairStyle: 'long', outfit: '#ffd23e', boots: '#2a2226' },
];
const PINK_DANCER = { skin: SKIN[0], hair: HAIR[1], hairStyle: 'long', outfit: '#3fe0d0', boots: '#f4f0f6' };
// Everyone in the club is a woman: the character with narrower shoulders, a slimmer waist over the hips, slimmer
// arms and legs, and a touch of make-up (lipstick, lashes) and gold earrings.
const FACE = (() => {
  const g = new GB();
  box(g, 0.1, 0.03, 0.012, 0, 0.14, 0.156, '#c8235a'); // lipstick
  for (const x of [-0.07, 0.07]) box(g, 0.07, 0.016, 0.012, x, 0.3, 0.153, '#140a10'); // lashes
  for (const x of [-0.162, 0.162]) box(g, 0.025, 0.05, 0.025, x, 0.2, 0.03, '#ffd23e'); // earrings
  return g.geometry();
})();
export function makeWoman(L) {
  const c = makeCharacter(L);
  const torso = c.body.children.find(m => m.isMesh && m.geometry === UNIT);
  torso.scale.set(0.42, 0.6, 0.26);
  const chest = new THREE.Mesh(UNIT, torso.material); chest.scale.set(0.36, 0.17, 0.07); chest.position.set(0, 1.33, 0.15); c.body.add(chest);
  for (const [arm, s] of [[c.armL, 1], [c.armR, -1]]) { arm.position.x = s * 0.29; arm.scale.set(0.8, 1, 0.82); }
  for (const [leg, s] of [[c.legL, 1], [c.legR, -1]]) { leg.position.x = s * 0.11; leg.scale.set(0.86, 1, 0.9); }
  c.head.add(new THREE.Mesh(FACE, charMat));
  return c;
}
const HAIRDOS = ['long', 'long', 'long', 'bigafro', 'afro', 'short'];
const womanLook = () => ({ ...randomLook(), hairStyle: pick(HAIRDOS), glasses: Math.random() < 0.15 });
function makeDancer(o) {
  const c = makeWoman({ skin: o.skin, shirt: o.skin, pants: o.skin, hair: o.hair, hairStyle: o.hairStyle, shoes: o.boots });
  const mat = sequinMat(o.outfit), chest = c.body.children.filter(m => m.isMesh && m.geometry === UNIT)[1];
  chest.material = mat; chest.scale.set(0.38, 0.15, 0.08); // the bikini top
  const piece = (w, h, d, y, z = 0) => { const m = new THREE.Mesh(UNIT, mat); m.scale.set(w, h, d); m.position.set(0, y, z); c.body.add(m); return m; };
  piece(0.43, 0.06, 0.27, 1.35); // its band round the back
  piece(0.5, 0.13, 0.29, 0.94); // the bottoms
  piece(0.2, 0.08, 0.02, 0.89, 0.145); // narrowing to the front
  // boots up to the knee
  const bg = new GB(); box(bg, 0.18, 0.3, 0.2, 0, -0.68, 0, o.boots);
  for (const leg of [c.legL, c.legR]) leg.add(new THREE.Mesh(bg.geometry(), charMat));
  return c;
}
// The room comes out the same for everyone in a day (who sits where, how they look), and the dancers keep the wall
// clock's time, so players in multiplayer share one club (net/remote.js shows them to each other on the floor)
const DAY = () => Math.floor(Date.now() / 864e5);
function build() { return S || withSeed(DAY(), buildRoom); }
function buildRoom() {
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
  // The DJ booth: twin decks, mixer, headphones and a lit request sign beside the stage.
  box(plain, 2, 1.05, 1.1, DJ.x, 0.525, DJ.z, '#170c20');
  box(neon, 2.04, 0.06, 1.12, DJ.x, 1.07, DJ.z, '#ff3fa4');
  for (const x of [DJ.x - 0.55, DJ.x + 0.55]) {
    addGeo(plain, cylG(16), x, 1.12, DJ.z, 0.65, 0.06, 0.65, 0, 0, 0, '#19161e');
    addGeo(neon, cylG(12), x, 1.16, DJ.z, 0.14, 0.02, 0.14, 0, 0, 0, '#3ff0ff');
  }
  for (let i = 0; i < 4; i++) box(neon, 0.035, 0.02, 0.18, DJ.x - 0.12 + i * 0.08, 1.12, DJ.z + 0.05, '#ffd23e');
  // Small stacks of bills and tip trays along the stage lip make the tipping spot visible.
  for (const x of [-1.3, 1.3]) { box(plain, 0.4, 0.04, 0.24, x, STAGE.h + 0.04, -0.7, '#d8a84a'); box(plain, 0.23, 0.035, 0.12, x, STAGE.h + 0.08, -0.7, '#80bb85'); }
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
  // the Pink Room's doorway: a velvet curtain in a gold frame, Private over it
  { const c = PRIVATE.curtain;
    box(plain, 2.2, 2.7, 0.12, c.x, 1.35, c.z - 0.06, '#d8a84a');
    for (let k = 0; k < 9; k++) box(plain, 0.2, 2.45, 0.08 + (k % 2) * 0.04, c.x - 0.8 + k * 0.2, 1.23, c.z - 0.16, k % 2 ? '#a3125a' : '#7a0a44');
  }
  // the door out, with Exit over it
  box(plain, 2, 2.5, 0.1, DOOR.x, 1.25, DOOR.z - 0.05, '#1a1020'); box(neon, 1.6, 2.2, 0.06, DOOR.x, 1.1, DOOR.z - 0.11, '#5a1838');
  g.add(new THREE.Mesh(plain.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })), new THREE.Mesh(neon.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  const sign = (text, color, font, w, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: neonTexture(text, color, font), transparent: true, depthWrite: false })); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); };
  sign(CLUB_NAME, '#ff4fd8', '"Yellowtail", cursive', 5.6, 0, STAGE.h + 3.3, z0 + 0.16, 0);
  sign('TIPS', '#ffd23e', '"Bowlby One", Impact, sans-serif', 0.9, 0, 0.34, TIP.z1 + 0.04, 0);
  sign('DJ · REQUESTS', '#3ff0ff', '"Bowlby One", Impact, sans-serif', 2.2, DJ.x, 2.8, ROOM.z0 + 0.16, 0);
  sign('Bar', '#3ff0ff', '"Bowlby One", Impact, sans-serif', 2.2, x1 - 0.12, 3.5, (BAR.z0 + BAR.z1) / 2, -Math.PI / 2);
  sign('Private', '#ff7ad8', '"Yellowtail", cursive', 1.9, PRIVATE.curtain.x, 3.05, PRIVATE.curtain.z - 0.2, Math.PI);
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
  for (const s of SEATS) if (Math.random() < 0.75) patrons.push({ c: sit(makeWoman(womanLook()), s.x, s.z, s.yaw, s.stool ? 0.8 : 0.5), t: Math.random() * 9, cheer: 0 });
  for (const b of BOOTHS) for (const dz of [-0.75, 0.75]) if (Math.random() < 0.7) patrons.push({ c: sit(makeWoman(womanLook()), -10.75, b.z + dz, Math.PI / 2, 0.5), t: Math.random() * 9, cheer: 0 });
  const bouncer = at(makeWoman({ skin: SKIN[4], shirt: '#141418', longSleeve: true, sleeve: '#141418', pants: '#141418', hairStyle: 'short', hair: HAIR[0], glasses: true, tie: true, shoes: '#0c0c0e', scale: 1.1 }), BOUNCER.x, 0, BOUNCER.z, Math.PI / 2);
  bouncer.armL.rotation.set(-1.25, 0, -0.8); bouncer.armR.rotation.set(-1.25, 0, 0.8); // arms folded
  const barman = { c: at(makeWoman({ skin: pick(SKIN), shirt: '#f2f2f2', longSleeve: true, pants: '#1a1a22', vest: '#1a1a22', tie: true, hair: pick(HAIR), hairStyle: 'long' }), 10.4, 0, 1, -Math.PI / 2), z: 1, to: 1, wait: 2 };
  // the host by the Pink Room's curtain, in a long sequinned dress
  const host = at(makeWoman({ skin: SKIN[3], shirt: '#b0306a', pants: '#b0306a', hair: HAIR[0], hairStyle: 'long', shoes: '#2a2226' }), PRIVATE.host.x, 0, PRIVATE.host.z, Math.PI);
  { const m = sequinMat('#b0306a'); for (const o of host.body.children) if (o.isMesh && o.geometry === UNIT) o.material = m; const d = new THREE.Mesh(UNIT, m); d.scale.set(0.54, 0.8, 0.34); d.position.y = 0.52; host.body.add(d); }
  host.armR.rotation.set(-0.5, 0, 0.35); host.armL.rotation.set(-0.5, 0, -0.35);
  const dj = at(makeWoman({ skin: SKIN[2], shirt: '#3fe0d0', pants: '#181420', hair: HAIR[0], hairStyle: 'short', glasses: true }), DJ.x, 0, DJ.z - 0.9, 0);
  for (const side of [-1, 1]) { const pad = new THREE.Mesh(UNIT, charMat); pad.scale.set(0.065, 0.18, 0.14); pad.position.set(side * 0.17, 0.2, 0); dj.head.add(pad); }
  const billGeo = new THREE.PlaneGeometry(0.22, 0.1), billMat = new THREE.MeshBasicMaterial({ color: '#91c78b', side: THREE.DoubleSide });
  const bills = Array.from({ length: 10 }, () => { const mesh = new THREE.Mesh(billGeo, billMat); mesh.name = 'stage-tip-bill'; mesh.visible = false; g.add(mesh); return { mesh, life: 0 }; });
  const pink = buildPinkRoom(g);
  pink.c = at(makeDancer(PINK_DANCER), pink.pole.x, VIP.stage.h, pink.pole.z, 0);
  S = { scene: sc, group: g, dancers, patrons, bouncer, barman, host, dj, bills, tipFlash: 0, pink, spots, stageLight, ball, tinselMat, t: (Date.now() / 1000) % 3600 };
  return S;
}
// The Pink Room: walls in deep rose with a dado and a neon line, a mirrored back wall, a round platform with a pole,
// an armchair facing it and a soft rose light over the pole
function buildPinkRoom(g) {
  const plain = new GB(), neon = new GB(), o = VIP.at, { x0, x1, z0, z1, h } = VIP, W = x1 - x0, D = z1 - z0, mz = o.z + (z0 + z1) / 2, P2 = { x: o.x + VIP.pole.x, z: o.z + VIP.pole.z };
  box(plain, W, 0.1, D, o.x, -0.05, mz, '#3a1030'); box(plain, W, 0.2, D, o.x, h + 0.1, mz, '#1a0614');
  for (const [cx, cz, w, d] of [[o.x, o.z + z0 - 0.1, W, 0.2], [o.x, o.z + z1 + 0.1, W, 0.2], [o.x + x0 - 0.1, mz, 0.2, D], [o.x + x1 + 0.1, mz, 0.2, D]]) {
    box(plain, w, h, d, cx, h / 2, cz, '#6a1a48'); box(plain, w + 0.04, 1, d + 0.04, cx, 0.5, cz, '#2a0820');
    box(neon, w > 1 ? w - 0.1 : 0.04, 0.05, d > 1 ? d - 0.1 : 0.04, cx + (w > 1 ? 0 : Math.sign(o.x - cx) * 0.12), h - 0.35, cz + (d > 1 ? 0 : Math.sign(mz - cz) * 0.12), '#ff6fc2');
  }
  box(neon, W - 1, 2, 0.04, o.x, 1.8, o.z + z0 + 0.03, '#3a2240'); // the mirror
  const st = VIP.stage;
  addGeo(plain, cylG(18), P2.x, st.h / 2, P2.z, st.x1 - st.x0, st.h, st.z1 - st.z0, 0, 0, 0, '#140810');
  addGeo(neon, cylG(18), P2.x, st.h - 0.02, P2.z, st.x1 - st.x0 + 0.04, 0.03, st.z1 - st.z0 + 0.04, 0, 0, 0, '#ff3fa4');
  addGeo(plain, cylG(10), P2.x, (st.h + h) / 2, P2.z, 0.08, h - st.h, 0.08, 0, 0, 0, '#e9e4f2');
  // the armchair
  const s = { x: o.x + VIP.seat.x, z: o.z + VIP.seat.z };
  const ry = VIP.seat.yaw - Math.PI, bx = -Math.sin(VIP.seat.yaw), bz = -Math.cos(VIP.seat.yaw), ax = Math.cos(VIP.seat.yaw), az = -Math.sin(VIP.seat.yaw);
  box(plain, 0.9, 0.45, 0.8, s.x, 0.22, s.z, '#8a0f3e', ry); box(plain, 0.9, 0.9, 0.2, s.x + bx * 0.4, 0.7, s.z + bz * 0.4, '#6a0a30', ry);
  for (const k of [-0.45, 0.45]) box(plain, 0.16, 0.65, 0.8, s.x + ax * k, 0.33, s.z + az * k, '#6a0a30', ry);
  g.add(new THREE.Mesh(plain.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })), new THREE.Mesh(neon.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  const l = new THREE.PointLight('#ff6fb8', 9, 8, 1.6); l.position.set(P2.x, h - 0.3, P2.z + 0.6); g.add(l);
  const fill = new THREE.PointLight('#a060ff', 4, 8, 1.6); fill.position.set(s.x, h - 0.4, s.z); g.add(fill);
  return { pole: P2, floor: st.h, offset: 0, phase: 0, light: l };
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
  S.t = (Date.now() / 1000) % 3600; clubShow.time += dt; const t = S.t, beat = Math.sin(t / BEAT * Math.PI * 2);
  for (const d of S.dancers) poseDancer(d, t, dt, beat);
  if (P.club === PINK) {
    poseDancer(S.pink, t, dt, beat); S.pink.light.intensity = 8 + 2 * Math.max(0, beat);
    // the player sits back in the armchair
    const c = P.c; c.legL.geometry = c.legR.geometry = seatedLegs(c); c.shadow.visible = false;
    c.legL.rotation.set(-0.1, 0, 0); c.legR.rotation.set(-0.1, 0, 0); c.armL.rotation.set(-0.9, 0, 0.1); c.armR.rotation.set(-0.9, 0, -0.1);
    c.root.position.y = PINK.seat.top + 0.06 - 0.9; c.head.rotation.x = 0.05 * Math.max(0, beat);
  }
  S.tipFlash = Math.max(0, S.tipFlash - dt);
  S.dj.head.rotation.x = 0.12 * Math.max(0, beat); S.dj.armL.rotation.set(-1.1, 0, 0.12); S.dj.armR.rotation.set(-1.2, Math.sin(t * 2) * 0.3, -0.1);
  for (const b of S.bills) if (b.life > 0) {
    b.life -= dt; b.vy -= 3 * dt;
    b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt; b.mesh.position.y = Math.max(STAGE.h + 0.03, b.mesh.position.y + b.vy * dt);
    b.mesh.rotation.set(t * 2 + b.life, t + b.life, Math.sin(t * 3 + b.life)); b.mesh.visible = b.life > 0;
  }
  S.host.head.rotation.y = 0.3 * Math.sin(t * 0.4);
  for (const p of S.patrons) {
    const c = p.c; c.head.rotation.x = 0.07 * Math.max(0, beat);
    if (p.cheer > 0) { p.cheer -= dt; c.armR.rotation.set(-2.9 + Math.sin(t * 9) * 0.3, 0, -0.2); if (p.cheer <= 0) c.armR.rotation.set(-0.9, 0, -0.1); }
    else if ((p.t -= dt) <= 0) { p.t = 4 + Math.random() * 10; p.cheer = 1 + Math.random(); }
  }
  // the barmaid works her way along the counter, stopping to polish it
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
  for (const s of S.spots) { _c.setHSL((s.hue + t * 0.05) % 1, 0.85, 0.6); s.l.color.copy(_c); s.beam.material.color.copy(_c); s.l.intensity = S.tipFlash > 0 || Math.floor(t / 12) % POLES.length === Math.round(s.hue * POLES.length) ? 48 : 22; }
  S.stageLight.intensity = (S.tipFlash > 0 ? 22 : 12) + 3 * Math.max(0, beat);
  S.ball.rotation.y += dt * 0.8;
  S.tinselMat.color.setScalar(0.85 + 0.15 * Math.sin(t * 3.1));
  if (inv.cur !== 'fist') selectWeapon('fist'); // a number key in here takes nothing out
  Sound.loops('spot', clubSpeakers());
}
// the house groove from the two speakers by the stage
const SPEAKERS = [...[-1, 1].map(sx => ({ key: 'club' + sx, sound: 'club-house', x: CLUB_AT.x + sx * 7.6, y: ROOM.h - 1.2, z: CLUB_AT.z + ROOM.z0 + 0.8, vol: 1.6, prof: { ref: 6, max: 60 } })),
  // and a little one in the Pink Room
  { key: 'clubPink', sound: 'club-house', x: CLUB_AT.x + VIP.at.x, y: VIP.h - 0.5, z: CLUB_AT.z + VIP.at.z + VIP.z0 + 0.4, vol: 1.2, prof: { ref: 3, max: 14 } }];

// A request changes source keys too: audio loops are cached by key, so the old groove must be replaced.
export const clubSpeakers = () => SPEAKERS.map(s => ({ ...s, sound: CLUB_TRACKS[clubShow.track].sound, key: `${s.key}:${clubShow.track}` }));

// A dancer's pose for this moment of the routine (world/club.js routineAt). Going round the pole, the near side (the
// body's +x, the left arm) faces it; climbing, sliding and leaning back, the dancer faces it with both hands on it.
function poseDancer(d, t, dt, beat) {
  const c = d.c, m = routineAt((t + d.offset) / ROUTINE), p = d.pole;
  c.root.position.set(p.x + Math.sin(m.a) * m.r, d.floor ?? STAGE.h, p.z + Math.cos(m.a) * m.r); // in the room's own metres
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
  if (d.thanks > 0) { d.thanks -= dt; c.head.rotation.y = clamp(angDiff(c.root.rotation.y, Math.atan2(P.x - CLUB_AT.x - c.root.position.x, P.z - CLUB_AT.z - c.root.position.z)), -0.7, 0.7); }
}
