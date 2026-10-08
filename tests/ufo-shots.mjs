// Screenshots of the secret sixth star: the UFO beaming an alien down, aliens firing laser rifles, the green HUD,
// and the laser rifle in the player's hands. node tests/ufo-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'ufo-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
const wait = (fn, ms = 60000) => page.waitForFunction(fn, null, { timeout: ms, polling: 200 });
// six stars on, the UFO hovering `dist` metres off the player in the direction the camera looks, at `y`
const stage = (dist, y, look, pitch) => game(async ([dist, y, look, pitch]) => {
  const { G, P, cam, all, removeEntity } = __neonbay, { removeUfo, spawnUfo } = await import('/js/vehicles/ufo.js');
  removeUfo(null); G.heat = 100; G.wanted = 6; G.spawnT = 99; G.heliT = 999; G.tankT = 999; G.bigT = 0;
  P.x = 0; P.z = 70; P.y = 0; P.hp = 100; P.armor = 100;
  for (const e of all()) if ((e.kind === 'npc' && e.faction === 'law') || (e.kind === 'vehicle' && e.model.police)) removeEntity(e);
  const u = window.__ufo = spawnUfo(), a = Math.PI;
  Object.assign(u, { x: P.x + Math.sin(a) * dist, z: P.z + Math.cos(a) * dist, y, dropT: 99, ang: Math.atan2(Math.cos(a), Math.sin(a)) });
  cam.yaw = P.yaw = a + look; cam.pitch = pitch;
}, [dist, y, look, pitch]);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  for (const night of [0, 1]) {
    await game(n => __neonbay.lighting.set(n), night);
    // the saucer overhead lowering an alien down its beam
    await stage(20, 24, 0.0, 0.42);
    await game(() => { __ufo.dropT = 0; });
    await wait(() => __neonbay.all('npc').some(n => n.type === 'alien' && n.y > 4 && n.y < 14));
    await page.screenshot({ path: `${out}/beam-down${night ? '-night' : ''}.png` });
  }
  await game(() => __neonbay.lighting.set(0));
  // landed aliens opening fire with their lasers
  await game(() => { __neonbay.P.armor = 100; __neonbay.P.hp = 100; __neonbay.cam.pitch = 0.05; });
  await wait(() => __neonbay.all('npc').some(n => n.type === 'alien' && n.alive && n.behaviour === 'hunt'));
  await game(() => {
    const { P, cam } = __neonbay, n = window.__alien = __neonbay.all('npc').find(n => n.type === 'alien' && n.behaviour === 'hunt');
    n.x = P.x + 1.5; n.z = P.z - 9; cam.yaw = P.yaw = Math.atan2(n.x - P.x, n.z - P.z); cam.pitch = 0.02; window.__hp0 = P.hp + P.armor;
  });
  await wait(() => __neonbay.all('npc').some(n => n.type === 'alien' && n.aiming && n.burst > 0), 60000).catch(() => {});
  await page.screenshot({ path: `${out}/laser-fire.png` });
  // a close look at an alien
  await game(() => { const { P, cam } = __neonbay, n = __alien; n.def = { ...n.def, rate: 99 }; n.x = P.x + 0.6; n.z = P.z - 3.2; cam.yaw = P.yaw = Math.atan2(n.x - P.x, n.z - P.z) + 0.25; cam.pitch = -0.02; __neonbay.I.mouseR = true; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/alien.png` });
  await game(() => { __neonbay.I.mouseR = false; });
  // the player with a picked-up laser rifle, firing at the saucer
  await game(async () => {
    const { P, cam, inv } = __neonbay, { pickUpWeapon } = await import('/js/game/pickups.js'), { selectWeapon } = await import('/js/combat/combat.js');
    for (const n of __neonbay.all('npc')) if (n.type === 'alien') __neonbay.removeEntity(n);
    pickUpWeapon(inv, 'laser'); selectWeapon('laser'); __ufo.dropT = 99;
    __ufo.x = P.x; __ufo.z = P.z - 30; __ufo.y = 22; cam.yaw = P.yaw = Math.PI; cam.pitch = 0.55;
  });
  await page.waitForTimeout(1500);
  await game(async () => { const { playerShoot } = await import('/js/combat/combat.js'); window.__fire = setInterval(() => { __neonbay.G.fireCd = 0; playerShoot(); }, 60); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/player-laser.png` });
  await game(() => clearInterval(__fire));
  // shot down
  await game(() => { __ufo.damage(1e6); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/going-down.png` });
} finally {
  await browser.close(); server.close();
}
