import { cycleWeapon, selectWeapon, startReload } from '../combat/combat.js';
import { Sound } from './audio.js';
import { save } from './save.js';
import { G, I, P, cam, keys, stats } from './state.js';
import { $, clamp } from './util.js';
import { WEAPONS } from '../data/weapons.js';
import { all, removeEntity } from '../entities/registry.js';
import { interact } from '../game/interact.js';
import { camera, canvasEl, renderer } from '../render/scene.js';
import { closeShop } from '../shops/shop.js';
import { drawWeaponIcon, showRadio, toast } from '../ui/hud.js';
import { SPAWN } from '../world/city.js';

export function requestLock(fromClick) {
  I.lockFromClick = !!fromClick;
  try { const r = canvasEl.requestPointerLock(); if (r && r.catch) r.catch(() => {}); }
  catch (e) { if (fromClick && ++I.lockFails >= 2) I.noLock = true; }
}
document.addEventListener('pointerlockchange', () => {
  I.locked = document.pointerLockElement === canvasEl; if (I.locked) I.lockFails = 0;
  if (!I.locked && G.state === 'play') pauseGame();
});
document.addEventListener('pointerlockerror', () => { if (I.lockFromClick && ++I.lockFails >= 2) { I.noLock = true; toast('Mouse capture is blocked here, so look around by moving the cursor. <em>P</em> pauses.'); } });
document.addEventListener('mousemove', e => {
  if (G.state !== 'play') return;
  if (I.locked || I.noLock) { I.mouseDX += clamp(e.movementX || 0, -200, 200); I.mouseDY += clamp(e.movementY || 0, -200, 200); }
});
canvasEl.addEventListener('mousedown', e => {
  if (G.state !== 'play') return;
  if (!I.locked) { requestLock(true); if (!I.noLock) return; }
  if (e.button === 0) { I.mouseL = { fresh: true }; I.clickQ = 0.3; }
  if (e.button === 2) I.mouseR = true;
});
document.addEventListener('mouseup', e => { if (e.button === 0) I.mouseL = false; if (e.button === 2) I.mouseR = false; });
canvasEl.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', e => { if (G.state === 'play') cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
document.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && G.state === 'play') e.preventDefault();
  if (G.state === 'shop') { if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); closeShop(); } return; }
  if (G.state === 'paused') { if (e.code === 'Enter' || e.code === 'KeyP') resumeGame(); return; }
  if (G.state !== 'play') return;
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if ((e.code === 'KeyF' || e.code === 'KeyE') && P.alive) interact(e.code);
  if (e.code === 'KeyM') { const on = Sound.toggleMusic(); showRadio(on ? 'Neon FM 86.0' : 'Radio off'); }
  if (e.code === 'KeyP' || (e.code === 'Escape' && I.noLock)) pauseGame();
  const n = parseInt(e.key, 10); if (n >= 1 && n <= 6) selectWeapon(WEAPONS[n - 1].id);
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; I.mouseL = false; I.mouseR = false; });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'paused'; I.mouseL = false; I.mouseR = false; for (const k in keys) keys[k] = false;
  $('pause').hidden = false; $('pauseStats').textContent = `${stats.kills} takedowns · ${stats.cops} law enforcement · best heat ${'★'.repeat(stats.best) || 'none'} · $${stats.earned.toLocaleString()} earned`;
  Sound.setSiren(0); Sound.setHeli(0); Sound.setEngine(0, 1000); save();
  setTimeout(() => $('resumeBtn').focus(), 20);
}
function resumeGame(fromClick) { if (G.state !== 'paused') return; $('pause').hidden = true; G.state = 'play'; requestLock(fromClick === true); }
$('resumeBtn').addEventListener('click', () => resumeGame(true));
$('playBtn').addEventListener('click', () => {
  Sound.init(); $('title').hidden = true; $('hud').hidden = false; G.state = 'play';
  P.x = SPAWN.x; P.z = SPAWN.z; P.yaw = cam.yaw = SPAWN.yaw; cam.pitch = -0.08;
  for (const n of all('npc')) if (!n.vehicle && Math.hypot(n.x - P.x, n.z - P.z) < 6) removeEntity(n);
  requestLock(true); drawWeaponIcon(); G.hudCache = '';
  setTimeout(() => showRadio('Neon FM 86.0'), 600);
  if (G.firstPlay) {
    G.firstPlay = false;
    const tips = ['Welcome to <em>Neon Bay</em>. Click to grab the mouse, then <em>WASD</em> and aim.', 'Taking people down drops cash, and raises your <em>wanted level</em>.', 'Break line of sight with the law to make the stars flash and fade.', '<em>BMW R 1300 GS</em> and <em>Yamaha Ténéré 700 Rally</em> riders cruise the bay (white dots on the radar). Knock one off and press <em>F</em> to ride it.', 'Parked and passing cars are yours too. Walk up to one and press <em>F</em> to drive.', 'Spend your cash at <em>Bullet Bros. Guns</em>. Follow the pink <em>$</em> on the radar.'];
    tips.forEach((t, i) => setTimeout(() => G.state === 'play' && toast(t, 5), 400 + i * 6000));
  }
});
