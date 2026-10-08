// Screenshots of aiming straight down from the jetpack, hovering over someone, and a shot at them: node tests/aim-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'aim-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  // hover 8 m up on the jetpack in the middle of the street, with a civilian pinned under the crosshair
  await game(async () => {
    const { P, cam, all, removeEntity, spawnNpc } = __neonbay, { putOnJetpack } = await import('/js/game/jetpack.js');
    for (const e of all()) if ((e.kind === 'npc' || e.kind === 'vehicle') && Math.hypot(e.x - P.x, e.z - P.z) < 40) removeEntity(e);
    putOnJetpack(); P.yaw = cam.yaw;
    const H = 8, tx = P.x + Math.sin(cam.yaw) * 1.6 - Math.cos(cam.yaw) * 0.55, tz = P.z + Math.cos(cam.yaw) * 1.6 + Math.sin(cam.yaw) * 0.55;
    const n = spawnNpc('civilian', tx, tz); window.__target = n;
    window.__hover = setInterval(() => { P.y = H; P.vy = 0; P.grounded = false; if (n.alive) { n.x = tx; n.z = tz; } }, 5);
  });
  for (const [name, pitch] of [['before-limit', -1.0], ['looking-down', -1.45]]) {
    await game(p => { __neonbay.cam.pitch = p; }, pitch);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  const hp0 = await game(() => __target.hp);
  await game(() => { __neonbay.I.mouseR = true; });
  await page.waitForTimeout(1200);
  // move them to where the crosshair meets the street, then fire a few shots
  await game(async () => {
    const { cam } = __neonbay, { camTarget } = await import('/js/game/player.js');
    cam.pitch = -1.45; await new Promise(r => setTimeout(r, 300));
    const cp = Math.cos(cam.pitch), t = -camTarget.y / Math.sin(cam.pitch) - 0.4;
    const n = __target; clearInterval(__hover);
    const tx = camTarget.x + Math.sin(cam.yaw) * cp * t, tz = camTarget.z + Math.cos(cam.yaw) * cp * t;
    window.__hover = setInterval(() => { const { P } = __neonbay; P.y = 8; P.vy = 0; P.grounded = false; if (n.alive) { n.x = tx; n.z = tz; } }, 5);
  });
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) {
    await game(() => { __neonbay.cam.pitch = -1.45; __neonbay.I.clickQ = 0.2; });
    await page.waitForTimeout(i ? 700 : 150);
    if (!i) await page.screenshot({ path: `${out}/shot.png` });
  }
  console.log('target hp', hp0, '->', await game(() => __target.hp), 'pitch after recoil', await game(() => __neonbay.cam.pitch.toFixed(2)));
} finally { await browser.close(); server.close(); }
