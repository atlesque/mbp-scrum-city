// Screenshots of the e-steps: the player riding one from the side by day and by night, following a stepper in
// traffic, and riders passing on foot: node tests/estep-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'estep-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('page error', e.message));
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
const game = (fn, arg) => page.evaluate(fn, arg);
const until = (fn, ms = 60000) => page.waitForFunction(fn, null, { timeout: ms, polling: 100 });
const press = async key => { await page.keyboard.down(key); await page.waitForTimeout(80); await page.keyboard.up(key); };
// clear the road and put the player on foot at (x, z)
const reset = (x, z, night) => game(([x, z, night]) => {
  const { G, P, all, removeEntity, lighting } = __neonbay;
  lighting.set(night);
  for (const v of all('vehicle')) if (Math.abs(v.x) < 30 && Math.abs(v.z - z) < 60) removeEntity(v);
  G.heat = 0; G.wanted = 0; P.x = x; P.z = z; P.y = 0; P.tumble = null; P.vx = P.vz = P.vy = 0; P.grounded = true; G.bigT = 0;
}, [x, z, night]);
const ride = async id => {
  await game(id => { const { P, spawnVehicle } = __neonbay; window.__s = spawnVehicle(id, P.x + 0.5, P.z, 0); }, id);
  await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__s.model.name));
  await press('KeyF'); await until(() => __neonbay.P.vehicle === __s);
};
const getOff = async () => { await page.keyboard.up('KeyW'); await game(() => { __s.v = 0; }); await page.waitForTimeout(800); await press('KeyF'); await until(() => !__neonbay.P.vehicle); await game(() => __neonbay.removeEntity(__s)); };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  // the player on each step, from the side
  for (const night of [0, 1]) for (const id of ['estep', 'sharestep']) {
    await reset(-5.5, -90, night); await ride(id); await game(() => { __s.K.camera.dist = 3.4; });
    await page.keyboard.down('KeyW');
    await until(() => { const { cam, P, G } = __neonbay; P.lookT = G.time; cam.yaw = __s.yaw - 1.75; cam.pitch = -0.32; return __s.v > 5 && __s.z > -80; });
    await page.screenshot({ path: `${out}/${id}-side${night ? '-night' : ''}.png` });
    console.log(id, night, await game(() => `${(__s.v * 3.6).toFixed(1)} km/h`));
    await game(() => { __s.K.camera.dist = 4.6; }); await getOff();
  }
  // behind a stepper in the kerb-side lane, with a car passing in its lane
  await reset(-5.5, -110, 0); await ride('sharestep');
  await game(() => {
    const { P, spawnVehicle, spawnNpc } = __neonbay;
    const s = spawnVehicle('estep', -5, P.z + 9, 0, 'traffic'); s.top = 6.5; s.v = 6; s.seatDriver(spawnNpc('stepper', s.x, s.z));
    const c = spawnVehicle('sedan', -3, P.z + 4, 0, 'traffic'); c.top = 11; c.v = 11; c.seatDriver(spawnNpc('motorist', c.x, c.z));
    window.__car = c;
  });
  await page.keyboard.down('KeyW');
  await until(() => { const { cam, P, G } = __neonbay; P.lookT = G.time; cam.yaw = 0.1; cam.pitch = -0.12; return __s.z > -108; });
  await page.screenshot({ path: `${out}/following.png` });
  await getOff();
  // standing at the kerb as riders go by
  await reset(-7.4, -60, 0);
  await game(() => {
    const { P, spawnVehicle, spawnNpc } = __neonbay;
    for (const [id, z] of [['estep', -64], ['sharestep', -70]]) { const s = spawnVehicle(id, -5, z, 0, 'traffic'); s.top = 6.5; s.v = 6; s.seatDriver(spawnNpc('stepper', s.x, s.z)); window.__lead = window.__lead || s; }
  });
  await until(() => { const { cam, P, G } = __neonbay; P.lookT = G.time; P.yaw = cam.yaw = Math.PI * 0.8; cam.pitch = -0.08; return __lead.z > -62; });
  await page.screenshot({ path: `${out}/passing.png` });
} finally { await browser.close(); server.close(); }
