// Plays a short session in headless Chromium: boot, load a .glb building, walk, drive each kind of car, ride a bike, shoot someone, take a juggernaut's rocket, throw a car with a rocket,
// shoot a driver through the window and take their car, drag a driver out, buy armor at the gun shop, ram a bike, shunt a parked car, walk into the edge wall and change settings. Fails on any page error or broken step.
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
await page.route('https://cdn.jsdelivr.net/npm/three@*/examples/jsm/**', async r => r.fulfill({ body: await readFile(new URL('../node_modules/three/examples/jsm/' + r.request().url().split('/examples/jsm/')[1], import.meta.url)), contentType: 'text/javascript' }));
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
// passing traffic and pedestrians can shove the player or the target, or step into the line of fire
const clearLane = () => game(() => {
  const { P, all, removeEntity } = __neonbay, near = e => Math.hypot(e.x - P.x, e.z - P.z) < 16;
  for (const v of all('vehicle')) if (v !== window.__car && near(v)) removeEntity(v);
  for (const n of all('npc')) if (n !== window.__target && n !== window.__driver && near(n)) removeEntity(n);
});
const clearVehicles = (x, z, keep) => game(([x, z, keep]) => { for (const v of __neonbay.all('vehicle')) if (!(keep && v[keep]) && Math.hypot(v.x - x, v.z - z) < 14) __neonbay.removeEntity(v); }, [x, z, keep]);

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
  await step('shows the loading screen while it boots', async () => {
    check(await page.isVisible('#loading'), 'loading screen is not showing');
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 60000 });
    check(await game(() => document.getElementById('ldFill').style.width === '100%'), 'loading bar did not fill');
  });
  await step('boots to the title screen', async () => {
    await page.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 60000 });
    check(await game(() => window.__neonbay.all('npc').length > 10), 'expected the streets to be populated');
    console.log('     three r' + await game(() => THREE.REVISION));
  });
  await step('loads a .glb building', async () => {
    const m = await game(async () => {
      const { loadModel } = await import('/js/world/models.js'), m = await loadModel('test-building.glb');
      return m && { meshes: m.group.children.length, colliders: m.colliders.length, lambert: m.group.children.every(o => o.material.isMeshLambertMaterial) };
    });
    check(m, 'the test model did not load');
    check(m.meshes === 5 && m.colliders === 1 && m.lambert, 'unexpected model: ' + JSON.stringify(m));
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
      await clearVehicles(...await game(() => [__neonbay.P.x, __neonbay.P.z]));
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
      await clearLane();
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

  await step('a downed juggernaut drops armor and ammo the player can pick up', async () => {
    for (let i = 0; i < 12; i++) {
      const done = await game(() => {
        const { P, cam, I, inv, spawnNpc } = __neonbay;
        let n = window.__jugg;
        if (!n || n.removed) {
          cam.pitch = -0.1;
          const rx = -Math.cos(cam.yaw) * 0.55, rz = Math.sin(cam.yaw) * 0.55;
          n = window.__jugg = spawnNpc('jugg', P.x + rx + Math.sin(cam.yaw) * 5, P.z + rz + Math.cos(cam.yaw) * 5);
          n.update = function () { this.place && this.place(); }; // stand still, hold fire
          n.hp = 1; P.armor = 0; inv.owned.smg = true; inv.ammo.smg = 0;
        }
        if (!n.alive) return true;
        P.yaw = cam.yaw; I.clickQ = 0.3; return false;
      });
      if (done) break;
      await until(() => __neonbay.I.clickQ === 0, undefined, 3000);
      await page.waitForTimeout(300);
    }
    const types = await game(() => __neonbay.all('pickup').filter(p => p.def && p.life).map(p => p.type).sort());
    check(types.includes('armor') && types.includes('ammo'), `expected armor and ammo drops, got ${types.join(', ') || 'none'}`);
    await game(() => { const { P, all } = __neonbay, d = all('pickup').find(p => p.type === 'armor' && p.life); if (d) { P.x = d.x; P.z = d.z; } }); // it may already be drifting in
    check(await until(() => __neonbay.P.armor >= 25), 'armor drop was not picked up');
    await game(() => { const { P, all } = __neonbay, d = all('pickup').find(p => p.type === 'ammo' && p.life); if (d) { P.x = d.x; P.z = d.z; } }); // it may already be drifting in
    check(await until(() => __neonbay.inv.ammo.smg > 0), 'ammo drop was not picked up');
    await game(() => { const { inv, G } = __neonbay; delete inv.owned.smg; delete inv.ammo.smg; G.heat = 0; G.wanted = 0; });
  });

  await step('a juggernaut fires a rocket that hurts the player', async () => {
    await clearLane();
    await game(() => {
      const { P, cam, spawnNpc } = __neonbay;
      P.hp = 100; P.armor = 0;
      const n = window.__rpg = spawnNpc('jugg', P.x + Math.sin(cam.yaw) * 20, P.z + Math.cos(cam.yaw) * 20);
      n.fireT = 0;
    });
    const hurt = await until(() => __neonbay.P.hp < 100, undefined, 30000);
    const r = await game(() => ({ hp: __neonbay.P.hp, alive: __rpg.alive, d: Math.hypot(__rpg.x - __neonbay.P.x, __rpg.z - __neonbay.P.z) }));
    check(hurt, `no rocket hit the player (hp ${r.hp}, juggernaut ${r.d.toFixed(1)} m away)`);
    check(r.alive, 'the juggernaut was caught in its own blast');
    await game(() => { const { P, G, removeEntity } = __neonbay; removeEntity(__rpg); P.hp = 100; G.heat = 0; G.wanted = 0; });
  });

  await step('a rocket throws a parked car into the air', async () => {
    await clearLane();
    await game(async () => {
      const { P, cam, spawnVehicle } = __neonbay, { fireRocket } = await import('/js/combat/combat.js');
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      const c = window.__tossed = spawnVehicle('sedan', P.x + fx * 14, P.z + fz * 14, cam.yaw + Math.PI / 2);
      window.__peak = 0; const slide = c.K.slide; c.K = Object.assign(Object.create(c.K), { slide(v, dt) { slide(v, dt); if (v === c) window.__peak = Math.max(window.__peak, v.air || 0); } });
      fireRocket(new THREE.Vector3(P.x + fx * 2, 1, P.z + fz * 2), new THREE.Vector3(fx, -0.02, fz), 420);
    });
    check(await until(() => window.__peak > 1), `the car was not thrown (peak ${await game(() => window.__peak)} m)`);
    check(await until(() => !(__tossed.air > 0)), 'the car never landed');
    await game(() => __neonbay.removeEntity(__tossed));
  });

  await step('shoots a driver through the window and takes the car', async () => {
    const before = await game(() => __neonbay.stats.kills);
    for (let i = 0; i < 16; i++) {
      await clearLane();
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

  await step('a car explosion throws the dead, and whoever it kills, through the air', async () => {
    await clearVehicles(5, -85);
    const ok = await game(() => {
      const { P, spawnVehicle, spawnNpc } = __neonbay; P.x = 5.5; P.z = -60;
      const car = window.__boom = spawnVehicle('sedan', 3, -85, 0);
      const body = window.__body = spawnNpc('civilian', 6, -85); body.kill(null, false);
      const bystander = window.__bystander = spawnNpc('civilian', 1, -84); bystander.hp = 1;
      [body, bystander].forEach(n => { n.peak = 0; const up = n.update; n.update = function (dt) { up.call(this, dt); this.peak = Math.max(this.peak, this.y || 0); }; });
      car.explode();
      return !bystander.alive;
    });
    check(ok, 'the blast did not kill the bystander');
    try {
      // the flight takes about two seconds of game time, which a slow software GPU stretches to most of a minute
      check(await until(() => __body.peak > 1 && __bystander.peak > 1, null, 60000), 'the bodies were not thrown into the air');
      check(await until(() => !__body.y && !__bystander.y, null, 60000), 'the bodies did not come back down');
    } finally {
      await game(() => { __neonbay.removeEntity(__boom); __neonbay.removeEntity(__body); __neonbay.removeEntity(__bystander); });
    }
  });

  await step('shunts a parked car down the road', async () => {
    await clearVehicles(5, -50);
    await game(() => { const { P, spawnVehicle } = __neonbay; P.x = 5.5; P.z = -60; window.__ram = spawnVehicle('sedan', 3, -60, 0); });
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), 'no prompt to get in');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__ram), 'F did not put the player behind the wheel');
    // into the back of a car parked in the lane
    await game(() => { __ram.x = 3; __ram.z = -60; __ram.yaw = 0; __ram.v = 20; window.__hit = __neonbay.spawnVehicle('sedan', 3, -45, 0); });
    const hit = await until(() => __hit.z > -42);
    // both roll to a stop with the cars apart
    const still = await until(() => !__hit.kvz && Math.abs(__ram.v) < 0.3, null, 25000);
    const r = await game(() => ({ z: __hit.z, hp: __hit.hp, max: __hit.model.hp, gap: __hit.z - __ram.z, v: __ram.v }));
    check(hit, `the parked car was not pushed (at ${r.z.toFixed(1)})`);
    check(still, `the cars never came to rest (car at ${r.z.toFixed(1)}, speed ${r.v.toFixed(1)})`);
    check(r.hp < r.max, 'the parked car took no damage');
    check(r.gap > 4, `the cars ended up inside each other (${r.gap.toFixed(1)} m apart)`);
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player out');
    await game(() => { __neonbay.removeEntity(__ram); __neonbay.removeEntity(__hit); });
  });

  await step('traffic keeps out of other cars', async () => {
    const pairs = await game(() => {
      const cars = __neonbay.all('vehicle').filter(v => v.mode === 'traffic' && v.K.slide && !v.dead), out = [];
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) if (Math.hypot(cars[i].x - cars[j].x, cars[i].z - cars[j].z) < 1.5) out.push([cars[i].x, cars[i].z].map(Math.round).join(','));
      return out;
    });
    check(!pairs.length, `traffic cars driving through each other at ${pairs.join(' ')}`);
  });

  await step('walks into the wall at the edge of the map and stops', async () => {
    await game(() => { const { P, cam } = __neonbay; P.x = -203; P.z = -25; cam.yaw = -Math.PI / 2; });
    await page.keyboard.down('KeyW');
    const reached = await until(() => __neonbay.P.x < -206.5);
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    const x = await game(() => __neonbay.P.x);
    check(reached, `player never reached the wall (x ${x})`);
    check(x > -207.6, `player went through the wall (x ${x})`);
    const off = await game(() => __neonbay.all('vehicle').filter(v => v.mode === 'traffic' && (Math.abs(v.x) > 204 || Math.abs(v.z) > 204)).length);
    check(off === 0, `${off} traffic vehicle(s) drove off the grid`);
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
    check(await until(() => !__neonbay.Sound.ready || __neonbay.Sound.intensity === 5), 'the music never reached five-star intensity');
    await page.waitForTimeout(8000);
  });

  await step('lights the streets at night', async () => {
    await game(() => __neonbay.lighting.set(1));
    check(await until(() => __neonbay.lighting.lit.lamps > 0 && __neonbay.lighting.lit.beams > 0), 'no street lamps or headlights came on');
    await game(() => __neonbay.lighting.set(null));
  });
} finally {
  await browser.close(); server.close();
}
if (errors.length) { failed++; console.log('FAIL page errors:\n  ' + errors.join('\n  ')); }
console.log(failed ? `${failed} smoke step(s) failed` : 'smoke test passed');
process.exit(failed ? 1 : 0);
