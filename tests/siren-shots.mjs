// Screenshots of the player at the wheel of the fire truck and a police car, siren on: node tests/siren-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'siren-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
const until = (fn, ms = 60000) => page.waitForFunction(fn, null, { timeout: ms, polling: 200 });
const press = async key => { await page.keyboard.down(key); await page.waitForTimeout(80); await page.keyboard.up(key); };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  for (const night of [0, 1]) for (const id of ['firetruck', 'police']) {
    await game(([id, night]) => {
      const { G, P, cam, all, removeEntity, spawnVehicle, lighting } = __neonbay;
      lighting.set(night);
      for (const v of all('vehicle')) if (Math.abs(v.x - 3) < 20 && Math.abs(v.z) < 40) removeEntity(v);
      G.heat = 0; G.wanted = 0; P.x = 5.6; P.z = 0; P.y = 0; P.tumble = null; P.vx = P.vz = P.vy = 0; P.grounded = true;
      window.__ram = spawnVehicle(id, 3, 0, 0); cam.yaw = P.yaw = 0.6; cam.pitch = -0.12; G.bigT = 0;
    }, [id, night]);
    await page.waitForTimeout(1500); console.log(await game(() => JSON.stringify({ near: (__neonbay.G.near || []).map(n => n.prompt), P: [__neonbay.P.x, __neonbay.P.z, __neonbay.P.y, !!__neonbay.P.tumble, !!__neonbay.P.vehicle] })));
    await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name));
    await press('KeyF'); await until(() => __neonbay.P.vehicle === __ram); await press('KeyH');
    await page.keyboard.down('KeyW'); await until(() => __ram.z > 6); await page.keyboard.up('KeyW');
    await game(() => { const { cam } = __neonbay; cam.yaw = __ram.yaw + 2.6; cam.pitch = -0.12; });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${id}${night ? '-night' : ''}.png` });
    console.log(id, await game(() => `siren ${__ram.siren}, voices ${JSON.stringify(__neonbay.Sound.voices())}, at ${__ram.x.toFixed(1)},${__ram.z.toFixed(1)}`));
    await game(() => { __ram.v = 0; }); await press('KeyF'); await until(() => !__neonbay.P.vehicle);
  }
} finally { await browser.close(); server.close(); }
