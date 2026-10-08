// Plays the MBP Games account flow against a local copy of the accounts service (github.com/atlesque/mbp-games,
// checked out next to this repo or at MBP_GAMES_DIR, run with wrangler dev and a throwaway database): guest title screen, sign in by email link, progress sync on death,
// then the admin page resets the player's progress and bans them. Screenshots go to the folder given.
// Run with `node tests/account-shots.mjs <folder>`. Set CHROMIUM_PATH to use a specific browser binary.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'account-shots';
mkdirSync(out, { recursive: true });
const ACC = 'http://localhost:8788';
const svc = process.env.MBP_GAMES_DIR || new URL('../../mbp-games/', import.meta.url).pathname, bin = join(svc, 'node_modules/.bin/wrangler');
if (!existsSync(bin)) { console.error(`Needs the mbp-games repo with npm install done, at ${svc} (or set MBP_GAMES_DIR).`); process.exit(1); }
const state = mkdtempSync(join(tmpdir(), 'mbpg-'));
const run = (args, opts = {}) => spawn(bin, args, { cwd: svc, ...opts });
await new Promise(r => run(['d1', 'migrations', 'apply', 'mbp-games', '--local', '--persist-to', state]).on('exit', r));
let log = '';
const dev = run(['dev', '--port', '8788', '--persist-to', state, '--var', 'ADMIN_EMAILS:boss@example.com']);
dev.stdout.on('data', d => { log += d; }); dev.stderr.on('data', d => { log += d; });
for (let i = 0; i < 60 && !/Ready on/.test(log); i++) await new Promise(r => setTimeout(r, 500));

// the newest sign-in link the local email simulator saved (in an email-text/ folder under .wrangler or the temp dir).
// wrangler dev names the link after the production host (the route in wrangler.jsonc), so point it back here
async function lastLink() {
  const dirs = [join(svc, '.wrangler/tmp/email'), state, ...readdirSync(tmpdir()).filter(d => d.startsWith('miniflare-')).map(d => join(tmpdir(), d))];
  for (let i = 0; i < 20; i++) {
    const files = dirs.filter(d => existsSync(d)).flatMap(d => readdirSync(d, { recursive: true }).filter(f => /email-text\/.+\.txt$/.test(f)).map(f => join(d, f)));
    files.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
    for (const f of files.reverse()) { const m = (await readFile(f, 'utf8')).match(/\/auth\/link\?t=[\w-]+/); if (m && !used.has(m[0])) { used.add(m[0]); return ACC + m[0]; } }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('no sign-in email from the local service in ' + dirs.join(', ') + ':\n' + log.slice(-3000));
}
const used = new Set();

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
async function newPage(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
  await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ body: '' }));
  return page;
}
const shot = (page, name) => page.screenshot({ path: join(out, name + '.png') });
const titleReady = async page => { await page.waitForFunction(() => window.__neonbay && window.__neonbay.G.state === 'title' && !document.getElementById('playBtn').disabled, null, { timeout: 120000 }); await page.waitForSelector('#loading', { state: 'hidden', timeout: 20000 }); };
const step = msg => console.log('·', msg);

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const game = await newPage(ctx);
  await game.goto(GAME); await titleReady(game);
  step('guest title'); await shot(game, '1-title-guest');
  await game.click('#signInBtn');
  await game.waitForURL(u => u.toString().startsWith(ACC + '/signin'));
  await game.waitForSelector('#email');
  step('sign-in page'); await shot(game, '2-signin');
  await game.fill('#email', 'player@example.com'); await game.click('#go');
  await game.waitForSelector('text=Check your inbox');
  step('waiting for the link'); await shot(game, '3-check-inbox');

  // the link opens on "another device": its own browser, no cookies
  const phone = await browser.newContext({ viewport: { width: 390, height: 760 } });
  const link = await newPage(phone);
  await link.goto(await lastLink());
  step('link page'); await shot(link, '4-link');
  await link.click('button.btn');
  await link.waitForSelector('text=You\'re in').catch(async e => { await shot(link, 'fail-link'); console.log(await link.content()); throw e; });
  await shot(link, '5-link-done');

  // the waiting tab carries on by itself, back to the game, signed in
  await game.waitForURL(u => u.toString().startsWith(GAME.split('?')[0]), { timeout: 20000 });
  await titleReady(game);
  await game.waitForSelector('#signOutBtn');
  step('signed in'); await shot(game, '6-title-signed-in');

  // play, earn, die: the death syncs the save
  await game.click('#playBtn');
  await game.evaluate(() => { window.__neonbay.inv.money = 12345; window.__neonbay.inv.owned.smg = true; });
  await game.evaluate(() => window.__neonbay.hurtPlayer(500));
  await game.waitForTimeout(1500);
  const saved = await game.evaluate(async acc => (await fetch(acc + '/api/games/scrum-city/progress', { headers: { authorization: 'Bearer ' + JSON.parse(localStorage.mbpgames).token } })).json(), ACC);
  if (saved.data.money !== 11110) throw new Error('death did not sync: ' + JSON.stringify(saved).slice(0, 200));
  step(`synced on death: $${saved.data.money}, rev ${saved.rev}`);

  // admin: sign in as boss, see the player, reset and ban
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const admin = await newPage(adminCtx);
  await admin.goto(ACC + '/admin');
  await admin.waitForSelector('#email');
  await admin.fill('#email', 'boss@example.com'); await admin.click('#go');
  await admin.waitForSelector('text=Check your inbox');
  const l2 = await newPage(adminCtx);
  await l2.goto(await lastLink()); await l2.click('button.btn'); await l2.close();
  await admin.waitForURL(ACC + '/admin', { timeout: 20000 });
  await admin.waitForSelector('tr.pick');
  step('admin list'); await shot(admin, '7-admin-players');
  await admin.click('tr.pick:has-text("player@example.com")');
  await admin.waitForSelector('[data-reset]');
  await admin.evaluate(() => { document.querySelector('details')?.setAttribute('open', ''); });
  step('admin player'); await shot(admin, '8-admin-player');
  admin.once('dialog', d => d.accept());
  await admin.click('[data-reset]');
  await admin.waitForSelector('text=Fresh start');
  admin.once('dialog', d => d.accept('Testing the ban button'));
  await admin.click('#ban');
  await admin.waitForSelector('#unban');
  step('admin after reset + ban'); await shot(admin, '9-admin-banned');

  // the game hears about it on its next save
  await game.evaluate(() => { window.__neonbay.inv.money += 1; });
  await game.reload(); await titleReady(game);
  await game.waitForSelector('.acct-warn');
  step('banned in game'); await shot(game, '10-title-banned');
  const money = await game.evaluate(() => window.__neonbay.inv.money);
  console.log('money after ban (guest copy kept):', money);
  if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
  console.log('account flow OK');
} finally {
  await browser.close(); server.close(); dev.kill();
}
