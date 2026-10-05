import './core/input.js';
import './shops/shop.js';
import { makeCharacter, setGun } from './characters/character.js';
import { selectWeapon, updateRockets } from './combat/combat.js';
import { load, save } from './core/save.js';
import { G, P, bikes, cars, enemies, inv, parkedCars, peds, stats } from './core/state.js';
import { $ } from './core/util.js';
import { WEAPONS, wStat } from './data/weapons.js';
import { makePickup, updatePickups } from './game/pickups.js';
import { respawn, updateCamera, updatePlayer } from './game/player.js';
import { managePopulation } from './game/population.js';
import { updateWanted } from './game/wanted.js';
import { findSpot, spawnPed, updateEnemy, updatePed } from './npcs/actors.js';
import { updateFx, updateParts } from './render/effects.js';
import { camera, renderer, scene, sky } from './render/scene.js';
import { updateHUD } from './ui/hud.js';
import { spawnBikerNear, updateBike, updateEngineSound } from './vehicles/bikes.js';
import { spawnCar, spawnTraffic, updateCar } from './vehicles/cars.js';
import { updateHeli } from './vehicles/heli.js';
import { armorSpots, buildWorld, healthSpots, shops, waterBase, waterMesh } from './world/city.js';
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
    for (const p of peds.slice()) updatePed(p, dt);
    G.shootersNow = enemies.filter(e => e.alive && e.burst > 0).length;
    for (const e of enemies.slice()) updateEnemy(e, dt);
    for (const c of cars.slice()) updateCar(c, dt);
    for (const b of bikes.slice()) updateBike(b, dt);
    updateEngineSound();
    if (G.heli) updateHeli(dt);
    updateRockets(dt); updateParts(dt); updateFx(dt); updatePickups(dt);
    if (G.state !== 'title') updateWanted(dt);
    managePopulation(dt);
    // water swell
    const pos = waterMesh.geometry.attributes.position, arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) { const x = waterBase[i], z = waterBase[i + 2]; arr[i + 1] = 0.1 + Math.sin(x * 0.11 + G.time * 1.3) * 0.28 + Math.cos(z * 0.09 + G.time * 0.9) * 0.22; }
    pos.needsUpdate = true; waterMesh.geometry.computeVertexNormals();
    for (const sh of shops) { sh.glyph.position.y = 3 + Math.sin(G.time * 2) * 0.2; sh.ring.material.opacity = 0.25 + Math.sin(G.time * 4) * 0.08; }
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
  for (const pc of parkedCars) { const c = spawnCar(pc.x, pc.z, pc.dirX, pc.dirZ, 'lot'); c.mesh.grp.rotation.y = pc.dirZ > 0 ? 0 : Math.PI; }
  P.x = 230; P.z = -40;
  for (let i = 0; i < 26; i++) spawnTraffic(false);
  for (let i = 0; i < 4; i++) spawnBikerNear();
  for (let i = 0; i < 30; i++) { const s = findSpot(5, 80, false, false); if (s) spawnPed(s.x, s.z); }
  G.state = 'title';
  const b = $('playBtn'); b.disabled = false; b.textContent = inv.money > 500 || stats.kills ? `Back to the bay ($${inv.money.toLocaleString()})` : 'Hit the streets';
  setInterval(() => { if (G.state === 'play') save(); }, 5000);
}
try { window.claude && window.claude.hot && window.claude.hot.snapshot && window.claude.hot.snapshot(() => ({ inv: { money: inv.money, owned: inv.owned, lvl: inv.lvl, ammo: inv.ammo, stats }, cur: inv.cur })); } catch (e) {}
requestAnimationFrame(frame);
const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
