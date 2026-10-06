// Renders the landmark previews (public/dev/landmarks.html) to PNGs: every building from each preset view,
// plus a night view. Run with `node tests/landmark-shots.mjs [out-dir]` (default: landmark-shots/).
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'landmark-shots';
mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const executablePath = process.env.CHROMIUM_PATH || (dir && existsSync(`${root}/${dir}/chrome-linux/chrome`) ? `${root}/${dir}/chrome-linux/chrome` : undefined);

const server = await serve();
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
page.on('pageerror', e => { console.error(e); process.exitCode = 1; });
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
const views = [['street-left', 'view=0'], ['street-right', 'view=1'], ['aerial-back', 'view=2'], ['night', 'view=3&night']];
for (const b of ['vac', 'teirlinck', 'belpaire']) for (const [name, qs] of views) {
  await page.goto(`http://127.0.0.1:${server.address().port}/dev/landmarks.html?b=${b}&${qs}&shot`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  await page.screenshot({ path: `${out}/${b}-${name}.png` });
  console.log('shot', b, name);
}
await browser.close(); server.close();
