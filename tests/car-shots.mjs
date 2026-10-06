// Renders the car previews (public/dev/cars.html) to PNGs. Run with `node tests/car-shots.mjs [out-dir]`
// (default: car-shots/). CARS=modelyblue,eqa picks the cars, VIEWS='0 2 -40,8,9' the views (a preset, or az,el,dist; see js/dev/car-preview.js),
// a trailing n renders it at night, NEUTRAL=1 swaps the city's pink light for white daylight, DRIVER=1 (or afro) seats a driver.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'car-shots';
mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const executablePath = process.env.CHROMIUM_PATH || (dir && existsSync(`${root}/${dir}/chrome-linux/chrome`) ? `${root}/${dir}/chrome-linux/chrome` : undefined);

const server = await serve();
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', e => { console.error(e); process.exitCode = 1; });
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
const views = (process.env.VIEWS || '0 1 2 3 4').split(' ');
for (const car of (process.env.CARS || 'modelyblue,eqa,bmw5').split(',')) for (const v of views) {
  const night = v.endsWith('n'), view = v.replace(/n$/, ''), name = v.replace(/,/g, '_');
  await page.goto(`http://127.0.0.1:${server.address().port}/dev/cars.html?car=${car}&view=${view}${night ? '&night' : ''}${process.env.NEUTRAL ? '&neutral' : ''}${process.env.DRIVER ? '&driver=' + process.env.DRIVER : ''}&shot`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  await page.screenshot({ path: `${out}/${car}-${name}.png` });
  console.log('shot', car, v, await page.textContent('#info'));
}
await browser.close(); server.close();
