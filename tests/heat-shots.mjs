// Screenshots of the five star heat highscore: the clock under the stars, the pause screen and the wasted screen: node tests/heat-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'heat-shots'; mkdirSync(out, { recursive: true });
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
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  await game(() => { const { G, stats } = __neonbay; stats.fiveStar = 754; G.heat = 140; G.wanted = 5; G.fiveRun = 83; G.lostT = -999; });
  const before = await game(() => __neonbay.stats.fiveStar);
  await page.waitForTimeout(4000);
  const after = await game(() => __neonbay.stats.fiveStar);
  console.log(`five star heat ${before} -> ${after.toFixed(2)}, hud "${await page.textContent('#heatClock')}", shown ${await page.isVisible('#heatClock')}`);
  if (!(after > before)) throw new Error('the five star clock did not tick');
  await page.screenshot({ path: `${out}/hud.png` });
  await page.screenshot({ path: `${out}/hud-zoom.png`, clip: { x: 960, y: 140, width: 320, height: 150 } });
  await page.keyboard.press('KeyP'); await until(() => !document.getElementById('pause').hidden, 5000);
  console.log('pause:', await page.textContent('#pauseStats'));
  await page.screenshot({ path: `${out}/pause.png` });
  await page.click('#resumeBtn').catch(() => {}); await page.waitForTimeout(500);
  await game(() => { const { G, hurtPlayer } = __neonbay; G.state = 'play'; hurtPlayer(500); });
  await until(() => !document.getElementById('wasted').hidden, 10000);
  console.log('wasted:', await page.textContent('#wastedInfo'));
  await page.screenshot({ path: `${out}/wasted.png` });
} finally { await browser.close(); server.close(); }
