// Screenshots of the fire brigade at a crash fire: node tests/fire-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'fire-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
const until = (fn, ms = 180000) => page.waitForFunction(fn, null, { timeout: ms, polling: 200 });
// a crash on the road at x = 0: a car skids into one parked in the lane and sets it alight; the player watches from
// the pavement `back` metres down the road
const crash = (z, back, side, look, night) => game(async ([z, back, side, look, night]) => {
  const { G, P, cam, all, removeEntity, spawnVehicle, lighting } = __neonbay;
  lighting.set(night);
  for (const e of all()) if (e.kind === 'firetruck' || (e.kind === 'vehicle' && Math.abs(e.x) < 30 && Math.abs(e.z - z) < 140) || (e.kind === 'npc' && e.type === 'fireman')) removeEntity(e);
  G.heat = 0; G.wanted = 0; P.hp = 100; P.x = side; P.z = z - back; P.y = 0;
  const hit = window.__hit = spawnVehicle('sedan', -3, z, 0); hit.hp = 1;
  const ram = window.__ram = spawnVehicle('modely', -3, z - 5.2, 0); ram.kvx = 0; ram.kspin = 0; ram.kvz = 22; // skidding into the back of it
  cam.yaw = P.yaw = Math.atan2(-3 - P.x, z - P.z) + look; cam.pitch = 0.02; G.bigT = 0;
}, [z, back, side, look, night]);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  for (const night of [0, 1]) {
    const sfx = night ? '-night' : '';
    await crash(-25, 18, 11, 0.3, night);
    await until(() => __hit.crashFire);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/burning${sfx}.png` });
    console.log(await game(() => { const t = __neonbay.all('firetruck')[0]; return t ? `truck from ${t.x.toFixed(0)},${t.z.toFixed(0)}, fire ${__hit.burnT.toFixed(1)} s` : 'no truck'; }));
    // the truck pulling up, seen from beside the road
    await until(() => { const t = __neonbay.all('firetruck')[0]; return t && Math.hypot(t.x - __hit.x, t.z - __hit.z) < 30; });
    await page.screenshot({ path: `${out}/truck-coming${sfx}.png` });
    await until(() => __neonbay.all('npc').some(n => n.type === 'fireman' && n.c.gunId === 'nozzle'));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/hosing${sfx}.png` });
    console.log(await game(() => `fire ${__hit.burnT.toFixed(1)} s left, water ${(__hit.water || 0).toFixed(1)}`));
    if (night) break;
    // a closer look at the crew at work
    await game(() => { const { P, cam } = __neonbay, f = __neonbay.all('npc').find(n => n.type === 'fireman'); P.x = f.x + 7; P.z = f.z - 6; cam.yaw = P.yaw = Math.atan2(f.x - P.x, f.z - P.z) + 0.3; cam.pitch = -0.08; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/crew${sfx}.png` });
    await until(() => !(__hit.burnT > 0));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/put-out${sfx}.png` });
    // a fireman taken down drops his axe
    await game(() => { const { G, P, cam } = __neonbay, f = __neonbay.all('npc').find(n => n.type === 'fireman' && n.alive); P.x = f.x + 4; P.z = f.z - 4; cam.yaw = P.yaw = Math.atan2(f.x - P.x, f.z - P.z) + 0.4; cam.pitch = -0.25; f.hurt(999, new THREE.Vector3(0, 0, 1), true); G.heat = 0; G.wanted = 0; });
    await page.waitForTimeout(2500); await game(() => { __neonbay.G.bigT = 0; document.getElementById('bigText').classList.remove('show'); });
    await page.screenshot({ path: `${out}/axe-drop${sfx}.png` });
  }
} finally { await browser.close(); server.close(); }
