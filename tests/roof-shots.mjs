// Screenshots of a rooftop door, its roof and the minimap markers, day and night: node tests/roof-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'roof-shots'; mkdirSync(out, { recursive: true });
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
  const ix = +(process.env.ROOF || 0);
  console.log(await game(() => JSON.stringify(__neonbay.ROOFS.map(r => [Math.round(r.street.x), Math.round(r.street.z), Math.round(r.h), r.face]))));
  const clear = () => game(() => { const { P, all, removeEntity } = __neonbay; for (const e of all()) if ((e.kind === 'npc' || e.kind === 'vehicle') && Math.hypot(e.x - P.x, e.z - P.z) < 25) removeEntity(e); });
  // the door markers on the minimap, from across the street
  await game(i => { const { P, cam, ROOFS } = __neonbay, r = ROOFS[i]; P.x = r.street.x + r.fn[0] * 22; P.z = r.street.z + r.fn[1] * 22; P.yaw = cam.yaw = r.yaw + Math.PI; }, ix);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/minimap.png`, clip: { x: 0, y: 470, width: 260, height: 250 } });
  for (const night of [0, 1]) {
    await game(n => __neonbay.lighting.set(n), night);
    // the street door, seen from across the sidewalk
    await game(i => { const { P, cam, ROOFS } = __neonbay, r = ROOFS[i]; P.x = r.street.x + r.fn[0] * 3; P.z = r.street.z + r.fn[1] * 3; P.yaw = cam.yaw = r.yaw + Math.PI; cam.pitch = 0.05; }, ix);
    await clear(); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/door${night ? '-night' : ''}.png` });
    await game(i => { const { P, ROOFS } = __neonbay, r = ROOFS[i]; P.x = r.street.x; P.z = r.street.z; }, ix);
    await page.waitForFunction(() => !document.getElementById('prompt').hidden);
    await page.keyboard.press('KeyE'); await page.waitForFunction(() => __neonbay.P.roof);
    // on the roof: back toward the hut, looking over the railings
    await game(i => { const { P, cam, ROOFS } = __neonbay, r = ROOFS[i]; P.x = r.hutOut.x + r.fn[0] * 2; P.z = r.hutOut.z + r.fn[1] * 2; P.yaw = cam.yaw = r.yaw + Math.PI * 0.85; cam.pitch = -0.12; }, ix);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/roof-hut${night ? '-night' : ''}.png` });
    await game(i => { const { P, cam, ROOFS } = __neonbay, r = ROOFS[i]; P.yaw = cam.yaw = r.yaw; cam.pitch = -0.05; }, ix);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/roof-view${night ? '-night' : ''}.png` });
    await game(i => { const { P, ROOFS } = __neonbay, r = ROOFS[i]; P.x = r.hutOut.x; P.z = r.hutOut.z; }, ix);
    await page.waitForFunction(() => !document.getElementById('prompt').hidden);
    await page.keyboard.press('KeyE'); await page.waitForFunction(() => !__neonbay.P.roof);
  }
} finally { await browser.close(); server.close(); }
