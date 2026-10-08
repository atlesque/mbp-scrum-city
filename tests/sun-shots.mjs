// Screenshots of the sun over the day/night loop, the camera turned to face it: node tests/sun-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'sun-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
const shots = [['1-dawn', 0.89], ['2-sunrise', 0.93], ['3-morning', 0.0], ['4-midday', 0.15], ['5-afternoon', 0.3], ['6-sunset', 0.37], ['7-setting', 0.41], ['8-gone', 0.45], ['9-night', 0.6]];
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  // up on a roof, above the streets
  const ix = process.env.ROOF != null ? +process.env.ROOF : 0; // a roof with a clear view all round
  const upstairs = async () => {
    if (await game(() => !!__neonbay.P.roof)) return;
    await game(i => { const { P, ROOFS } = __neonbay, r = ROOFS[i]; P.x = r.street.x; P.z = r.street.z; P.hp = 100; }, ix);
    await page.waitForFunction(() => !document.getElementById('prompt').hidden);
    await page.keyboard.press('KeyE'); await page.waitForFunction(() => __neonbay.P.roof);
  };
  for (const [name, p] of shots) {
    await upstairs();
    // nobody about to take shots at the player while the pictures are taken
    await game(() => { const { P, all, removeEntity } = __neonbay; for (const e of all()) if (e.kind === 'npc' && Math.hypot(e.x - P.x, e.z - P.z) < 80) removeEntity(e); });
    await game(async ([p, i]) => {
      const { G, P, cam, lighting, ROOFS } = __neonbay, r = ROOFS[i] , { sunDir } = await import('/js/render/sunpath.js');
      lighting.setTime(p); G.heat = 0; G.wanted = 0; P.hp = 100;
      const s = sunDir(p), d = s.y > 0 ? s : { x: -s.x, z: -s.z }; // at night, face the moon
      P.x = r.hutOut.x + r.fn[0] * 7; P.z = r.hutOut.z + r.fn[1] * 7; cam.yaw = P.yaw = Math.atan2(d.x, d.z); cam.pitch = Math.max(0.04, Math.asin(Math.max(s.y, 0)) - 0.05);
    }, [p, ix]);
    await page.waitForTimeout(1500);
    console.log(name, await game(() => `time ${__neonbay.lighting.time.toFixed(3)} night ${__neonbay.lighting.night.toFixed(2)}`));
    await page.screenshot({ path: `${out}/${name}.png` });
  }
} finally { await browser.close(); server.close(); }
