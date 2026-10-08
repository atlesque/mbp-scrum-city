// Screenshots of the weapon wheel: a gun, the melee ring, the thrown ring, then the weapon taken: node tests/wheel-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'wheel-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
const shot = async name => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${name}.png` }); };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1500);
  await game(() => { const { inv } = __neonbay; for (const id of ['knuckles', 'bat', 'katana', 'fireaxe', 'smg', 'shotgun', 'rifle', 'sniper', 'grenade', 'molotov']) { inv.owned[id] = true; inv.ammo[id] = inv.ammo[id] || 3; } });
  const move = (a, r) => game(async ([a, r]) => { const { wheelMove } = await import('/js/ui/wheel.js'); wheelMove(240 * r * Math.sin(a), -240 * r * Math.cos(a)); }, [a, r]);
  const steps = async list => { for (const [a, r] of list) await move(a, r); };
  const T = Math.PI * 2 / 10;
  await page.keyboard.down('KeyQ');
  await steps([[4 * T, 0.6]]); await shot('gun');
  await page.keyboard.up('KeyQ'); await page.waitForTimeout(300);
  console.log('after rifle:', await game(() => __neonbay.inv.cur));
  await page.keyboard.down('KeyQ');
  await steps([[0, 0.5], [0.5, 0.45]]); await shot('melee-ring');
  await page.keyboard.up('KeyQ'); await page.waitForTimeout(300);
  console.log('after melee ring:', await game(() => __neonbay.inv.cur));
  await page.keyboard.down('KeyQ');
  await steps([[8 * T, 0.5], [8 * T - 0.2, 0.45]]); await shot('thrown-ring');
  await page.keyboard.up('KeyQ'); await page.waitForTimeout(800);
  console.log('after thrown ring:', await game(() => __neonbay.inv.cur));
  await shot('hud-molotov');
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(300);
  console.log('after a tap:', await game(() => __neonbay.inv.cur));
} finally { await browser.close(); server.close(); }
