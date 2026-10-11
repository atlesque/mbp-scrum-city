// Plays multiplayer for real: two browsers join the shared city on a local copy of the MBP Games service
// (github.com/atlesque/mbp-games, checked out next to this repo or at MBP_GAMES_DIR, run with wrangler dev), see each
// other and each other's people, share one wanted level, get hunted by the same cops and show on each other's map.
// Screenshots go to the folder given.
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
  // Bo stands 7 m in front of Alex; both cameras look at the other
  const at = await a.evaluate(() => { const { P, cam } = window.__neonbay; cam.yaw = P.yaw; cam.pitch = -0.05; return { x: P.x, z: P.z, yaw: P.yaw }; });
  const bx = at.x + Math.sin(at.yaw) * 7, bz = at.z + Math.cos(at.yaw) * 7;
  await b.evaluate(({ bx, bz, at }) => { const { P, cam, inv } = window.__neonbay; P.x = bx; P.z = bz; P.yaw = Math.atan2(at.x - bx, at.z - bz); cam.yaw = P.yaw; cam.pitch = -0.05; inv.mag.pistol = 99; }, { bx, bz, at });
  await a.waitForTimeout(1500);
  const seen = await a.evaluate(() => window.__neonbay.all('remote').map(r => ({ name: r.name, visible: r.c.root.visible })));
  step('Alex sees ' + JSON.stringify(seen)); await shot(a, '2-alex-sees-bo');
  if (!seen.length || !seen[0].visible) throw new Error('Bo is not in Alex\'s city');

  // the same people in both cities: Bo sees Alex's
  await b.waitForFunction(() => window.__neonbay.all('ghost').length > 3, null, { timeout: 15000 });
  const ghosts = await b.evaluate(() => window.__neonbay.all('ghost').length);
  step(`Bo sees ${ghosts} of Alex's people`); await shot(b, '3-bo-sees-alexs-people');

  // one wanted level: Alex draws heat, Bo has it too
  await a.evaluate(async () => (await import('/js/game/wanted.js')).addHeat(30));
  await b.waitForFunction(() => window.__neonbay.G.wanted === 3, null, { timeout: 5000 });
  step('Alex at 3 stars, Bo too');

  // a cop of Alex's game, right by Bo, goes after Bo (the nearer of the crew), and Bo feels his bullets
  const cop = await a.evaluate(({ bx, bz }) => { const n = window.__neonbay.spawnNpc('cop', bx + 9, bz + 2); n.hp = 400; window.__cop = n; return true; }, { bx, bz });
  await a.waitForFunction(() => window.__cop.tgt && window.__cop.tgt.kind === 'remote', null, { timeout: 5000 });
  step('Alex\'s cop hunts Bo: ' + cop);
  const hp0 = await b.evaluate(() => window.__neonbay.P.hp);
  await b.waitForFunction(h => window.__neonbay.P.hp < h, hp0, { timeout: 30000 });
  step(`Bo hit by Alex's cop: ${hp0} → ${Math.round(await b.evaluate(() => window.__neonbay.P.hp))}`); await shot(b, '4-cop-on-bo');

  // Bo takes the cop down: the damage lands in Alex's game, the kill counts for Bo
  await a.evaluate(() => { window.__cop.hp = 20; });
  const kills0 = await b.evaluate(() => window.__neonbay.stats.kills);
  await b.evaluate(async () => {
    const { P, all } = window.__neonbay, { castBullet } = await import('/js/combat/combat.js');
    for (let k = 0; k < 6; k++) {
      const g = all('ghost').filter(g => g.type === 'cop' && g.alive).sort((p, q) => Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(q.x - P.x, q.z - P.z))[0]; if (!g) break;
      const o = new THREE.Vector3(P.x, 1.3, P.z), d = new THREE.Vector3(g.x, 1.3, g.z).sub(o).normalize(), h = castBullet(o, d, 80);
      if (h.kind === 'entity' && h.entity === g) h.entity.onShot(h, 40, d);
      await new Promise(r => setTimeout(r, 300));
    }
  });
  await a.waitForFunction(() => !window.__cop.alive, null, { timeout: 10000 });
  await b.waitForFunction(k => window.__neonbay.stats.kills > k, kills0, { timeout: 10000 });
  step('Bo downed Alex\'s cop and got the kill'); await shot(b, '5-bo-downs-cop');

  // Alex's world map shows Bo, live, as he walks off
  await a.keyboard.press('KeyM'); await a.waitForTimeout(500);
  await b.evaluate(() => { const { P } = window.__neonbay; P.x += 30; });
  await a.waitForTimeout(800);
  step('Alex\'s map'); await shot(a, '6-alex-map');
  await a.keyboard.press('KeyM');

  // Bo leaves: Alex hears and Bo's player and people go
  await b.evaluate(() => document.getElementById('pauseMpGo').click()); // (the pause menu's Leave the city)
  await a.waitForFunction(() => window.__neonbay.all('remote').length === 0 && window.__neonbay.all('ghost').length === 0, null, { timeout: 5000 });
  step('Bo left'); await shot(a, '7-bo-left');
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('ok');
} catch (e) {
  console.error(e); console.error(log.slice(-2000)); process.exitCode = 1;
} finally {
  await browser.close(); server.close(); dev.kill();
}
