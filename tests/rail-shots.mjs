// Screenshots of standing on a roof railing and on the Belpaire's pergola: node tests/rail-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'rail-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
// put the player at (x, z) with the feet at y, facing yaw, and let them settle
const put = (x, z, y, yaw, pitch = -0.1) => game(([x, z, y, yaw, pitch]) => {
  const { P, cam } = __neonbay; P.x = x; P.z = z; P.y = P.floor = y; P.vy = 0; P.grounded = true; P.yaw = cam.yaw = yaw; cam.pitch = pitch;
}, [x, z, y, yaw, pitch]);
const where = () => game(() => { const { P } = __neonbay; return { x: +P.x.toFixed(2), z: +P.z.toFixed(2), y: +P.y.toFixed(2), floor: +P.floor.toFixed(2), grounded: P.grounded }; });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  for (const night of [0, 1]) {
    await game(n => __neonbay.lighting.set(n), night);
    const n = night ? '-night' : '';
    // a city roof: standing on the railing over the street edge
    const city = await game(() => { const r = __neonbay.ROOFS[0], b = r.rails[0]; return { x: (b.x0 + b.x1) / 2 + 2, z: (b.z0 + b.z1) / 2, y: b.y1, yaw: r.yaw }; });
    await put(city.x, city.z, city.y, Math.PI / 2 + 0.6);
    await page.waitForTimeout(2500); console.log('city rail', await where());
    await page.screenshot({ path: `${out}/city-rail${n}.png` });
    // the Belpaire: on its railing under the pergola, then on top of the pergola
    const bel = await game(() => {
      const r = __neonbay.ROOFS.find(R => R.jetpackAt), b = r.rails[0];
      const deck = r.blocks.reduce((a, c) => (c.x1 - c.x0) * (c.z1 - c.z0) > (a.x1 - a.x0) * (a.z1 - a.z0) ? c : a);
      return { rail: { x: (b.x0 + b.x1) / 2 + 3, z: (b.z0 + b.z1) / 2, y: b.y1 }, deck, cx: r.cx, cz: r.cz, floor: r.floor, yaw: r.yaw };
    });
    await put(bel.rail.x, bel.rail.z, bel.rail.y, bel.yaw + Math.PI * 0.75);
    await page.waitForTimeout(2500); console.log('belpaire rail', await where());
    await page.screenshot({ path: `${out}/belpaire-rail${n}.png` });
    await put(bel.cx, bel.cz, bel.deck.y1 + 0.06, bel.yaw + Math.PI * 0.8, -0.25);
    await page.waitForTimeout(2500); console.log('pergola', await where());
    await page.screenshot({ path: `${out}/belpaire-pergola${n}.png` });
  }
} finally { await browser.close(); server.close(); }
