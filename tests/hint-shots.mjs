// Screenshots of the controls hint: new player, after 10 minutes, paused, paused on a bike: node tests/hint-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'hint-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
const shot = async name => { await page.waitForTimeout(2500); console.log(name, 'hint shown:', await game(() => !document.getElementById('hint').hidden)); await page.screenshot({ path: `${out}/${name}.png` }); };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  await shot('new-player');
  await game(() => { __neonbay.stats.played = 600; });
  await shot('after-10-min');
  await page.keyboard.press('KeyP');
  await shot('paused');
  await page.keyboard.press('Enter');
  await game(() => { const { P, spawnVehicle } = __neonbay; window.__bike = spawnVehicle('gs', P.x + 1.5, P.z, P.yaw); });
  await page.waitForTimeout(800); await page.keyboard.press('KeyF'); await page.waitForTimeout(800);
  await shot('riding');
  await page.keyboard.press('KeyP');
  await shot('paused-riding');
} finally { await browser.close(); server.close(); }
