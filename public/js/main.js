import './three.js'; // first, so every module below sees the THREE global
import './core/input.js';
import './shops/shop.js';
import './game/rewards.js';
import './ui/settings.js';
import { makeCharacter, setGun } from './characters/character.js';
import { selectWeapon, updateRockets } from './combat/combat.js';
import { Sound } from './core/audio.js';
import { load, save, serialize } from './core/save.js';
import { settings } from './core/settings.js';
import { G, I, P, cam, inv, stats } from './core/state.js';
import { $ } from './core/util.js';
import { WBY, WEAPONS, wStat } from './data/weapons.js';
import { all, count, entities, removeEntity } from './entities/registry.js';
import { makePickup, makeWeaponPickup } from './game/pickups.js';
import { respawn, updateCamera, updatePlayer } from './game/player.js';
import { managePopulation } from './game/population.js';
import { spawnRoofDoor } from './game/rooftop.js';
import { updateWanted } from './game/wanted.js';
import { findSpot, spawnNpc } from './npcs/npc.js';
import { updateFx, updateParts } from './render/effects.js';
import { buildLighting, lighting, updateLighting } from './render/lighting.js';
import { camera, renderer, scene, sky } from './render/scene.js';
import { spawnShop } from './shops/shop.js';
import { updateHUD } from './ui/hud.js';
import { updateEngineSound } from './vehicles/engine.js';
import { spawnTrafficBike, spawnTrafficCar } from './vehicles/traffic.js';
import { spawnVehicle } from './vehicles/vehicle.js';
import { loadLandmarkModels } from './world/landmarks.js';
import { updateProps } from './world/props.js';
import { SPAWN, armorSpots, buildWorld, healthSpots, lotSpots, shopSpots, waterBase, waterMesh } from './world/city.js';
import { isFree } from './world/collision.js';
import { updateEdges } from './world/edges.js';
import { ROOFS } from './world/rooftops.js';
import { buildMap, drawRadar } from './world/radar.js';

// ================= MAIN LOOP =================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'loading') return;
  const live = G.state === 'play' || G.state === 'dead' || G.state === 'title';
  if (live) {
    G.time += dt;
    if (G.state === 'play') updatePlayer(dt);
    else if (G.state === 'dead') { updatePlayer(dt); G.deadT += dt; if (G.deadT > 3.6) respawn(); }
    Sound.listen(); // the ears follow the player and the camera before this frame's sounds play
    G.shootersNow = count(e => e.kind === 'npc' && e.alive && e.burst > 0);
    // every person, vehicle, pickup and shop in the world
    for (const e of all()) if (e.update && !e.removed) e.update(dt);
    updateEngineSound();
    updateRockets(dt); updateProps(dt); updateParts(dt); updateFx(dt); updateLighting(dt);
    if (G.state !== 'title') updateWanted(dt);
    managePopulation(dt);
    // water swell
    if (settings.water) {
      const pos = waterMesh.geometry.attributes.position, arr = pos.array;
      for (let i = 0; i < arr.length; i += 3) { const x = waterBase[i], z = waterBase[i + 2]; arr[i + 1] = 0.1 + Math.sin(x * 0.11 + G.time * 1.3) * 0.28 + Math.cos(z * 0.09 + G.time * 0.9) * 0.22; }
      pos.needsUpdate = true; waterMesh.geometry.computeVertexNormals();
    }
    updateEdges(G.time);
  }
  if (G.state === 'title') {
    const t = G.time * 0.05;
    camera.position.set(238 + Math.sin(t) * 6, 6 + Math.sin(t * 0.7) * 1.5, -40 + Math.sin(t * 0.6) * 90);
    camera.lookAt(185, 7, camera.position.z + 18);
    if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); }
    P.x = camera.position.x - 30; P.z = camera.position.z;
  } else if (G.state !== 'loading') {
    updateCamera(dt);
    updateHUD(); drawRadar();
  }
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').classList.remove('show'); }
  if (G.bigT > 0) { G.bigT -= dt; if (G.bigT <= 0) $('bigText').classList.remove('show'); }
  if (G.radioT > 0) { G.radioT -= dt; if (G.radioT <= 0) $('radio').classList.remove('show'); }
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

