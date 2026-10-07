// Screenshots of the armor vest pickups (a street pickup and a smaller enemy drop), day and night, from a few angles:
// node tests/armor-shots.mjs [out-dir] (default: armor-shots/)
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'armor-shots';
mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const executablePath = process.env.CHROMIUM_PATH || (dir && existsSync(`${root}/${dir}/chrome-linux/chrome`) ? `${root}/${dir}/chrome-linux/chrome` : undefined);

const server = await serve();
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', e => { console.error(e); process.exitCode = 1; });
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ body: '' }));
const game = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1500);
  await game(() => { document.getElementById('toast').style.display = 'none'; });
  // a street pickup ahead on the right and a dropped vest ahead on the left; full armor so neither gets taken
  await game(async () => {
    const { P, all, removeEntity } = __neonbay, { makePickup, dropItem } = await import('/js/game/pickups.js');
    for (const e of all()) if ((e.kind === 'npc' || e.kind === 'vehicle' || e.kind === 'pickup') && Math.hypot(e.x - P.x, e.z - P.z) < 25) removeEntity(e);
    P.armor = 100;
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), rx = fz, rz = -fx;
    window.__vest = makePickup('armor', P.x + fx * 2.6 + rx * 1.1, P.z + fz * 2.6 + rz * 1.1);
    const d = dropItem('armor', P.x + fx * 2.2 - rx * 1.2, P.z + fz * 2.2 - rz * 1.2); d.life = 1e9;
  });
  for (const night of [0, 1]) {
    await game(n => { const { G, P, cam, lighting } = __neonbay; lighting.set(n); G.state = 'play'; P.armor = 100; cam.yaw = P.yaw; cam.pitch = 0.12; cam.dist = 4.5; }, night);
    await page.waitForTimeout(night ? 4000 : 1000);
    for (const k of [0, 1]) { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/street${night ? '-night' : ''}-${k}.png` }); }
    // close-ups: freeze the game and move the street vest to just in front of the camera, right of the player
    for (const k of [0, 1, 2]) {
      await game(async k => {
        const { G } = __neonbay, { camera } = await import('/js/render/scene.js'), v = window.__vest;
        G.state = 'paused';
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0; f.normalize();
        v.x = camera.position.x + f.x * 3.4 - f.z * 1.0; v.z = camera.position.z + f.z * 3.4 + f.x * 1.0;
        v.m.position.set(v.x, 1.25, v.z); v.m.rotation.y = Math.atan2(f.x, f.z) + Math.PI + 0.6 - k * 0.9;
      }, k);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/close${night ? '-night' : ''}-${k}.png` });
    }
    console.log('shot', night ? 'night' : 'day');
  }
} finally { await browser.close(); server.close(); }
