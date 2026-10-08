// Where a rocket leaves the launcher, fired from rest and while already aiming, with screenshots: node tests/rocket-shots.mjs <out folder>
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'rocket-shots'; mkdirSync(out, { recursive: true });
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
  // a clear street, the launcher in hand, the camera swung round to the side to see the shooter
  await game(async () => {
    const { P, cam, inv, all, removeEntity } = __neonbay, { selectWeapon } = await import('/js/combat/combat.js'), { scene, renderer, camera } = await import('/js/render/scene.js');
    // film from the shooter's right, 5 m out, at chest height, looking across at them
    const render = renderer.render.bind(renderer);
    renderer.render = (s, c) => { if (c === camera) { const r = P.yaw - Math.PI / 2; camera.position.set(P.x + Math.sin(r) * 5 + Math.sin(P.yaw) * 1.5, 1.4, P.z + Math.cos(r) * 5 + Math.cos(P.yaw) * 1.5); camera.lookAt(P.x + Math.sin(P.yaw) * 1.5, 1.1, P.z + Math.cos(P.yaw) * 1.5); } return render(s, c); };
    for (const e of all()) if ((e.kind === 'npc' || e.kind === 'vehicle') && Math.hypot(e.x - P.x, e.z - P.z) < 40) removeEntity(e);
    inv.owned.rpg = true; inv.mag.rpg = 9; inv.ammo = inv.ammo || {}; selectWeapon('rpg'); cam.pitch = 0.05;
    // record where every rocket first appears (rockets are 0.7 m long, 0.16 m thick)
    window.__spawns = []; const add = scene.add.bind(scene);
    scene.add = (...o) => { for (const m of o) if (m.isMesh && m.scale.z === 0.7 && m.scale.x === 0.16) __spawns.push({ y: m.position.y - P.y, fwd: (m.position.x - P.x) * Math.sin(P.yaw) + (m.position.z - P.z) * Math.cos(P.yaw) }); return add(...o); };
  });
  for (const [name, aimFirst] of [['from-rest', false], ['aiming', true]]) {
    await game(a => { __neonbay.I.mouseR = a; __neonbay.inv.mag.rpg = 9; __neonbay.G.reloadT = 0; __neonbay.G.fireCd = 0; }, aimFirst);
    await page.waitForTimeout(1800);
    await game(() => { __neonbay.I.clickQ = 0.2; });
    await page.waitForTimeout(30);
    await page.screenshot({ path: `${out}/${name}.png` });
    await page.waitForTimeout(1500);
  }
  const s = await game(() => __spawns);
  console.log('rocket spawn, height above feet and distance ahead:', s.map(p => `${p.y.toFixed(2)} m up, ${p.fwd.toFixed(2)} m ahead`).join(' | '));
} finally { await browser.close(); server.close(); }
