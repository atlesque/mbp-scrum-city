// Plays the crew's shared world for real: two browsers join the shared city on a local copy of the MBP Games service
// (github.com/atlesque/mbp-games, checked out next to this repo or at MBP_GAMES_DIR, run with wrangler dev). The first in
// runs the traffic, the chopper, the tank and the UFO (net/world.js); the second sees the same ones, shoots them down
// through the host, takes a car out of the host's traffic, and takes the whole world over when the host leaves.
// Screenshots go to the folder given.
// Run with `node tests/mp-world-shots.mjs <folder>`. Set CHROMIUM_PATH to use a specific browser binary.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'mp-world-shots';
mkdirSync(out, { recursive: true });
const ACC = 'http://localhost:8789';
const svc = process.env.MBP_GAMES_DIR || new URL('../../mbp-games/', import.meta.url).pathname, bin = join(svc, 'node_modules/.bin/wrangler');
if (!existsSync(bin)) { console.error(`Needs the mbp-games repo with npm install done, at ${svc} (or set MBP_GAMES_DIR).`); process.exit(1); }
const state = mkdtempSync(join(tmpdir(), 'mbpg-mp-'));
let log = '';
const dev = spawn(bin, ['dev', '--port', '8789', '--persist-to', state], { cwd: svc });
dev.stdout.on('data', d => { log += d; }); dev.stderr.on('data', d => { log += d; });
for (let i = 0; i < 60 && !/Ready on/.test(log); i++) await new Promise(r => setTimeout(r, 500));

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers'; if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).find(d => d.startsWith('chromium-'));
  return dir && existsSync(`${root}/${dir}/chrome-linux/chrome`) ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}
