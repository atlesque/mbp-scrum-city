// Starts the game in headless Chromium for the smoke test and for screenshots: serves public/, routes Three.js to
// node_modules and skips web fonts (so no network is needed), and loads the page with ?debug for window.__neonbay.
// Set CHROMIUM_PATH to use a specific browser binary.
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from '../serve.mjs';

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers'; if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).find(d => d.startsWith('chromium-'));
  return dir && existsSync(`${root}/${dir}/chrome-linux/chrome`) ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}

// open the game; `play` clicks Play once the title screen is up (the boot itself is left to the caller with play: false)
export async function openGame({ play = true, viewport = { width: 1280, height: 720 } } = {}) {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // the CDN's .min.js files are minified copies of the package's build files
  const threeBuild = new URL('../../node_modules/three/build/', import.meta.url);
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
  await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ body: '' }));

  const game = (fn, arg) => page.evaluate(fn, arg);
  // software WebGL runs at a few frames a second, so wait on game state rather than on the clock
  async function until(fn, arg, ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await game(fn, arg)) return true; await page.waitForTimeout(100); }
    return false;
  }
  const press = async (key, ms = 80) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const close = async () => { await browser.close(); server.close(); };

  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  if (play) {
    await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
    await page.click('#playBtn'); await page.waitForTimeout(1000);
  }
  return { page, game, until, press, close, errors };
}