// melee weapons in the street: near the health and armor pickups, the everyday ones closest to the hospital
// you start at and the katana and chainsaw further out. One that turns up while you hold a melee weapon goes in your hand.
const STREET_MELEE = ['bat', 'knuckles', 'nightstick', 'golf', 'knife', 'machete', 'katana', 'chainsaw'];
function placeMeleePickups() {
  const spots = [...healthSpots.map(s => [s[0] - 10, s[1] + 6]), ...armorSpots.map(s => [s[0] + 6, s[1]])]
    .map(s => [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].map(o => [s[0] + o[0], s[1] + o[1]]).find(p => isFree(p[0], p[1], 0.8)))
    .filter(Boolean).sort((a, b) => Math.hypot(a[0] - SPAWN.x, a[1] - SPAWN.z) - Math.hypot(b[0] - SPAWN.x, b[1] - SPAWN.z));
  // one of each, then a second of the everyday ones further out (twelve in all), spread over the city
  const ids = [...STREET_MELEE, ...STREET_MELEE.slice(0, 4)].slice(0, spots.length);
  ids.forEach((id, i) => {
    const s = spots[Math.floor(i * spots.length / ids.length)];
    makeWeaponPickup(id, s[0], s[1], got => { if (WBY[inv.cur].melee) selectWeapon(got); save(); });
  });
}

// ================= BOOT =================
// move the loading bar, then give the browser a moment to paint it before the next blocking chunk of work
// (rAF stalls in background tabs, so a timeout backs it up)
const loadStep = (p, label) => { window.loadingScreen?.step(p, label); return new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 60); }); };
async function start(data) {
  await loadStep(0.35, 'Tuning Neon FM');
  try { await Promise.race([Promise.all([document.fonts.load('80px "Yellowtail"'), document.fonts.load('80px "Bowlby One"')]), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
  await loadLandmarkModels();
  await loadStep(0.5, 'Pouring Ocean Drive');
  buildWorld(); buildLighting();
  await loadStep(0.7, 'Planting the palm trees');
  buildMap(); load(data);
  P.c = makeCharacter({ skin: '#eab48f', shirt: '#2fb8c9', pa: '#ff6fae', pb: '#f6f1e7', pants: '#f4f0e6', hair: '#3a2416', hairStyle: 'mullet', glasses: true, shoes: '#f6f1e7' });
  setGun(P.c, 'pistol'); scene.add(P.c.root);
  if (data && data.cur && inv.owned[data.cur]) selectWeapon(data.cur);
  for (const w of WEAPONS) if (inv.owned[w.id] && inv.mag[w.id] == null) inv.mag[w.id] = wStat(w, inv.lvl[w.id] || 0).mag;
  await loadStep(0.8, 'Parking the cars');
  for (const s of healthSpots) makePickup('health', s[0], s[1]);
  for (const s of armorSpots) makePickup('armor', s[0], s[1]);
  placeMeleePickups();
  for (const s of shopSpots) spawnShop(s.type, s.x, s.z);
  for (const r of ROOFS) spawnRoofDoor(r);
  lotSpots.forEach((s, i) => { spawnVehicle(i % 3 ? 'sedan' : 'modely', s.x, s.z, s.yaw).home = true; });
  P.x = 230; P.z = -40;
  for (let i = 0; i < 26; i++) spawnTrafficCar(false);
  for (let i = 0; i < 4; i++) spawnTrafficBike();
  await loadStep(0.9, 'Waking up the neighbourhood');
  for (let i = 0; i < 30; i++) { const s = findSpot(5, 80, false, false); if (s) spawnNpc('civilian', s.x, s.z); }
  G.state = 'title';
  const b = $('playBtn'); b.disabled = false; b.textContent = inv.money > 500 || stats.kills ? `Back to the city ($${inv.money.toLocaleString()})` : 'Hit the streets';
  setInterval(() => { if (G.state === 'play') save(); }, 5000);
  // hold on the full bar until the title camera has drawn the city once
  await loadStep(1, 'Ready');
  window.loadingScreen?.done();
}
try { window.claude && window.claude.hot && window.claude.hot.snapshot && window.claude.hot.snapshot(() => ({ inv: serialize(inv, stats), cur: inv.cur })); } catch (e) {}
// ?debug exposes the game state to the console and to the smoke test
if (/[?&]debug\b/.test(location.search)) window.__neonbay = { G, I, P, Sound, cam, inv, stats, entities, all, removeEntity, spawnVehicle, spawnNpc, spawnShop, lighting, ROOFS };
requestAnimationFrame(frame);
const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
