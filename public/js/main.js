import './core/input.js';
import './shops/shop.js';
import './game/rewards.js';
import { makeCharacter, setGun } from './characters/character.js';
import { selectWeapon, updateRockets } from './combat/combat.js';
import { load, save, serialize } from './core/save.js';
import { G, I, P, cam, inv, stats } from './core/state.js';
import { $ } from './core/util.js';
import { WEAPONS, wStat } from './data/weapons.js';
import { all, count, entities, removeEntity } from './entities/registry.js';
import { makePickup } from './game/pickups.js';
import { respawn, updateCamera, updatePlayer } from './game/player.js';
import { managePopulation } from './game/population.js';
import { updateWanted } from './game/wanted.js';
import { findSpot, spawnNpc } from './npcs/npc.js';
import { updateFx, updateParts } from './render/effects.js';
import { camera, renderer, scene, sky } from './render/scene.js';
import { spawnShop } from './shops/shop.js';
import { updateHUD } from './ui/hud.js';
import { updateEngineSound } from './vehicles/engine.js';
import { spawnTrafficBike, spawnTrafficCar } from './vehicles/traffic.js';
import { spawnVehicle } from './vehicles/vehicle.js';
import { armorSpots, buildWorld, healthSpots, lotSpots, shopSpots, waterBase, waterMesh } from './world/city.js';
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
    G.shootersNow = count(e => e.kind === 'npc' && e.alive && e.burst > 0);
    // every person, vehicle, pickup and shop in the world
    for (const e of all()) if (e.update && !e.removed) e.update(dt);
    updateEngineSound();
    updateRockets(dt); updateParts(dt); updateFx(dt);
    if (G.state !== 'title') updateWanted(dt);
    managePopulation(dt);
    // water swell
    const pos = waterMesh.geometry.attributes.position, arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) { const x = waterBase[i], z = waterBase[i + 2]; arr[i + 1] = 0.1 + Math.sin(x * 0.11 + G.time * 1.3) * 0.28 + Math.cos(z * 0.09 + G.time * 0.9) * 0.22; }
    pos.needsUpdate = true; waterMesh.geometry.computeVertexNormals();
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

// ================= BOOT =================
async function start(data) {
  try { await Promise.race([Promise.all([document.fonts.load('80px "Yellowtail"'), document.fonts.load('80px "Bowlby One"')]), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
  buildWorld(); buildMap(); load(data);
  P.c = makeCharacter({ skin: '#eab48f', shirt: '#2fb8c9', pa: '#ff6fae', pb: '#f6f1e7', pants: '#f4f0e6', hair: '#3a2416', hairStyle: 'mullet', glasses: true, shoes: '#f6f1e7' });
  setGun(P.c, 'pistol'); scene.add(P.c.root);
  if (data && data.cur && inv.owned[data.cur]) selectWeapon(data.cur);
  for (const w of WEAPONS) if (inv.owned[w.id] && inv.mag[w.id] == null) inv.mag[w.id] = wStat(w, inv.lvl[w.id] || 0).mag;
  for (const s of healthSpots) makePickup('health', s[0], s[1]);
  for (const s of armorSpots) makePickup('armor', s[0], s[1]);
  for (const s of shopSpots) spawnShop(s.type, s.x, s.z);
  lotSpots.forEach((s, i) => { spawnVehicle(i % 3 ? 'sedan' : 'modely', s.x, s.z, s.yaw).home = true; });
  P.x = 230; P.z = -40;
  for (let i = 0; i < 26; i++) spawnTrafficCar(false);
  for (let i = 0; i < 4; i++) spawnTrafficBike();
  for (let i = 0; i < 30; i++) { const s = findSpot(5, 80, false, false); if (s) spawnNpc('civilian', s.x, s.z); }
  G.state = 'title';
  const b = $('playBtn'); b.disabled = false; b.textContent = inv.money > 500 || stats.kills ? `Back to the bay ($${inv.money.toLocaleString()})` : 'Hit the streets';
  setInterval(() => { if (G.state === 'play') save(); }, 5000);
}
try { window.claude && window.claude.hot && window.claude.hot.snapshot && window.claude.hot.snapshot(() => ({ inv: serialize(inv, stats), cur: inv.cur })); } catch (e) {}
// ?debug exposes the game state to the console and to the smoke test
if (/[?&]debug\b/.test(location.search)) window.__neonbay = { G, I, P, cam, inv, stats, entities, all, removeEntity, spawnVehicle, spawnNpc, spawnShop };
requestAnimationFrame(frame);
const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
