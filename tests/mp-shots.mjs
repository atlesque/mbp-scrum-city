// Plays multiplayer for real: two browsers join the shared city on a local copy of the MBP Games service
// (github.com/atlesque/mbp-games, checked out next to this repo or at MBP_GAMES_DIR, run with wrangler dev), see each
// other, shoot each other and ride past each other. Screenshots go to the folder given.
// Run with `node tests/mp-shots.mjs <folder>`. Set CHROMIUM_PATH to use a specific browser binary.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'mp-shots';
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
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function newPlayer() {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
  await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ body: '' }));
  await page.goto(GAME);
  await page.waitForFunction(() => window.__neonbay && window.__neonbay.G.state === 'title' && !document.getElementById('playBtn').disabled, null, { timeout: 120000 });
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 20000 });
  return page;
}
const shot = (page, name) => page.screenshot({ path: join(out, name + '.png') });
const step = msg => console.log('·', msg);
async function joinAs(page, name) {
  await page.click('#mpBtn'); await page.fill('#mpName', name); await page.click('#mpGo');
  await page.waitForFunction(() => /You're in the city/.test(document.getElementById('mpStatus').textContent), null, { timeout: 20000 });
}

try {
  const a = await newPlayer(), b = await newPlayer();
  await joinAs(a, 'Alex'); await joinAs(b, 'Bo');
  await a.waitForFunction(() => /1 other player/.test(document.getElementById('mpStatus').textContent));
  step('both in'); await shot(a, '1-title-joined');
  await a.click('#playBtn'); await b.click('#playBtn');
  await a.waitForTimeout(800);
  // Bo stands 7 m in front of Alex, facing him; Alex's camera looks at Bo
  const at = await a.evaluate(() => { const { P, cam } = window.__neonbay; cam.yaw = P.yaw; cam.pitch = -0.05; return { x: P.x, z: P.z, yaw: P.yaw }; });
  const bx = at.x + Math.sin(at.yaw) * 7, bz = at.z + Math.cos(at.yaw) * 7;
  await b.evaluate(({ bx, bz, at }) => { const { P, cam, inv } = window.__neonbay; P.x = bx; P.z = bz; P.yaw = Math.atan2(at.x - bx, at.z - bz); inv.mag.pistol = 99;
    // the crosshair sits over the right shoulder: aim from there
    const sx = bx - Math.cos(P.yaw) * 0.6, sz = bz + Math.sin(P.yaw) * 0.6; cam.yaw = Math.atan2(at.x - sx, at.z - sz); cam.pitch = 0;
  }, { bx, bz, at });
  await a.waitForTimeout(1500);
  const seen = await a.evaluate(() => window.__neonbay.all('remote').map(r => ({ name: r.name, x: Math.round(r.x), z: Math.round(r.z), visible: r.c.root.visible })));
  step('Alex sees ' + JSON.stringify(seen)); await shot(a, '2-alex-sees-bo');
  if (!seen.length || !seen[0].visible) throw new Error('Bo is not in Alex\'s city');

  // every toast Bo sees (another one, a wanted level say, can replace the kill's)
  await b.evaluate(() => { window.__toasts = []; const t = document.getElementById('toast'); new MutationObserver(() => window.__toasts.push(t.innerHTML)).observe(t, { childList: true, subtree: true, characterData: true }); });
  // Bo opens fire on Alex
  const hp0 = await a.evaluate(() => window.__neonbay.P.hp);
  // pull the trigger every 150 ms while `until` says to keep going (a pistol fires once per click)
  const trigger = async (until, max = 15000) => {
    await b.evaluate(() => { window.__neonbay.I.mouseR = true; });
    for (const end = Date.now() + max; Date.now() < end && await until();) { await b.evaluate(() => { window.__neonbay.I.clickQ = 1; }); await b.waitForTimeout(150); }
    await b.evaluate(() => { window.__neonbay.I.mouseR = false; });
  };
  let n = 0; await trigger(async () => n++ < 5);
  await shot(a, '3-bo-shoots');
  await a.waitForTimeout(400);
  const hp1 = await a.evaluate(() => window.__neonbay.P.hp);
  step(`Alex's health ${hp0} → ${Math.round(hp1)}`);
  if (!(hp1 < hp0)) throw new Error('Bo\'s bullets did not hurt Alex');
  await shot(b, '4-bo-view');

  // finish him: the kill is Bo's
  await trigger(() => a.evaluate(() => window.__neonbay.P.alive));
  if (await a.evaluate(() => window.__neonbay.P.alive)) throw new Error('Alex never went down');
  await b.waitForFunction(() => window.__toasts.some(t => /You<\/b> wasted <b>Alex/.test(t)), null, { timeout: 5000 });
  step('Alex wasted, Bo credited'); await shot(b, '5-bo-wasted-alex'); await shot(a, '6-alex-wasted');
  await a.waitForFunction(() => window.__neonbay.P.alive, null, { timeout: 90000 }); // (software rendering two games at once is slow)

  // Bo takes a bike and rides past Alex at the hospital
  const at2 = await a.evaluate(() => { const { P, cam } = window.__neonbay; cam.yaw = P.yaw; cam.pitch = -0.05; return { x: P.x, z: P.z, yaw: P.yaw }; });
  await b.evaluate(({ at2 }) => {
    const n = window.__neonbay, fx = Math.sin(at2.yaw), fz = Math.cos(at2.yaw), x = at2.x + fx * 9 - fz * 3, z = at2.z + fz * 9 + fx * 3;
    n.spawnVehicle('gs', x, z, at2.yaw + Math.PI / 2); n.P.x = x + fx * 1.2; n.P.z = z + fz * 1.2;
  }, { at2 });
  await b.waitForTimeout(800); // the ride prompt comes up
  await b.keyboard.press('KeyF');
  await b.waitForFunction(() => !!window.__neonbay.P.vehicle, null, { timeout: 10000 });
  const riding = true;
  await a.waitForTimeout(1200);
  const onBike = await a.evaluate(() => window.__neonbay.all('remote').map(r => r.vehicle && r.vehicle.model.id));
  step(`Bo riding: ${riding}, Alex sees ${JSON.stringify(onBike)}`); await shot(a, '7-bo-on-bike');
  if (!onBike.includes('gs')) throw new Error('Alex does not see Bo on the bike');

  // Bo leaves: Alex hears and Bo's player goes
  await b.evaluate(() => document.getElementById('pauseMpGo').click()); // (the pause menu's Leave the city)
  await a.waitForFunction(() => window.__neonbay.all('remote').length === 0, null, { timeout: 5000 });
  step('Bo left'); await shot(a, '8-bo-left');
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('ok');
} catch (e) {
  console.error(e); console.error(log.slice(-2000)); process.exitCode = 1;
} finally {
  await browser.close(); server.close(); dev.kill();
}