const server = await serve();
const GAME = `http://localhost:${server.address().port}/?debug&accounts=${encodeURIComponent(ACC)}`;
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
async function newPlayer() {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
  await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ body: '' }));
  await page.goto(GAME);
  await page.waitForFunction(() => window.__neonbay && window.__neonbay.G.state === 'title' && !document.getElementById('playBtn').disabled, null, { timeout: 120000 });
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 40000 });
  return page;
}
const shot = (page, name) => page.screenshot({ path: join(out, name + '.png') });
const step = msg => console.log('·', msg);
async function joinAs(page, name) {
  await page.click('#mpBtn'); await page.fill('#mpName', name); await page.click('#mpGo');
  await page.waitForFunction(() => /You're in the city/.test(document.getElementById('mpStatus').textContent), null, { timeout: 60000, polling: 500 });
}

const role = page => page.evaluate(async () => (await import('/js/net/world.js')).worldRole());
async function waitRole(page, want, ms = 60000) {
  for (const end = Date.now() + ms; Date.now() < end; await page.waitForTimeout(500)) if (await role(page) === want) return;
  throw new Error(`never became ${want}`);
}
const puppets = (page, kind) => page.evaluate(k => window.__neonbay.all(k).filter(e => e.puppet).length, kind);

try {
  const a = await newPlayer();
  await joinAs(a, 'Alex'); await a.click('#playBtn');
  await a.waitForTimeout(1500);
  const b = await newPlayer();
  await joinAs(b, 'Bo'); await b.click('#playBtn');
  // Bo stands 30 m from Alex, looking their way
  await b.evaluate(async () => {
    const { P, cam } = window.__neonbay;
    P.x += 30; cam.yaw = P.yaw = -Math.PI / 2; cam.pitch = 0.1;
  });
  await waitRole(b, 'guest');
  step(`Alex is ${await role(a)}, Bo is ${await role(b)}`);
  if (await role(a) !== 'host') throw new Error('Alex should host');

  // the same traffic: Bo's cars are Alex's
  await b.waitForFunction(() => window.__neonbay.all('vehicle').filter(v => v.puppet).length >= 3, null, { timeout: 60000, polling: 500 });
  const own = await b.evaluate(() => window.__neonbay.all('vehicle').filter(v => v.wk && !v.puppet).length);
  step(`Bo sees ${await puppets(b, 'vehicle')} of Alex's vehicles, runs ${own} of his own`);
  if (own) throw new Error('Bo still runs traffic of his own');
  await shot(b, '1-bo-sees-alexs-traffic');

  // four stars: Alex's game sends the chopper, Bo sees the same one
  await a.evaluate(async () => { const w = await import('/js/game/wanted.js'); w.addHeat(60); window.__neonbay.G.heliT = 0; });
  await b.waitForFunction(() => window.__neonbay.all('heli').some(h => h.puppet), null, { timeout: 60000, polling: 500 });
  await b.waitForTimeout(2500);
  const hb = await b.evaluate(() => { const h = window.__neonbay.all('heli')[0]; return { x: h.x, y: h.y, z: h.z, n: window.__neonbay.all('heli').length }; });
  const ha = await a.evaluate(() => { const h = window.__neonbay.all('heli')[0]; return { x: h.x, y: h.y, z: h.z, n: window.__neonbay.all('heli').length }; });
  step(`chopper at Alex ${JSON.stringify(ha)}, at Bo ${JSON.stringify(hb)}`);
  if (hb.n !== 1 || ha.n !== 1 || Math.hypot(ha.x - hb.x, ha.z - hb.z) > 25) throw new Error('not the same chopper');
  await b.evaluate(() => { const { cam, P } = window.__neonbay, h = window.__neonbay.all('heli')[0]; cam.yaw = Math.atan2(h.x - P.x, h.z - P.z); cam.pitch = 0.45; });
  await b.waitForTimeout(600); await shot(b, '2-bo-sees-the-chopper');

  // Bo shoots it down: the hits land in Alex's game, the cash is Bo's
  const cash0 = await b.evaluate(() => window.__neonbay.inv.money);
  await b.evaluate(() => { const h = window.__neonbay.all('heli')[0]; for (let i = 0; i < 4; i++) h.onShot({}, 400); });
  await a.waitForFunction(() => { const h = window.__neonbay.all('heli')[0]; return !h || h.falling; }, null, { timeout: 40000, polling: 500 });
  await b.waitForFunction(c => window.__neonbay.inv.money >= c + 2000, cash0, { timeout: 40000, polling: 500 });
  step('Bo downed the chopper and got paid');

  // five stars: the tank, seen by both, a rocket from Bo counts
  await a.evaluate(async () => { const w = await import('/js/game/wanted.js'); w.addHeat(200); const t = await import('/js/vehicles/tank.js'); const c = await import('/js/game/crew.js'); c.shareOut(t.spawnTank()); });
  await b.waitForFunction(() => window.__neonbay.all('tank').some(t => t.puppet), null, { timeout: 60000, polling: 500 });
  await b.waitForTimeout(1500);
  await b.evaluate(() => { const { cam, P } = window.__neonbay, t = window.__neonbay.all('tank')[0]; cam.yaw = Math.atan2(t.x - P.x, t.z - P.z); cam.pitch = 0.1; P.x = t.x - Math.sin(cam.yaw) * 25; P.z = t.z - Math.cos(cam.yaw) * 25; });
  await b.waitForTimeout(800); await shot(b, '3-bo-sees-the-tank');
  const hp0 = await a.evaluate(() => window.__neonbay.all('tank')[0].hp);
  await b.evaluate(() => window.__neonbay.all('tank')[0].onRocket(500));
  await a.waitForFunction(h => window.__neonbay.all('tank')[0].hp < h, hp0, { timeout: 40000, polling: 500 });
  step(`Bo's rocket took the tank from ${hp0} to ${await a.evaluate(() => window.__neonbay.all('tank')[0].hp)}`);

  // Bo takes a car out of Alex's traffic: Alex's goes, Bo drives his own
  await a.evaluate(async () => { const w = await import('/js/game/wanted.js'); w.setWanted(0, 0); });
  await b.waitForFunction(() => window.__neonbay.all('vehicle').some(v => v.puppet && !v.dead && v.K.enclosed && v.driver), null, { timeout: 60000, polling: 500 });
  const key = await b.evaluate(() => {
    const { P, all } = window.__neonbay, v = all('vehicle').filter(v => v.puppet && !v.dead && v.K.enclosed && v.driver).sort((p, q) => Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(q.x - P.x, q.z - P.z))[0];
    P.x = v.x; P.z = v.z; v.jack(); return v.wk;
  });
  await a.waitForFunction(k => !window.__neonbay.all('vehicle').some(v => v.wk === k), key, { timeout: 40000, polling: 500 });
  const driving = await b.evaluate(() => !!window.__neonbay.P.vehicle);
  step(`Bo jacked ${key} and is driving: ${driving}`);
  if (!driving) throw new Error('Bo is not in the car');
  await b.waitForTimeout(800); await shot(b, '4-bo-jacked-a-car');

  // Alex leaves: Bo runs the world on from where it was
  const before = await puppets(b, 'vehicle');
  await a.evaluate(() => document.getElementById('pauseMpGo').click());
  await waitRole(b, 'host');
  const after = await b.evaluate(() => ({ puppets: window.__neonbay.all('vehicle').filter(v => v.puppet).length, run: window.__neonbay.all('vehicle').filter(v => v.wk && !v.puppet).length }));
  step(`Alex left; Bo hosts, ${after.run} cars running (had ${before} puppets), ${after.puppets} puppets left`);
  if (after.puppets || after.run < before - 2) throw new Error('Bo did not take the traffic over');
  await b.waitForTimeout(2000);
  const moving = await b.evaluate(() => window.__neonbay.all('vehicle').filter(v => v.wk && v.mode === 'traffic' && v.v > 1).length);
  step(`${moving} of them driving on`); await shot(b, '5-bo-took-over');
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('ok');
} catch (e) {
  console.error(e); console.error(errors.join('\n'));
  for (const p of browser.contexts().map(c => c.pages()[0])) console.error(await p.evaluate(() => JSON.stringify([window.__neonbay.all('heli').map(h => [h.puppet, h.falling, h.y]), window.__neonbay.G.state, window.__neonbay.G.time, window.__neonbay.all('vehicle').filter(v => v.wk).map(v => [v.model.id, v.puppet ? 'p' : 'r', v.driver ? 1 : 0, v.dead ? 1 : 0, Math.round(v.x), Math.round(v.z)]), [Math.round(window.__neonbay.P.x), Math.round(window.__neonbay.P.z)]])).catch(() => '')); console.error(log.slice(-2000)); process.exitCode = 1;
} finally {
  await browser.close(); server.close(); dev.kill();
}
