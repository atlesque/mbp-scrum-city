// Plays a short session in headless Chromium: boot, walk, drive each kind of car, ride a bike, shoot someone,
// shoot a driver through the window and take their car, drag a driver out, buy armor at the gun shop, ram a bike and change settings. Fails on any page error or broken step.
// Run with `npm run test:smoke`. Set CHROMIUM_PATH to use a specific browser binary.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const shots = process.env.SMOKE_SHOTS; // optional folder for screenshots
if (shots) mkdirSync(shots, { recursive: true });
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers'; if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).find(d => d.startsWith('chromium-'));
  return dir && existsSync(`${root}/${dir}/chrome-linux/chrome`) ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}

const server = await serve();
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
// serve Three.js from node_modules and skip web fonts, so the test needs no network
// (the CDN's .min.js files are minified copies of the package's build files)
const threeBuild = new URL('../node_modules/three/build/', import.meta.url);
await page.route('https://cdn.jsdelivr.net/npm/three@*/build/*', async r => r.fulfill({ body: await readFile(new URL(r.request().url().split('/').pop().replace('.min.js', '.js'), threeBuild)), contentType: 'text/javascript' }));
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ body: '' }));

let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
  if (shots) await page.screenshot({ path: `${shots}/${name.replace(/\W+/g, '-')}.png` });
}
const game = (fn, arg) => page.evaluate(fn, arg);
// software WebGL runs at a few frames a second, so wait on game state rather than on the clock
async function until(fn, arg, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await game(fn, arg)) return true; await page.waitForTimeout(100); }
  return false;
}
const press = async (key, ms = 80) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
function check(cond, msg) { if (!cond) throw new Error(msg); }
// clear parked and passing vehicles from around a spot, so F and E reach the one the step is about
const clearVehicles = (x, z, keep) => game(([x, z, keep]) => { for (const v of __neonbay.all('vehicle')) if (!(keep && v[keep]) && Math.hypot(v.x - x, v.z - z) < 14) __neonbay.removeEntity(v); }, [x, z, keep]);

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await step('boots to the title screen', async () => {
    await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 60000 });
    check(await game(() => window.__neonbay.all('npc').length > 10), 'expected the streets to be populated');
    console.log('     three r' + await game(() => THREE.REVISION));
  });
  await page.click('#playBtn');
  await page.waitForTimeout(1000);

  await step('walks', async () => {
    const from = await game(() => ({ x: __neonbay.P.x, z: __neonbay.P.z }));
    await page.keyboard.down('KeyW');
    const moved = await until(f => Math.hypot(__neonbay.P.x - f.x, __neonbay.P.z - f.z) > 2, from);
    await page.keyboard.up('KeyW');
    check(moved, 'player did not move');
  });

  for (const model of ['sedan', 'modely', 'gs']) {
    await step(`gets in and drives a ${model}`, async () => {
      const id = await game(m => {
        const { P, spawnVehicle } = __neonbay, yaw = P.yaw;
        const v = spawnVehicle(m, P.x + Math.sin(yaw) * 2.5, P.z + Math.cos(yaw) * 2.5, yaw);
        return (v.testId = Math.random());
      }, model);
      // wait for this vehicle's prompt: the list can still hold the last one for a frame
      check(await until(id => (__neonbay.G.near[0] || {}).prompt?.includes(__neonbay.all('vehicle').find(v => v.testId === id).model.name), id), 'no prompt to get on');
      await press('KeyF');
      check(await until(id => __neonbay.P.vehicle && __neonbay.P.vehicle.testId === id, id), 'F did not get the player on board');
      const from = await game(() => ({ x: __neonbay.P.vehicle.x, z: __neonbay.P.vehicle.z }));
      await page.keyboard.down('KeyW');
      const moved = await until(f => Math.hypot(__neonbay.P.vehicle.x - f.x, __neonbay.P.vehicle.z - f.z) > 3, from);
      await page.keyboard.up('KeyW');
      check(moved, 'vehicle did not move');
      await page.keyboard.down('KeyS');
      const stopped = await until(() => Math.abs(__neonbay.P.vehicle.v) < 3);
      await page.keyboard.up('KeyS');
      check(stopped, 'vehicle did not brake');
      await press('KeyF');
      check(await until(() => !__neonbay.P.vehicle), 'F did not get the player off');
      await game(id => { for (const v of __neonbay.all('vehicle')) if (v.testId === id) __neonbay.removeEntity(v); }, id);
    });
  }

  await step('shoots a civilian, who drops cash', async () => {
    const before = await game(() => __neonbay.stats.kills);
    for (let i = 0; i < 12; i++) {
      const done = await game(() => {
        const { P, cam, I, all, spawnNpc } = __neonbay;
        let n = window.__target;
        if (!n || n.removed) {
          // the camera looks over the right shoulder, so stand the target on that line
          cam.pitch = -0.1;
          const rx = -Math.cos(cam.yaw) * 0.55, rz = Math.sin(cam.yaw) * 0.55;
          n = window.__target = spawnNpc('civilian', P.x + rx + Math.sin(cam.yaw) * 5, P.z + rz + Math.cos(cam.yaw) * 5);
          n.update = function () { this.place && this.place(); }; // stand still
        }
        if (!n.alive) return true;
        P.yaw = cam.yaw; I.clickQ = 0.3; return false;
      });
      if (done) break;
      await until(() => __neonbay.I.clickQ === 0, undefined, 3000);
      await page.waitForTimeout(300);
    }
    const r = await game(() => ({ hp: window.__target && window.__target.hp, kills: __neonbay.stats.kills, cash: __neonbay.all('pickup').filter(p => p.val).length, wanted: __neonbay.G.heat }));
    check(r.kills === before + 1, `target was not taken down (hp ${r.hp})`);
    check(r.cash > 0, 'no cash dropped');
    check(r.wanted > 0, 'no heat was added');
  });

  await step('shoots a driver through the window and takes the car', async () => {
    const before = await game(() => __neonbay.stats.kills);
    for (let i = 0; i < 16; i++) {
      const done = await game(() => {
        const { P, cam, I, spawnVehicle, spawnNpc } = __neonbay;
        let c = window.__car;
        if (!c) {
          // park a car side-on so the driver's seat sits on the aim line over the right shoulder
          cam.pitch = -0.06;
          const yaw = cam.yaw + Math.PI / 2, tx = P.x - Math.cos(cam.yaw) * 0.55 + Math.sin(cam.yaw) * 6, tz = P.z + Math.sin(cam.yaw) * 0.55 + Math.cos(cam.yaw) * 6;
          const sx = 0.45, sz = -0.4;
          c = window.__car = spawnVehicle('modely', tx - (sx * Math.cos(yaw) + sz * Math.sin(yaw)), tz - (-sx * Math.sin(yaw) + sz * Math.cos(yaw)), yaw);
          c.seatDriver(window.__driver = spawnNpc('motorist', c.x, c.z));
        }
        if (!window.__driver.alive) return true;
        P.yaw = cam.yaw; I.clickQ = 0.3; return false;
      });
      if (done) break;
      await until(() => __neonbay.I.clickQ === 0, undefined, 3000);
      await page.waitForTimeout(300);
    }
    const r = await game(() => ({ hp: __driver.hp, kills: __neonbay.stats.kills, seated: !!__car.driver, carHp: __car.hp, max: __car.model.hp }));
    check(r.kills === before + 1, `driver was not taken down (driver hp ${r.hp}, car hp ${r.carHp})`);
    check(!r.seated, 'the body is still behind the wheel');
    check(r.carHp === r.max, `shots through the glass damaged the car (hp ${r.carHp})`);
    await game(() => { const { P } = __neonbay, at = __car.K.exitAt(__car); P.x = at.x; P.z = at.z; __car.mine = true; });
    await clearVehicles(...await game(() => [__car.x, __car.z]), 'mine');
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes('drive the Tesla')), 'no prompt to get in');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__car), 'F did not put the player behind the wheel');
    await until(() => __neonbay.G.near.some(i => i.priority === 9)); // the prompt list catches up with the player being on board
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player out');
    await game(() => __neonbay.removeEntity(__car));
  });

  await step('pulls a driver out of a stopped car', async () => {
    await game(() => {
      const { G, P, all, removeEntity, spawnVehicle, spawnNpc } = __neonbay; G.heat = 0; G.wanted = 0;
      for (const v of all('vehicle')) if (Math.hypot(v.x - P.x, v.z - P.z) < 14) removeEntity(v);
      const c = window.__jack = spawnVehicle('sedan', P.x + Math.cos(P.yaw) * 1.9, P.z - Math.sin(P.yaw) * 1.9, P.yaw);
      c.seatDriver(window.__jacked = spawnNpc('motorist', c.x, c.z));
    });
    check(await until(() => /pull the driver/.test((__neonbay.G.near[0] || {}).prompt)), 'no prompt to pull the driver out');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__jack), 'F did not take the car');
    const r = await game(() => ({ out: !__jacked.vehicle && __jacked.alive, heat: __neonbay.G.heat }));
    check(r.out, 'the driver is still in the car');
    check(r.heat > 0, 'carjacking added no heat');
    await until(() => __neonbay.G.near.some(i => i.priority === 9)); // the prompt list catches up with the player being on board
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player out');
    await game(() => __neonbay.removeEntity(__jack));
  });

  await step('buys armor at the gun shop', async () => {
    await game(() => {
      const { P, G, inv, all } = __neonbay, s = all('shop')[0];
      G.wanted = 0; G.heat = 0; inv.money = 5000; P.armor = 0; P.x = s.x; P.z = s.z;
    });
    await clearVehicles(...await game(() => [__neonbay.P.x, __neonbay.P.z]));
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes('to shop at')), 'no shop prompt'); // not a parked car's E
    await press('KeyE');
    check(await until(() => __neonbay.G.state === 'shop' && !document.getElementById('shop').hidden), 'E did not open the shop');
    await page.click('#shopGrid .card:has-text("armor") button[data-a="buy"], #shopGrid .card:has-text("Armor") button[data-a="buy"]');
    const r = await game(() => ({ armor: __neonbay.P.armor, money: __neonbay.inv.money }));
    check(r.armor === 100 && r.money < 5000, `armor not bought (armor ${r.armor}, money ${r.money})`);
    await page.click('#shopClose');
    check(await game(() => __neonbay.G.state === 'play'), 'shop did not close');
  });

  await step('rams a parked bike out of the way', async () => {
    // on an empty stretch of road, away from the shop's prompt
    await clearVehicles(5, -50);
    await game(() => { const { P, spawnVehicle } = __neonbay; P.x = 5.5; P.z = -60; window.__ram = spawnVehicle('sedan', 3, -60, 0); });
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), 'no prompt to get in');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__ram), 'F did not put the player behind the wheel');
    // down the lane at a bike parked across it
    await game(() => { __ram.x = 3; __ram.z = -60; __ram.yaw = 0; __ram.v = 22; window.__bike = __neonbay.spawnVehicle('gs', 3, -42, Math.PI / 2); });
    await page.keyboard.down('KeyW');
    const hit = await until(() => __bike.air > 0 || __bike.kvz > 0);
    const past = await until(() => __ram.z > -38);
    const r = await game(() => ({ v: __ram.v, z: __ram.z, bz: __bike.z }));
    await page.keyboard.up('KeyW');
    check(hit, 'the bike was not knocked');
    check(past && r.v > 8, `the car stopped against the bike (speed ${r.v.toFixed(1)}, at ${r.z.toFixed(1)})`);
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player out');
    await game(() => { __neonbay.removeEntity(__ram); __neonbay.removeEntity(__bike); });
  });

  await step('changes settings from the pause menu', async () => {
    await press('KeyP');
    check(await until(() => __neonbay.G.state === 'paused'), 'P did not pause');
    await page.click('#pauseSettingsBtn');
    check(await page.isVisible('#settings') && !(await page.isVisible('#pause')), 'the Settings screen did not open');
    await page.click('#setBody .tgl[data-set="sound"]');
    await page.locator('#setBody input[data-set="musicVolume"]').fill('0.4');
    await page.click('#setTabs [data-tab="gameplay"]');
    await page.click('#setBody [data-set="units"][data-val="mph"]');
    await page.click('#setTabs [data-tab="controls"]');
    check(await page.locator('#setBody .ctl').count() > 10, 'the Controls tab lists no keys');
    const saved = await game(() => JSON.parse(localStorage.getItem('neonbay86.settings')));
    check(saved.sound === false && saved.musicVolume === 0.4 && saved.units === 'mph', 'settings were not saved: ' + JSON.stringify(saved));
    await page.keyboard.press('Escape');
    check(await page.isVisible('#pause') && !(await page.isVisible('#settings')), 'Esc did not go back to the pause menu');
    await page.click('#pauseSettingsBtn'); await page.click('#setTabs [data-tab="sound"]'); await page.click('#setReset'); await page.click('#setBack');
    check(await game(() => localStorage.getItem('neonbay86.settings').includes('"sound":true')), 'reset did not restore the defaults');
    await page.click('#resumeBtn');
    check(await until(() => __neonbay.G.state === 'play'), 'did not resume');
  });

  await step('survives a five-star chase', async () => {
    await game(() => { const { G, P } = __neonbay; G.heat = 100; G.wanted = 5; G.spawnT = 0; G.heliT = 0; P.hp = 100; });
    check(await until(() => __neonbay.all('npc').some(n => n.faction === 'law' && n.alive) && __neonbay.all('vehicle').some(v => v.model.police), undefined, 40000), 'the law never showed up');
    check(await until(() => !!__neonbay.G.heli, undefined, 20000), 'no helicopter at five stars');
    await page.waitForTimeout(8000);
  });
} finally {
  await browser.close(); server.close();
}
if (errors.length) { failed++; console.log('FAIL page errors:\n  ' + errors.join('\n  ')); }
console.log(failed ? `${failed} smoke step(s) failed` : 'smoke test passed');
process.exit(failed ? 1 : 0);
