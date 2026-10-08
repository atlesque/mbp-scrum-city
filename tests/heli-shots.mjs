// Checks the chopper's flight against the real city and takes screenshots of it over a player on a roof:
// node tests/heli-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'heli-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  // fly it round players all over the city, on the street and up on every door roof, and log how close the cabin
  // ever got to a building top (negative would be inside one) and how far it sat above the player
  console.log(await game(async () => {
    const { G, P } = __neonbay, H = await import('/js/vehicles/heli.js'), { tallBoxes } = await import('/js/world/collision.js');
    let xs = tallBoxes.map(b => (b.x0 + b.x1) / 2), zs = tallBoxes.map(b => (b.z0 + b.z1) / 2);
    const spots = [...__neonbay.ROOFS.map(r => [r.hutOut.x, r.hutOut.z, r.h + 0.6])];
    for (let i = 0; i < 40; i++) spots.push([xs[i * 7 % xs.length] + 30, zs[i * 7 % zs.length] + 30, 0]);
    let worst = Infinity, minY = Infinity, below = 0, maxTop = Math.max(...tallBoxes.map(b => b.h)), hp = P.hp;
    for (const [x, z, y] of spots) {
      P.x = x; P.z = z; P.y = y; H.removeHeli(); H.spawnHeli(); const h = G.heli; h.fireT = 1e9;
      for (let i = 0; i < 1200; i++) {
        G.wanted = 5; h.update(0.05);
        worst = Math.min(worst, h.y - 1.2 - H.roofTop(h.x, h.z, 4.5));
        if (i > 400) { minY = Math.min(minY, h.y); if (h.y < P.y + 5) below++; }
      }
    }
    H.removeHeli(0); P.hp = hp; G.wanted = 0;
    return JSON.stringify({ spots: spots.length, tallestBuilding: maxTop, closestToARoof: +worst.toFixed(2), lowest: +minY.toFixed(2), framesNotAbovePlayer: below });
  }));
  // the tallest of the city's door roofs, the chopper up over the player and looking down on them
  const ix = await game(() => { const R = __neonbay.ROOFS.slice(0, 8); return R.indexOf(R.reduce((a, b) => b.h > a.h ? b : a)); });
  await game(i => { const { P, ROOFS } = __neonbay, r = ROOFS[i]; P.x = r.street.x; P.z = r.street.z; }, ix);
  await page.waitForFunction(() => !document.getElementById('prompt').hidden);
  await page.keyboard.press('KeyE'); await page.waitForFunction(() => __neonbay.P.roof);
  for (const night of [0, 1]) {
    await game(n => __neonbay.lighting.set(n), night);
    await game(async i => {
      const { G, P, cam } = __neonbay, H = await import('/js/vehicles/heli.js');
      clearInterval(window.__keep); window.__keep = setInterval(() => { G.wanted = 5; G.heat = 1e6; G.lostT = 0; if (G.heli) G.heli.fireT = 1e9; }, 50);
      const r = __neonbay.ROOFS[i]; P.x = r.hutOut.x + r.fn[0] * 5; P.z = r.hutOut.z + r.fn[1] * 5;
      H.removeHeli(); H.spawnHeli(); const h = G.heli; h.fireT = 1e9;
      for (let k = 0; k < 1200; k++) { G.wanted = 5; h.update(0.05); }
      // keep it still at a spot behind the player's back so both are in the picture
      h.ang = Math.atan2(h.z - P.z, h.x - P.x);
      P.yaw = cam.yaw = Math.atan2(h.x - P.x, h.z - P.z); cam.pitch = +(new URLSearchParams(location.search).get('pitch') || 0.3);
      window.__heliInfo = { heli: +h.y.toFixed(1), player: +P.y.toFixed(1) };
    }, ix);
    console.log(JSON.stringify(await game(() => window.__heliInfo)));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/roof${night ? '-night' : ''}.png` });
  }
} finally { await browser.close(); server.close(); }
