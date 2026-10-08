// Screenshots of the parachutes on the three high roofs and of floating down under one: node tests/chute-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'chute-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
// put the player at (x, z) with the feet at y, facing yaw
const put = (x, z, y, yaw, pitch = -0.15) => game(([x, z, y, yaw, pitch]) => {
  const { P, cam } = __neonbay; P.x = x; P.z = z; P.y = P.floor = y; P.vy = 0; P.grounded = true; P.yaw = cam.yaw = yaw; cam.pitch = pitch;
}, [x, z, y, yaw, pitch]);
const state = () => game(() => { const { P } = __neonbay; return { y: +P.y.toFixed(1), vy: +(P.vy || 0).toFixed(1), chute: P.chute && (P.chute.open ? 'open' : 'packed') }; });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  const roofs = await game(() => __neonbay.ROOFS.filter(r => r.chuteAt).map(r => ({ x: r.chuteAt.x, z: r.chuteAt.z, floor: r.floor, cx: r.cx, cz: r.cz })));
  const names = ['vac', 'belpaire', 'teirlinck'];
  for (const night of [0, 1]) {
    await game(n => __neonbay.lighting.set(n), night);
    const n = night ? '-night' : '';
    // each roof's parachute, seen from a few metres off towards the middle of the roof
    for (const [i, r] of roofs.entries()) {
      if (night && i) continue;
      const a = Math.atan2(r.cx - r.x, r.cz - r.z), d = 3.5, sx = r.x + Math.sin(a) * d, sz = r.z + Math.cos(a) * d;
      await put(sx, sz, r.floor, a + Math.PI + 0.45);
      await page.waitForTimeout(2500); await page.screenshot({ path: `${out}/${names[i]}-roof${n}.png` });
    }
  }
  // take the VAC one, step off into the air 30 m over the street, and open it with Space
  await game(n => __neonbay.lighting.set(n), 0);
  const v = roofs[0];
  await put(v.x, v.z, v.floor, 0); await page.waitForFunction(() => __neonbay.P.chute, null, { timeout: 30000 }); await page.waitForTimeout(1000);
  console.log('on the pickup', await state());
  await page.screenshot({ path: `${out}/packed.png` });
  await game(() => { const { P } = __neonbay; P.x -= 0; P.z -= 14; P.y = 40; P.grounded = false; P.vy = -12; P.jumps = 2; });
  await page.keyboard.down('Space'); await page.waitForFunction(() => __neonbay.P.chute.open, null, { timeout: 10000 }); await page.keyboard.up('Space');
  console.log('opened', await state());
  await game(() => { __neonbay.cam.pitch = -0.3; });
  await page.waitForTimeout(1500); console.log('floating', await state());
  await page.screenshot({ path: `${out}/floating.png` });
  await game(() => { __neonbay.cam.pitch = 0.45; });
  await page.waitForTimeout(1000); await page.screenshot({ path: `${out}/floating-down.png` });
  await page.waitForFunction(() => __neonbay.P.grounded, null, { timeout: 120000 });
  console.log('landed', await state(), 'hp', await game(() => __neonbay.P.hp));
  await page.waitForTimeout(800); await page.screenshot({ path: `${out}/landed.png` });
} finally { await browser.close(); server.close(); }
