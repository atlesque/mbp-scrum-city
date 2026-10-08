// Screenshots of the army's troop truck pulling up and its soldiers getting out, by day and night: node tests/army-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'army-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
// a truck racing up the road at x = 0 towards the player standing on the pavement, a police car behind it
const stage = (night, police) => game(async ([night, police]) => {
  const { G, P, cam, all, removeEntity, spawnVehicle, lighting } = __neonbay;
  G.heat = 100; G.wanted = 5; G.spawnT = 999; G.heliT = 999; G.tankT = 999; P.hp = 100; P.armor = 100;
  for (const e of all()) if ((e.kind === 'npc' && e.faction === 'law') || e.kind === 'vehicle') removeEntity(e);
  lighting.set(night ? 1 : 0);
  P.x = 6.5; P.z = 0; cam.yaw = P.yaw = Math.atan2(1.6 - P.x, 40) + 0.12; cam.pitch = 0.02; G.bigT = 0;
  const t = window.__truck = spawnVehicle('army', 1.6, 52, Math.PI, 'respond'); t.respT = 0; t.v = 16;
  if (police) { const c = spawnVehicle('police', 1.6, 66, Math.PI, 'respond'); c.respT = 0; c.v = 16; }
}, [night, police]);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  for (const night of [false, true]) {
    const tag = night ? '-night' : '';
    await stage(night, true);
    await page.waitForFunction(() => __truck.z < 30, null, { timeout: 120000 }); await page.screenshot({ path: `${out}/coming${tag}.png` });
    await page.waitForFunction(() => __truck.mode === 'parked', null, { timeout: 120000 }).catch(async e => { console.log(await game(() => JSON.stringify({ mode: __truck.mode, x: __truck.x, z: __truck.z, v: __truck.v, respT: __truck.respT, removed: __truck.removed, state: __neonbay.G.state }))); throw e; });
    await game(() => { const { P, cam } = __neonbay; P.x = __truck.x + 9; P.z = __truck.z - 7; cam.yaw = P.yaw = Math.atan2(__truck.x - P.x, __truck.z - P.z) - 0.35; cam.pitch = 0.05; });
    await page.waitForTimeout(250); await page.screenshot({ path: `${out}/soldiers-out${tag}.png` });
    console.log('law:', await game(() => __neonbay.all('npc').filter(n => n.faction === 'law').map(n => n.type).join(',')));
  }
} finally { await browser.close(); server.close(); }
