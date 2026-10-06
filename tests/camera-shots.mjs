// Screenshots the follow camera in a narrow alley between two buildings, on foot and in a car, to check it stays out of the walls.
// Run with `node tests/camera-shots.mjs [out-dir]` (default: camera-shots/). Prints how far each shot's camera is from the nearest wall.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'camera-shots';
mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const executablePath = process.env.CHROMIUM_PATH || (dir && existsSync(`${root}/${dir}/chrome-linux/chrome`) ? `${root}/${dir}/chrome-linux/chrome` : undefined);

const server = await serve();
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', e => { console.error(e); process.exitCode = 1; });
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ body: '' }));

await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
await page.click('#playBtn');
await page.waitForTimeout(500);

// the alley: the narrowest gap (under 4 m) between two tall buildings standing side by side along x
const alley = await page.evaluate(async () => {
  const { tallBoxes } = await import('/js/world/collision.js');
  let best = null;
  for (const a of tallBoxes) for (const b of tallBoxes) {
    const gap = b.x0 - a.x1, z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
    if (gap < 2.5 || gap > 4 || z1 - z0 < 12 || a.h < 9 || b.h < 9) continue;
    if (!best || gap < best.gap) best = { x: (a.x1 + b.x0) / 2, z: (z0 + z1) / 2, gap };
  }
  return best;
});
if (!alley) throw new Error('no alley found');
console.log('alley at', alley);

// how far the camera is from the nearest building wall (negative: inside one)
const clearance = () => page.evaluate(async () => {
  const { tallBoxes } = await import('/js/world/collision.js'), { camera } = await import('/js/render/scene.js'), p = camera.position;
  let best = Infinity;
  for (const b of tallBoxes) {
    const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1), dy = Math.max(p.y - b.h, 0);
    const d = dx || dz || dy ? Math.hypot(dx, dz, dy) : -Math.min(p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z, b.h - p.y);
    best = Math.min(best, d);
  }
  return best;
});
async function shot(name, set, view) {
  const arg = { ...alley, ...view };
  // let the camera settle for three seconds of game time (software WebGL runs at a few frames a second)
  const t0 = await page.evaluate(() => __neonbay.G.time);
  while (await page.evaluate(() => __neonbay.G.time) < t0 + 3) { await page.evaluate(set, arg); await page.waitForTimeout(200); }
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name, 'camera clearance', (await clearance()).toFixed(2), 'm');
  if (process.env.DEBUG) console.log(await page.evaluate(async () => { const { camera } = await import('/js/render/scene.js'), { P } = __neonbay, d = new THREE.Vector3(); camera.getWorldDirection(d); return { cam: camera.position.toArray().map(v => +v.toFixed(2)), look: d.toArray().map(v => +v.toFixed(2)), player: [P.x, P.z], veh: P.vehicle && [P.vehicle.x, P.vehicle.z] }; }));
}
// keep the player standing still at a spot, looking a given way
const stand = ({ yaw, pitch = -0.08, dx = 0, ...a }) => {
  const { P, cam, all, removeEntity } = __neonbay;
  for (const e of all()) if ((e.kind === 'vehicle' || e.kind === 'npc') && Math.hypot(e.x - a.x, e.z - a.z) < 25 && e !== P.vehicle) removeEntity(e);
  P.x = a.x + dx; P.z = a.z; P.yaw = yaw; cam.yaw = yaw; cam.pitch = pitch;
};
await shot('foot-across', stand, { yaw: Math.PI / 2, dx: 0.6 });
await shot('foot-across-other', stand, { yaw: -Math.PI / 2, dx: -0.6 });
await shot('foot-along', stand, { yaw: 0, dx: -0.9 });
await shot('foot-diagonal', stand, { yaw: Math.PI / 4, pitch: 0.1 });
await shot('foot-look-up', stand, { yaw: Math.PI / 2, pitch: 0.9 });
// in a car parked down the alley
await page.evaluate(async a => {
  const { spawnVehicle } = await import('/js/vehicles/vehicle.js'), { enterVehicle } = await import('/js/game/player.js'), { P } = __neonbay;
  P.x = a.x; P.z = a.z; enterVehicle(spawnVehicle('modelyblue', a.x, a.z, 0));
}, alley);
const drive = ({ yaw, ...a }) => { const { P, cam } = __neonbay, v = P.vehicle; v.x = a.x; v.z = a.z; v.yaw = 0; v.v = 0; cam.yaw = yaw; cam.pitch = -0.08; };
await shot('car-along', drive, { yaw: 0 });
await shot('car-across', drive, { yaw: Math.PI / 2 });
await browser.close(); server.close();
