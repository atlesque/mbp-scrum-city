// Screenshots of the army's tank in the street, firing its cannon, and its wreck: node tests/tank-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'tank-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
// the tank at a spot on the road, the player standing `ahead` metres in front of it and `side` metres to its left, looking
// a little to the side of the tank so it stands clear of the player's back
const stage = (x, z, yaw, ahead, side = 4, look = 0.3) => game(async ([x, z, yaw, ahead, side, look]) => {
  const { G, P, cam, all, removeEntity } = __neonbay, { removeTank, spawnTank } = await import('/js/vehicles/tank.js');
  removeTank(null, true); G.heat = 100; G.wanted = 5; G.spawnT = 99; G.heliT = 999;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  P.x = x + fx * ahead + fz * side; P.z = z + fz * ahead - fx * side; P.hp = 100; P.armor = 100;
  for (const e of all()) if ((e.kind === 'npc' && e.faction === 'law') || (e.kind === 'vehicle' && e.model.police)) removeEntity(e);
  const t = window.__tank = spawnTank();
  Object.assign(t, { x, z, yaw, dirX: Math.round(fx), dirZ: Math.round(fz), toX: x + Math.round(fx) * 50, toZ: z + Math.round(fz) * 50, turretYaw: yaw, aimYaw: yaw });
  cam.yaw = P.yaw = Math.atan2(t.x - P.x, t.z - P.z) + look; cam.pitch = 0.02; G.bigT = 0;
  __neonbay.I.mouseR = true; // aim down the sights: the camera closes in over the shoulder
}, [x, z, yaw, ahead, side, look]);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  // every road junction and the road between them should be clear for the tank's hull
  console.log('blocked road spots:', await game(async () => {
    const { colliders, ROADS } = await import('/js/world/collision.js'), bad = [];
    for (const a of ROADS) for (let b = -200; b <= 200; b += 2) for (const [x, z] of [[a, b], [b, a]])
      if (colliders.some(c => x > c.x0 - 1.8 && x < c.x1 + 1.8 && z > c.z0 - 1.8 && z < c.z1 + 1.8)) bad.push([x, z]);
    return JSON.stringify(bad.slice(0, 40)) + ` (${bad.length})`;
  }));
  for (const night of [0, 1]) {
    await game(n => __neonbay.lighting.set(n), night);
    // in the street, rolling towards the camera with traffic about
    await stage(0, 70, Math.PI, 24, 5, 0.12); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/street${night ? '-night' : ''}.png` });
  }
  await game(() => __neonbay.lighting.set(0));
  // firing: player out of reach of the shell for the picture, watching from beside the road
  await stage(50, 120, -Math.PI / 2, 22, 6, 0.15);
  await game(() => { __tank.reloadT = 0; });
  await page.waitForFunction(() => __tank.reloadT > 3, null, { timeout: 30000 });
  await page.screenshot({ path: `${out}/firing.png` });
  await page.waitForFunction(() => __neonbay.P.hp < 100, null, { timeout: 30000 });
  await page.screenshot({ path: `${out}/shell-hit.png` });
  await game(() => { __neonbay.P.hp = 100; });
  // a close look from the side
  await stage(-50, 120, Math.PI / 2, 6, 12, 0.15); await game(() => { __tank.v = 0; __tank.reloadT = 99; }); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/side.png` });
  // destroyed: the wreck with its turret blown off the ring
  await game(() => { __tank.damage(1e6); }); await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/boom.png` });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/wreck.png` });
} finally { await browser.close(); server.close(); }
