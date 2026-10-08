// Screenshots of a wheelie on each bike, from the side, by day and by night: node tests/wheelie-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'wheelie-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
const until = (fn, ms = 60000) => page.waitForFunction(fn, null, { timeout: ms, polling: 100 });
const press = async key => { await page.keyboard.down(key); await page.waitForTimeout(80); await page.keyboard.up(key); };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  for (const night of [0, 1]) for (const id of ['gs', 't7']) {
    await game(([id, night]) => {
      const { G, P, cam, all, removeEntity, spawnVehicle, lighting } = __neonbay;
      lighting.set(night);
      for (const v of all('vehicle')) if (Math.abs(v.x - 3) < 20 && v.z > -90 && v.z < 10) removeEntity(v);
      G.heat = 0; G.wanted = 0; P.x = 4.5; P.z = -80; P.y = 0; P.tumble = null; P.vx = P.vz = P.vy = 0; P.grounded = true;
      window.__ram = spawnVehicle(id, 3, -80, 0); G.bigT = 0;
    }, [id, night]);
    await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name));
    await press('KeyF'); await until(() => __neonbay.P.vehicle === __ram);
    await game(() => { __ram.v = 11; });
    await page.keyboard.down('KeyW'); await page.keyboard.down('KeyC');
    await until(() => { const { cam } = __neonbay; __neonbay.P.lookT = __neonbay.G.time; cam.yaw = __ram.yaw - 1.75; cam.pitch = -0.08; return __ram.pop > 0.55; });
    await page.screenshot({ path: `${out}/${id}${night ? '-night' : ''}.png` });
    console.log(id, night, await game(() => `pop ${__ram.pop.toFixed(2)} at ${__ram.z.toFixed(1)}`));
    await page.keyboard.up('KeyC'); await page.keyboard.up('KeyW');
    await game(() => { __ram.v = 0; __ram.pop = 0; }); await press('KeyF'); await until(() => !__neonbay.P.vehicle);
    await game(() => __neonbay.removeEntity(__ram));
  }
} finally { await browser.close(); server.close(); }
