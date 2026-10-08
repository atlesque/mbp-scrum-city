// Plays through flying the police chopper in the real game and takes screenshots: shoot the pilot, watch it come down
// in one piece, get in, lift off, fire the minigun and a rocket burst, sweep the searchlight, then jump out under the chute.
// node tests/pilot-shots.mjs <out folder>
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'pilot-shots'; mkdirSync(out, { recursive: true });
const root = '/opt/pw-browsers', dir = existsSync(root) && readdirSync(root).find(d => d.startsWith('chromium-'));
const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (dir ? `${root}/${dir}/chrome-linux/chrome` : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.log('page error', e.message); });
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ body: '' }));
const game = (fn, arg) => page.evaluate(fn, arg);
async function until(fn, arg, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await game(fn, arg)) return true; await page.waitForTimeout(100); }
  return false;
}
const shot = name => page.screenshot({ path: `${out}/${name}.png` });
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const log = (...a) => console.log(...a);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 90000 });
  await page.click('#playBtn'); await page.waitForTimeout(1000);
  const night = process.argv[3] === 'night';
  if (night) await game(() => __neonbay.lighting.set(1));

  // a chopper overhead, the player in the open street looking up at its canopy
  log('pilot shot', await game(async () => {
    const { G, P, cam, all, removeEntity } = __neonbay, H = await import('/js/vehicles/heli.js'), { castShot } = await import('/js/combat/combat.js');
    const { camTarget } = await import('/js/game/player.js');
    for (const e of all()) if ((e.kind === 'vehicle' || e.kind === 'npc') && Math.hypot(e.x, e.z - 25) < 40) removeEntity(e);
    P.x = 0; P.z = 20; P.y = 0; G.wanted = 4; G.heat = 1e6;
    H.removeHeli(); H.spawnHeli(); const h = G.heli; h.fireT = 1e9; h.x = 0; h.z = 46; h.y = 30; h.yaw = Math.PI; h.ang = Math.PI / 2;
    h.update(0.01); h.grp.updateMatrixWorld(true);
    const head = h.seat.localToWorld(new THREE.Vector3(0, 1.74, 0));
    P.yaw = cam.yaw = Math.atan2(head.x - P.x, head.z - P.z);
    cam.pitch = Math.atan2(head.y - 1.62, Math.hypot(head.x - P.x, head.z - P.z));
    window.__head = head;
    // a shot from where the player stands at the pilot's head finds the pilot, not the bodywork
    const o = new THREE.Vector3(P.x, 1.62, P.z), d = head.clone().sub(o).normalize(), hit = castShot(o, d, 200);
    return { entity: hit.entity === h, pilot: hit.occupant, head: hit.head, kind: hit.kind, t: hit.t, direct: h.raycast(o, d, 200), head0: head, h: [h.x, h.y, h.z] };
  }));
  await page.waitForTimeout(800);
  await shot('1-pilot-in-sight');
  log('pilot down', await game(async () => {
    const { G } = __neonbay, h = G.heli, { castShot } = await import('/js/combat/combat.js');
    // two rifle rounds through the canopy, aimed at the pilot where he sits now
    for (let i = 0; i < 2; i++) {
      h.grp.updateMatrixWorld(true);
      const head = h.seat.localToWorld(new THREE.Vector3(0, 1.74, 0)), o = new THREE.Vector3(__neonbay.P.x, 1.62, __neonbay.P.z), d = head.sub(o).normalize();
      const hit = castShot(o, d, 200); h.onShot(hit, 36, d);
    }
    return { downed: h.downed, pilotHp: h.pilotHp };
  }));
  await page.waitForTimeout(700);
  await shot('2-coming-down');
  check(await until(() => __neonbay.all('vehicle').some(v => v.model.id === 'heli')), 'the chopper never landed');
  log('landed', await game(() => { const v = __neonbay.all('vehicle').find(v => v.model.id === 'heli'); window.__heli = v; return { y: +v.y.toFixed(2), hp: v.hp, dead: v.dead, policeHeli: !!__neonbay.G.heli }; }));
  await game(() => { const { P, cam } = __neonbay, v = window.__heli; P.x = v.x + 7; P.z = v.z - 5; cam.yaw = P.yaw = Math.atan2(v.x - P.x, v.z - P.z); cam.pitch = -0.05; __neonbay.G.wanted = 0; __neonbay.G.heat = 0; for (const n of __neonbay.all('npc')) if (n.faction === 'law') __neonbay.removeEntity(n); });
  await page.waitForTimeout(1200);
  await shot('3-landed');

  // in, rotors up, and off the ground
  await game(() => { const { P } = __neonbay, v = window.__heli; P.x = v.x + Math.cos(v.yaw) * 2.6; P.z = v.z - Math.sin(v.yaw) * 2.6; });
  check(await until(() => !document.getElementById('prompt').hidden && /fly/.test(document.getElementById('prompt').textContent), undefined, 8000), 'no prompt to fly the chopper');
  await page.keyboard.press('KeyF');
  check(await until(() => __neonbay.P.vehicle === window.__heli), 'did not get in');
  await page.waitForTimeout(500);
  log('in', await game(() => ({ chute: !!__neonbay.P.chute, hud: document.getElementById('wname').textContent })));
  // straight up over the street, then along it (the road at x 0 runs along z)
  await game(() => { __neonbay.cam.yaw = 0; __neonbay.cam.pitch = -0.3; });
  await page.keyboard.down('Space'); await until(() => window.__heli.y > 45, undefined, 120000); await page.keyboard.up('Space');
  log('climbed', await game(() => ({ y: +window.__heli.y.toFixed(1), rotor: +window.__heli.rotor.toFixed(2) })));
  check(await game(() => window.__heli.y > 10), 'it did not climb');
  await game(() => { __neonbay.cam.pitch = -0.35; __neonbay.cam.yaw = 0; });
  await page.keyboard.down('KeyW'); await until(() => window.__heli.v > 15, undefined, 60000);
  await shot('4-flying');
  await page.keyboard.up('KeyW');
  log('flew', await game(() => ({ x: +window.__heli.x.toFixed(1), z: +window.__heli.z.toFixed(1), y: +window.__heli.y.toFixed(1), speed: +window.__heli.v.toFixed(1) })));

  // minigun, then a burst of rockets
  await game(() => { __neonbay.cam.pitch = -0.7; __neonbay.cam.yaw = 0; __neonbay.I.mouseL = true; });
  await until(() => window.__heli.guns.mag.minigun < 230, undefined, 30000);
  await shot('5-minigun');
  log('minigun', await game(() => { __neonbay.I.mouseL = false; return window.__heli.guns.mag; }));
  await page.keyboard.press('Digit2');
  await game(() => { __neonbay.I.clickQ = 0.3; });
  await page.waitForTimeout(300);
  await shot('6-rockets');
  check(await until(() => window.__heli.guns.mag.rockets === 3), 'one click did not fire three rockets');
  log('rockets', await game(() => ({ mag: window.__heli.guns.mag, hud: document.getElementById('wname').textContent + ' ' + document.getElementById('ammo').textContent })));
  await page.waitForTimeout(1200);

  // the searchlight follows the crosshair, but stops at the horizon
  await game(() => { __neonbay.cam.pitch = -0.6; });
  await page.waitForTimeout(800);
  await shot('7-searchlight');
  log('light', await game(() => { const L = window.__heli.mesh.light; return { beam: L.beam.visible, spot: L.spot.visible, len: +L.beam.scale.y.toFixed(1) }; }));
  await game(() => { __neonbay.cam.pitch = 0.6; });
  await page.waitForTimeout(500);
  log('light aimed up', await game(() => { const L = window.__heli.mesh.light, o = L.beam.position; return { tipBelowLamp: +(L.spot.position.y - window.__heli.y).toFixed(1), beamUp: L.beam.visible }; }));

  // out: no tumble, the chute opens, the chopper drops and goes up on the ground
  await game(() => { __neonbay.cam.pitch = -0.4; });
  await page.keyboard.press('KeyF');
  check(await until(() => !__neonbay.P.vehicle), 'did not jump out');
  log('jumped', await game(() => ({ y: +__neonbay.P.y.toFixed(1), chute: !!__neonbay.P.chute?.open, tumble: !!__neonbay.P.tumble, hp: __neonbay.P.hp, heli: { y: +window.__heli.y.toFixed(1), hp: Math.round(window.__heli.hp) } })));
  await page.waitForTimeout(1500);
  await shot('8-chute');
  check(await until(() => window.__heli.dead, undefined, 120000), 'the empty chopper did not crash');
  await shot('9-crashed');
  check(await until(() => __neonbay.P.grounded && !__neonbay.P.chute, undefined, 240000), 'never landed under the chute');
  log('wanted', await game(() => __neonbay.G.wanted));
  log('landed under the chute', await game(() => ({ hp: __neonbay.P.hp, alive: __neonbay.P.alive })));
} catch (e) { console.log('FAILED', e.message); process.exitCode = 1; }
if (errors.length) { console.log('page errors:', errors); process.exitCode = 1; }
await browser.close(); server.close();
function check(c, m) { if (!c) throw new Error(m); }
