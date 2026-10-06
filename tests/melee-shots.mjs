// Renders melee swings frozen mid-move, plus a couple of live hits, to PNGs. Run with `node tests/melee-shots.mjs [out-dir]`
// (default: melee-shots/). Each still poses the player with a weapon at a point in its swing next to a civilian.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'melee-shots';
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
await page.waitForTimeout(1500);
await page.evaluate(() => { document.getElementById('toast').style.display = 'none'; });

// [weapon, swing step, k through the swing, camera turn from behind]
const STILLS = (process.env.STILLS || "fist,0,0.35,2.2 fist,2,0.4,1.6 bat,0,0.35,2.4 bat,0,0.52,2.4 katana,0,0.5,2.0 machete,0,0.38,1.9 machete,0,0.52,1.9 knife,0,0.42,1.7 golf,0,0.5,2.6 chainsaw,0,0.5,2.1 nightstick,0,0.5,1.9 knuckles,1,0.35,2.0").split(" ");
for (const s of STILLS) {
  const [id, step, k, turn] = s.split(',');
  await page.evaluate(async ([id, step, k, turn]) => {
    const { P, G, cam, inv, all, removeEntity, spawnNpc } = __neonbay;
    const { selectWeapon } = await import('/js/combat/combat.js');
    const { startSwing } = await import('/js/characters/swing.js');
    const { animateChar } = await import('/js/characters/character.js');
    const { WBY } = await import('/js/data/weapons.js');
    G.state = 'play';
    for (const n of all('npc')) if (Math.hypot(n.x - P.x, n.z - P.z) < 12) removeEntity(n);
    inv.owned[id] = true; selectWeapon(id);
    const w = WBY[id], yaw = P.yaw;
    const n = window.__dummy = spawnNpc('civilian', P.x + Math.sin(yaw) * (w.reach + 0.1), P.z + Math.cos(yaw) * (w.reach + 0.1));
    n.yaw = yaw + Math.PI; n.update = function () { this.place(); }; n.place();
    G.state = 'paused';
    P.aiming = true; P.moveSpeed = 0;
    const sw = startSwing(P, w.anim, w.rate, +step); sw.t = +k * sw.dur; sw.hit = true;
    animateChar(P, 0); P.c.root.position.set(P.x, 0, P.z); P.c.root.rotation.y = yaw;
    cam.yaw = yaw + +turn; cam.pitch = -0.12; cam.dist = 4.2;
  }, [id, step, k, turn]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${id}-${step}-${k}.png` });
  console.log('shot', s);
}

// live: a bat to a civilian (knocked flying) and a punch that starts a brawl
for (const [id, label] of [['bat', 'bat-hit'], ['katana', 'katana-hit']]) {
  await page.evaluate(async id => {
    const { P, G, cam, inv, all, removeEntity, spawnNpc } = __neonbay;
    const { selectWeapon } = await import('/js/combat/combat.js');
    G.state = 'play'; P.swing = null;
    for (const n of all('npc')) if (Math.hypot(n.x - P.x, n.z - P.z) < 12) removeEntity(n);
    inv.owned[id] = true; selectWeapon(id); cam.yaw = P.yaw; cam.pitch = 0.05;
    const n = window.__dummy = spawnNpc('civilian', P.x + Math.sin(P.yaw) * 1.2, P.z + Math.cos(P.yaw) * 1.2);
    n.hp = 20; __neonbay.I.clickQ = 0.3;
  }, id);
  await page.waitForFunction(() => !window.__dummy.alive, null, { timeout: 15000 });
  await page.evaluate(() => { __neonbay.cam.yaw += 1.4; });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${label}.png` });
  console.log('shot', label, await page.evaluate(() => ({ y: window.__dummy.y, heat: __neonbay.G.heat })));
}
await browser.close(); server.close();
