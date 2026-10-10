// Plays a short session in headless Chromium: boot, load a .glb building, walk, drive each kind of car, ride a bike, shoot someone, punch and bat someone, take a juggernaut's rocket, shoot a chopper's pilot and fly the chopper off, get shelled by the army's tank and blow it up, hold five stars into the secret sixth and take a laser rifle off an alien, snipe through the scope, throw a car with a rocket,
// shoot a driver through the window and take their car, drag a driver out, buy armor at the gun shop, ram a bike, ride a bike over a car, pull a wheelie, shunt a parked car, watch the fire brigade put out a crash fire, drift, drive up a kerb, bail out of a car and a bike at speed, walk into the edge wall, take the stairs to a roof, change settings and remap keys. Fails on any page error or broken step.
// Run with `npm run test:smoke`, which splits the steps over a few browsers at once (tests/smoke-all.mjs). This file is one of
// those browsers: `node tests/smoke.mjs` runs every step in one, in order.
// SMOKE_ONLY=tank,reload runs only the steps whose names contain one of those words (case-insensitive), after the boot;
// separate with | instead to match whole step names that have commas in them.
// SMOKE_SHARD=1/3 runs every third step, starting with the first, after the boot. SMOKE_SHOTS=<folder> saves a screenshot per step.
// Every step starts from the same place: on foot, alive, unhurt, unwanted, pistol in hand, nothing the last step spawned
// still about (see reset below), so a step that fails fails alone instead of taking the steps after it down with it.
import { mkdirSync } from 'node:fs';
import { openGame } from './lib/browser.mjs';

const shots = process.env.SMOKE_SHOTS; // optional folder for screenshots
if (shots) mkdirSync(shots, { recursive: true });
const ONLY = (process.env.SMOKE_ONLY || '').toLowerCase(), only = ONLY.split(ONLY.includes('|') ? '|' : ',').map(s => s.trim()).filter(Boolean);
const [shard, shards] = (process.env.SMOKE_SHARD || '1/1').split('/').map(Number);

const [w, h] = (process.env.SMOKE_SIZE || '960x540').split('x').map(Number);
const { page, game, until, press, close, errors } = await openGame({ play: false, viewport: { width: w, height: h } });

let failed = 0, index = 0, booted = false;
const results = [];
// boot steps always run; the rest are picked by SMOKE_ONLY and SMOKE_SHARD
async function step(name, fn) {
  const t0 = Date.now(), e0 = errors.length;
  if (booted) {
    const i = index++;
    if (only.length && !only.some(w => name.toLowerCase().includes(w))) return;
    if (!only.length && i % shards !== shard - 1) return;
    await reset();
  }
  try {
    await fn();
    if (errors.length > e0) throw new Error('page error: ' + errors.slice(e0).join(' | '));
    console.log('ok  ', name, `(${((Date.now() - t0) / 1000).toFixed(0)} s)`); results.push({ name, ok: true });
  } catch (e) { failed++; console.log('FAIL', name, `(${((Date.now() - t0) / 1000).toFixed(0)} s)`, '\n     ', e.message); results.push({ name, ok: false }); }
  if (shots) await page.screenshot({ path: `${shots}/${name.replace(/\W+/g, '-')}.png` });
}
// put the player back on their feet on an empty bit of street, with nothing left over from the step before
const HELD = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyQ', 'Space', 'ShiftLeft'];
async function reset() {
  for (const k of HELD) await page.keyboard.up(k);
  await game(async () => {
    const { G, P, I, cam, all, removeEntity } = __neonbay;
    const { exitVehicle, respawn } = await import('/js/game/player.js'), { selectWeapon } = await import('/js/combat/combat.js'), { dropChute } = await import('/js/game/parachute.js');
    for (const id of ['pause', 'settings', 'shop', 'wheel']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    // a step that failed part-way can leave the player at the wheel, and every step after it would fail to get on anything
    if (P.vehicle) { P.vehicle.v = 0; P.vx = P.vz = 0; exitVehicle(false); }
    dropChute();
    P.tumble = null; P.bailFrom = null; P.alive = true; G.state = 'play'; G.shop = null;
    // respawn clears the law, the army, the chopper, the tank and the UFO, and stands the player at the spawn point
    respawn();
    for (const k of Object.keys(window)) if (k.startsWith('__') && k !== '__neonbay') { const e = window[k]; if (e && e.kind && !e.removed) removeEntity(e); delete window[k]; }
    for (const e of all()) if (e.kind === 'vehicle' && e.mode !== 'traffic' && !e.home && Math.hypot(e.x - P.x, e.z - P.z) < 30) removeEntity(e);
    Object.assign(G, { scope: 0, rescope: 0, reloadT: 0, fireCd: 0, spawnT: 0 });
    Object.assign(P, { hp: 100, armor: 0, swing: null, reload: null, aiming: false });
    Object.assign(I, { mouseL: false, mouseR: false, clickQ: 0 });
    selectWeapon('pistol'); cam.pitch = -0.08;
  });
  await page.waitForTimeout(300);
}
const check = (cond, msg) => { if (!cond) throw new Error(msg); };
// clear parked and passing vehicles from around a spot, so F and E reach the one the step is about
// passing traffic and pedestrians can shove the player or the target, or step into the line of fire
const clearLane = () => game(() => {
  const { P, all, removeEntity } = __neonbay, near = e => Math.hypot(e.x - P.x, e.z - P.z) < 16;
  for (const v of all('vehicle')) if (v !== window.__car && near(v)) removeEntity(v);
  for (const n of all('npc')) if (n !== window.__target && n !== window.__driver && near(n)) removeEntity(n);
});
const clearVehicles = (x, z, keep) => game(([x, z, keep]) => { for (const v of __neonbay.all('vehicle')) if (!(keep && v[keep]) && Math.hypot(v.x - x, v.z - z) < 14) __neonbay.removeEntity(v); }, [x, z, keep]);

try {
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
  booted = true;

  await step('walks', async () => {
    const from = await game(() => ({ x: __neonbay.P.x, z: __neonbay.P.z }));
    await page.keyboard.down('KeyW');
    const moved = await until(f => Math.hypot(__neonbay.P.x - f.x, __neonbay.P.z - f.z) > 2, from);
    await page.keyboard.up('KeyW');
    check(moved, 'player did not move');
  });

  for (const model of ['sedan', 'modely', 'modelyblue', 'eqa', 'bmw5', 'gs']) {
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
      const from = await game(() => ({ x: __neonbay.P.vehicle.x, z: __neonbay.P.vehicle.z, spin: __neonbay.P.vehicle.mesh.wheels.map(w => w.rotation.x) }));
      await page.keyboard.down('KeyW');
      const moved = await until(f => Math.hypot(__neonbay.P.vehicle.x - f.x, __neonbay.P.vehicle.z - f.z) > 3, from);
      await page.keyboard.up('KeyW');
      check(moved, 'vehicle did not move');
      const spun = await game(f => __neonbay.P.vehicle.mesh.wheels.filter((w, i) => w.rotation.x !== f.spin[i]).length, from);
      check(spun === from.spin.length, `only ${spun} of ${from.spin.length} wheels turned`);
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

  await step('punches a civilian, then takes them down with a bat', async () => {
    await clearLane();
    const before = await game(async () => {
      const { P, cam, inv, spawnNpc } = __neonbay, { selectWeapon } = await import('/js/combat/combat.js');
      selectWeapon('fist'); cam.pitch = -0.05; P.yaw = cam.yaw;
      const n = window.__target = spawnNpc('civilian', P.x + Math.sin(P.yaw) * 1.1, P.z + Math.cos(P.yaw) * 1.1);
      n.update = function () { this.place(); }; // stand still
      n.def = { ...n.def, fightBack: 0 }; n.hp = 1000;
      return { kills: __neonbay.stats.kills, heat: __neonbay.G.heat, wanted: __neonbay.G.wanted, owned: inv.owned.fist };
    });
    check(before.owned, 'the player has no fists');
    const punch = async () => { await game(() => { __neonbay.P.yaw = __neonbay.cam.yaw; __neonbay.I.clickQ = 0.3; }); await until(() => !__neonbay.P.swing && __neonbay.I.clickQ === 0, undefined, 4000); };
    await punch();
    const hit = await game(() => ({ hp: window.__target.hp, heat: __neonbay.G.heat, cur: __neonbay.inv.cur }));
    check(hit.cur === 'fist', 'fists are not in hand');
    check(hit.hp < 1000, 'the punch did not land');
    check(hit.heat > before.heat, 'hitting someone added no heat');
    await game(async () => { const { inv } = __neonbay, { selectWeapon } = await import('/js/combat/combat.js'); inv.owned.bat = true; selectWeapon('bat'); window.__target.hp = 20; });
    for (let i = 0; i < 6 && await game(() => window.__target.alive); i++) await punch();
    const r = await game(() => ({ alive: window.__target.alive, kills: __neonbay.stats.kills, gun: !!__neonbay.P.c.gun }));
    check(r.gun, 'the bat is not in the player\'s hand');
    check(!r.alive && r.kills === before.kills + 1, 'the bat did not take the civilian down');
    // back to the pistol, at the heat the step started with, so the next steps meet the same squad
    await game(async ({ heat, wanted }) => { const { G } = __neonbay, { selectWeapon } = await import('/js/combat/combat.js'); selectWeapon('pistol'); G.heat = heat; G.wanted = wanted; }, before);
  });

  await step('holding Q opens the weapon wheel, the mouse picks a weapon and a tap still goes to melee', async () => {
    await game(() => { const { inv } = __neonbay; inv.owned.rifle = true; inv.owned.bat = true; inv.owned.katana = true; });
    const point = (x, y) => game(async ([x, y]) => (await import('/js/ui/wheel.js')).wheelMove(x, y), [x, y]);
    await page.keyboard.down('KeyQ');
    check(await game(() => !document.getElementById('wheel').hidden), 'the wheel did not open');
    // the rifle is the fifth slice of ten, pointing down and to the right
    await point(240 * 0.6 * Math.sin(Math.PI * 0.8), -240 * 0.6 * Math.cos(Math.PI * 0.8));
    await page.keyboard.up('KeyQ');
    const r = await game(() => ({ cur: __neonbay.inv.cur, shut: document.getElementById('wheel').hidden }));
    check(r.shut, 'the wheel stayed open after letting go of Q');
    check(r.cur === 'rifle', `pointing at the rifle gave ${r.cur}`);
    // straight up onto the melee slice, then out into its ring to the katana
    await page.keyboard.down('KeyQ');
    await point(0, -120);
    await game(async () => {
      const { ringOf, RING_ARC } = await import('/js/game/wheel.js'), { wheelMove } = await import('/js/ui/wheel.js');
      const g = ringOf(0, __neonbay.inv.owned), a = g.start + (g.items.indexOf('katana') + 0.5) * RING_ARC;
      wheelMove(240 * 0.95 * Math.sin(a), -240 * 0.95 * Math.cos(a) + 120);
    });
    await page.keyboard.up('KeyQ');
    check(await game(() => __neonbay.inv.cur) === 'katana', 'the melee ring did not give the katana');
    await game(async () => (await import('/js/combat/combat.js')).selectWeapon('pistol'));
    await press('KeyQ', 40);
    check(await game(() => __neonbay.inv.cur) === 'katana', 'a tap on Q did not go back to the melee weapon used last');
    await game(async () => (await import('/js/combat/combat.js')).selectWeapon('pistol'));
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
    // down an open stretch of road, so nothing stands between them
    await clearVehicles(5, -50);
    await game(() => {
      const { P, all, removeEntity, spawnNpc } = __neonbay;
      P.x = 5.5; P.z = -60; P.hp = 100; P.armor = 0;
      for (const n of all('npc')) if (Math.hypot(n.x - 5.5, n.z + 50) < 20) removeEntity(n);
      const n = window.__rpg = spawnNpc('jugg', 5.5, -40);
      // a dead-on aim: a missed rocket flies past, and the next one is too far off at software-rendering speed
      n.fireT = 0; n.def = { ...n.def, acc: 2 };
    });
    const hurt = await until(() => __neonbay.P.hp < 100, undefined, 30000);
    const r = await game(() => ({ hp: __neonbay.P.hp, alive: __rpg.alive, d: Math.hypot(__rpg.x - __neonbay.P.x, __rpg.z - __neonbay.P.z) }));
    check(hurt, `no rocket hit the player (hp ${r.hp}, juggernaut ${r.d.toFixed(1)} m away)`);
    check(r.alive, 'the juggernaut was caught in its own blast');
    await game(() => { const { P, G, removeEntity } = __neonbay; removeEntity(__rpg); P.hp = 100; G.heat = 0; G.wanted = 0; });
  });

  await step('scopes in with the sniper rifle and drops someone down the road', async () => {
    // down the same open stretch of road, 30 m off, through the 9x scope
    await clearVehicles(5, -45);
    const r0 = await game(async () => {
      const { P, G, cam, inv, all, removeEntity, spawnNpc } = __neonbay, { selectWeapon } = await import('/js/combat/combat.js'), { toggleScope } = await import('/js/combat/scope.js');
      P.x = 5.5; P.z = -60; P.yaw = cam.yaw = 0; cam.pitch = -0.012; P.hp = 100;
      for (const n of all('npc')) if (Math.hypot(n.x - 5.5, n.z + 45) < 22) removeEntity(n);
      inv.owned.sniper = true; inv.lvl.sniper = 0; inv.mag.sniper = 10; inv.ammo.sniper = 20; selectWeapon('sniper');
      const n = window.__mark = spawnNpc('civilian', P.x - 0.55, P.z + 30); n.update = function () { this.place && this.place(); };
      toggleScope(); toggleScope();
      return { scope: G.scope };
    });
    check(r0.scope === 2, 'right click did not step to the second zoom');
    check(await until(() => !document.getElementById('scope').hidden && __neonbay.P.c.root.visible === false), 'the scope overlay did not show');
    if (shots) await page.screenshot({ path: `${shots}/sniper-scope.png` });
    await game(() => { __neonbay.I.clickQ = 0.3; });
    check(await until(() => !__mark.alive, undefined, 8000), `the target was not taken down (hp ${await game(() => __mark.hp)})`);
    check(await game(() => __neonbay.G.scope === 0 && __neonbay.G.rescope === 2), 'the scope did not drop out for the bolt');
    check(await until(() => __neonbay.G.scope === 2, undefined, 40000), 'the scope did not come back after the bolt: ' + JSON.stringify(await game(() => { const { G, P, inv } = __neonbay; return { st: G.state, sc: G.scope, re: G.rescope, cd: G.fireCd, rl: G.reloadT, cur: inv.cur, alive: P.alive, veh: !!P.vehicle }; })));
    await game(async () => {
      const { G, inv, removeEntity } = __neonbay, { selectWeapon } = await import('/js/combat/combat.js');
      selectWeapon('pistol'); removeEntity(__mark); delete inv.owned.sniper; delete inv.ammo.sniper; G.heat = 0; G.wanted = 0;
    });
    check(await until(() => document.getElementById('scope').hidden && __neonbay.P.c.root.visible), 'switching guns did not leave the scope');
  });

  await step('a rocket throws a parked car into the air', async () => {
    // down the same open stretch of road
    await clearVehicles(5, -50);
    await game(async () => {
      const { P, cam, spawnVehicle } = __neonbay, { fireRocket } = await import('/js/combat/combat.js');
      P.x = 5.5; P.z = -60; cam.yaw = 0;
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      const c = window.__tossed = spawnVehicle('sedan', P.x + fx * 14, P.z + fz * 14, cam.yaw + Math.PI / 2);
      window.__from = { x: c.x, z: c.z };
      fireRocket(new THREE.Vector3(P.x + fx * 2, 1, P.z + fz * 2), new THREE.Vector3(fx, -0.02, fz), 420);
    });
    const thrown = await until(() => __tossed.air > 0 || Math.hypot(__tossed.x - __from.x, __tossed.z - __from.z) > 1.5);
    check(thrown, `the car was not thrown (hp ${await game(() => __tossed.hp)}, moved ${await game(() => Math.hypot(__tossed.x - __from.x, __tossed.z - __from.z).toFixed(2))} m)`);
    check(await until(() => !(__tossed.air > 0)), 'the car never landed');
    // blowing up a car is a crime: drop the heat so the police don't crowd the steps that follow
    await game(() => { const { G, all, removeEntity } = __neonbay; removeEntity(__tossed); G.heat = 0; G.wanted = 0; for (const n of all('npc')) if (n.faction === 'law') removeEntity(n); });
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

  await step('shoves a rider off a stopped bike', async () => {
    await game(() => {
      const { G, P, all, removeEntity, spawnVehicle, spawnNpc } = __neonbay; G.heat = 0; G.wanted = 0;
      for (const v of all('vehicle')) if (Math.hypot(v.x - P.x, v.z - P.z) < 14) removeEntity(v);
      const b = window.__jack = spawnVehicle('gs', P.x + Math.cos(P.yaw) * 1.6, P.z - Math.sin(P.yaw) * 1.6, P.yaw);
      b.seatDriver(window.__jacked = spawnNpc('biker', b.x, b.z));
    });
    check(await until(() => /shove the rider off/.test((__neonbay.G.near[0] || {}).prompt)), 'no prompt to shove the rider off');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__jack), 'F did not take the bike');
    const r = await game(() => ({ out: !__jacked.vehicle && __jacked.alive, down: __jacked.downT > 0, heat: __neonbay.G.heat, upright: !__jack.fallen }));
    check(r.out, 'the rider is still on the bike');
    check(r.down, 'the rider did not go down');
    check(r.upright, 'the bike is lying on its side under the player');
    check(r.heat > 0, 'jacking a bike added no heat');
    await game(() => { __jacked.downT = Math.min(__jacked.downT, 0.3); }); // software WebGL is a few frames a second: cut the lie-down short
    check(await until(() => !__jacked.downT && __jacked.alive && __jacked.state === 'flee'), 'the rider did not get up and run');
    await until(() => __neonbay.G.near.some(i => i.priority === 9));
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player off');
    await game(() => { // and call off the police the jacking brought
      const { G, all, removeEntity } = __neonbay; removeEntity(__jack); removeEntity(__jacked); G.heat = 0; G.wanted = 0;
      for (const e of all()) if ((e.kind === 'npc' && e.def.faction === 'law') || (e.kind === 'vehicle' && (e.model.police || e.model.army))) removeEntity(e);
    });
  });

  await step('a bat on a car scares the driver out, and on a bike throws the rider off', async () => {
    const swing = async () => { await game(() => { __neonbay.P.yaw = __neonbay.cam.yaw; __neonbay.I.clickQ = 0.3; }); await until(() => !__neonbay.P.swing && __neonbay.I.clickQ === 0, undefined, 4000); };
    for (const [model, type, ahead] of [['sedan', 'motorist', 2.1], ['gs', 'biker', 1.2]]) {
      await game(async ({ model, type, ahead }) => {
        const { G, P, cam, inv, all, removeEntity, spawnVehicle, spawnNpc } = __neonbay, { selectWeapon } = await import('/js/combat/combat.js');
        G.heat = 0; G.wanted = 0; inv.owned.bat = true; selectWeapon('bat'); cam.pitch = -0.05; P.yaw = cam.yaw;
        for (const e of all()) if ((e.kind === 'vehicle' || (e.kind === 'npc' && e !== P)) && Math.hypot(e.x - P.x, e.z - P.z) < 14) removeEntity(e);
        // side on, just ahead of the player
        const v = window.__scared = spawnVehicle(model, P.x + Math.sin(P.yaw) * ahead, P.z + Math.cos(P.yaw) * ahead, P.yaw + Math.PI / 2);
        v.seatDriver(window.__scaredDriver = spawnNpc(type, v.x, v.z));
      }, { model, type, ahead });
      for (let i = 0; i < 3 && await game(() => !!__scared.driver); i++) await swing();
      const r = await game(() => ({ out: !__scared.driver && !__scaredDriver.vehicle && __scaredDriver.alive, flee: __scaredDriver.state === 'flee', down: __scaredDriver.downT > 0, fallen: !!__scared.fallen, heat: __neonbay.G.heat }));
      check(r.out, `the ${type} is still in the ${model}`);
      check(r.flee, `the ${type} did not run`);
      check(r.heat > 0, `hitting the ${type}'s vehicle added no heat`);
      if (model === 'gs') { check(r.down, 'the rider was not knocked down'); check(r.fallen, 'the bike did not fall over'); }
      await game(() => { const { removeEntity } = __neonbay; removeEntity(__scared); removeEntity(__scaredDriver); });
    }
    await game(async () => { const { G } = __neonbay, { selectWeapon } = await import('/js/combat/combat.js'); selectWeapon('pistol'); G.heat = 0; G.wanted = 0; });
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
    await game(() => {
      const { P, all, removeEntity, spawnVehicle } = __neonbay; P.x = 5.5; P.z = -60; window.__ram = spawnVehicle('sedan', 3, -60, 0);
      for (const n of all('npc')) if (Math.hypot(n.x - P.x, n.z - P.z) < 16) removeEntity(n); // a passer-by bumping the player pushes them out of the door's reach
    });
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

  await step('rides a bike up and over a parked car, and crashes into one going fast', async () => {
    await until(() => !__neonbay.P.tumble); // still rolling from bailing out of the last car
    await clearVehicles(5, -50);
    await game(() => { const { P, spawnVehicle } = __neonbay; P.x = 4.5; P.z = -60; window.__ram = spawnVehicle('gs', 3, -60, 0); });
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), 'no prompt to get on');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__ram), 'F did not put the player on the bike');
    // gently into the back of a car parked in the lane: up the boot, over the roof and down the bonnet
    await game(() => { __ram.x = 3; __ram.z = -60; __ram.yaw = 0; __ram.v = 9; __ram.peak = 0; window.__hit = __neonbay.spawnVehicle('sedan', 3, -50, 0); });
    const watch = () => { __ram.peak = Math.max(__ram.peak, __ram.lift || 0); return __ram.z > -45; };
    // a few seconds of game time, which a slow software GPU stretches out a long way
    const over = await until(watch, null, 60000);
    const r = await game(() => ({ z: __ram.z, peak: __ram.peak, on: __neonbay.P.vehicle === __ram, car: __hit.z }));
    check(over, `the bike did not get past the car (at ${r.z.toFixed(1)})`);
    check(r.peak > 1, `the bike went through the car instead of over it (rose ${r.peak.toFixed(2)} m)`);
    check(r.on, 'the rider came off');
    check(Math.abs(r.car + 50) < 0.5, `the car was pushed out of the way (to ${r.car.toFixed(1)})`);
    check(await until(() => !__ram.over && !__ram.lift, null, 30000), 'the bike did not come back down onto the road');
    // and much faster into it from the far side: the usual crash, stopped against it
    await game(() => { __ram.x = 3; __ram.z = -38; __ram.yaw = Math.PI; __ram.v = 24; __ram.peak = 0; });
    await until(() => { __ram.peak = Math.max(__ram.peak, __ram.lift || 0); return __ram.v < 5; }, null, 30000);
    const c = await game(() => ({ z: __ram.z, peak: __ram.peak, over: !!__ram.over }));
    check(!c.over && c.peak < 0.3 && c.z > -48.2, `the bike rode over the car at speed (at ${c.z.toFixed(1)}, rose ${c.peak.toFixed(2)} m)`);
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player off');
    await game(() => { __neonbay.removeEntity(__ram); __neonbay.removeEntity(__hit); });
  });

  await step('pulls a wheelie on a bike, sets it down, and loops one over on the boost', async () => {
    await until(() => !__neonbay.P.tumble);
    await clearVehicles(4, -60); await clearVehicles(4, -40); await clearVehicles(4, -20);
    await game(() => { const { P, spawnVehicle } = __neonbay; P.x = 4.5; P.z = -70; window.__ram = spawnVehicle('t7', 3, -70, 0); });
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), 'no prompt to get on');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__ram), 'F did not put the player on the bike');
    // the speedo shows up on the next HUD update
    const shown = await until(() => !document.getElementById('speedo').hidden && !document.getElementById('vehWheelie').hidden);
    if (!shown) { await press('KeyF'); await game(() => __neonbay.removeEntity(__ram)); }
    check(shown, 'the speedo does not show the wheelie key');
    await game(() => { __ram.x = 3; __ram.z = -70; __ram.yaw = 0; __ram.v = 12; __ram.peak = 0; });
    await page.keyboard.down('KeyW'); await page.keyboard.down('KeyC');
    const up = await until(() => { __ram.peak = Math.max(__ram.peak, __ram.pop); return __ram.pop > 0.45; }, null, 30000);
    const r = await game(() => ({ peak: __ram.peak, on: __neonbay.P.vehicle === __ram, y: __ram.mesh.grp.rotation.x }));
    check(up, `the front did not come up (peak ${r.peak.toFixed(2)} rad)`);
    check(r.on && r.y < -0.4, `the bike did not tip back with the rider on (pitch ${r.y.toFixed(2)})`);
    await page.keyboard.up('KeyC');
    check(await until(() => !__ram.pop, null, 30000), 'the front did not come back down');
    // boost while up: it climbs past the balance point and goes over backwards
    await game(() => { __ram.x = 3; __ram.z = -70; __ram.yaw = 0; __ram.v = 12; });
    await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyC');
    const looped = await until(() => !__neonbay.P.vehicle, null, 40000);
    for (const k of ['KeyC', 'ShiftLeft', 'KeyW']) await page.keyboard.up(k);
    check(looped, 'boosting the wheelie never looped it over');
    check(await game(() => __ram.fallen), 'the looped bike is still upright');
    await until(() => !__neonbay.P.tumble, null, 30000);
    await game(() => __neonbay.removeEntity(__ram));
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

  await step('a crash fire brings the fire truck, its crew put it out, and a downed fireman drops his axe', async () => {
    await clearVehicles(-3, -25); await clearVehicles(-3, -50);
    // a car skids into the back of one parked in the lane and sets it alight
    await game(() => {
      const { G, P, spawnVehicle } = __neonbay; G.heat = 0; G.wanted = 0; P.x = 9; P.z = -45; P.hp = 100;
      const hit = window.__hit = spawnVehicle('sedan', -3, -25, 0); hit.hp = 1;
      const ram = window.__ram = spawnVehicle('modely', -3, -30.2, 0); Object.assign(ram, { kvx: 0, kvz: 22, kspin: 0 });
    });
    check(await until(() => __hit.crashFire && __hit.burnT > 30), 'the crash did not start a long fire');
    const truck = await game(() => { const t = window.__truck = __neonbay.all('firetruck')[0]; return t && { siren: t.siren, d: Math.hypot(t.x - __hit.x, t.z - __hit.z) }; });
    check(truck, 'no fire truck was sent');
    check(truck.siren, 'the truck came without its siren');
    check(truck.d > 40, `the truck turned up right on top of the fire (${truck.d.toFixed(0)} m)`);
    // software WebGL is slow: put it on the road just down from the fire and let it drive the last of the way
    await game(() => Object.assign(__truck, { ax: 0, az: -60, ox: -3, oz: 0, dirX: 0, dirZ: 1, toX: 0, toZ: -50, yaw: 0, v: 8 }));
    check(await until(() => __truck.state === 'work', null, 60000), `the truck never pulled up (${await game(() => `${__truck.state} at ${__truck.x.toFixed(1)}, ${__truck.z.toFixed(1)}`)})`);
    check(await until(() => __neonbay.all('npc').some(n => n.type === 'fireman' && n.c.gunId === 'nozzle'), null, 60000), 'nobody got the hose on the fire');
    check(await until(() => !(__hit.burnT > 0), null, 90000), `the fire was not put out (${await game(() => __hit.burnT.toFixed(1))} s left)`);
    check(await game(() => !__hit.dead), 'the car blew up anyway');
    const axe = await game(() => {
      const f = __neonbay.all('npc').find(n => n.type === 'fireman' && n.alive); if (!f) return 'no fireman left';
      f.hurt(999, new THREE.Vector3(0, 0, 1), true);
      return __neonbay.all('pickup').some(p => p.id === 'fireaxe' && Math.hypot(p.x - f.x, p.z - f.z) < 2) || 'no axe on the street';
    });
    check(axe === true, axe);
    await game(() => { for (const e of [__truck, __hit, __ram, ...__neonbay.all('pickup').filter(p => p.id === 'fireaxe')]) __neonbay.removeEntity(e); });
  });

  await step('drifts a car round with the handbrake', async () => {
    // on the open beach, where a slide has room to run
    await clearVehicles(228, -60);
    await game(() => { const { P, spawnVehicle } = __neonbay; P.x = 230.5; P.z = -60; window.__ram = spawnVehicle('sedan', 228, -60, 0); });
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), 'no prompt to get in');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__ram), 'F did not put the player behind the wheel');
    await game(() => { __ram.x = 228; __ram.z = -60; __ram.yaw = 0; __ram.v = 22; __ram.peakSkid = 0; const up = __ram.update; __ram.update = function (dt) { up.call(this, dt); this.peakSkid = Math.max(this.peakSkid, this.skid || 0); this.drifted ||= this.drifting; }; });
    for (const k of ['KeyW', 'KeyA', 'Space']) await page.keyboard.down(k);
    const drifting = await until(() => __ram.drifted);
    await page.keyboard.up('Space');
    const skidding = await until(() => __ram.peakSkid > 0, null, 3000);
    for (const k of ['KeyW', 'KeyA']) await page.keyboard.up(k);
    const r = await game(() => ({ slip: __ram.slip, v: __ram.v, x: __ram.x, z: __ram.z }));
    check(drifting, `the handbrake turn did not start a drift (slip ${r.slip.toFixed(1)}, speed ${r.v.toFixed(1)})`);
    check(skidding, 'the drift left no skid');
    await page.keyboard.down('KeyS');
    await until(() => Math.abs(__ram.v) < 3);
    await page.keyboard.up('KeyS');
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player out');
    await game(() => __neonbay.removeEntity(__ram));
  });

  for (const model of ['sedan', 't7']) await step(`bails out of a ${model} at speed, sideways and clear of it`, async () => {
    // on the open beach, heading up it at top speed
    await clearVehicles(228, -60);
    await game(m => { const { P, spawnVehicle } = __neonbay; P.x = 230.5; P.z = -60; window.__ram = spawnVehicle(m, 228, -60, 0); }, model);
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), 'no prompt to get on');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__ram), 'F did not put the player on board');
    await until(() => __neonbay.G.near.some(i => i.priority === 9));
    await game(() => {
      const { P } = __neonbay; P.hp = 100; P.armor = 0; __ram.x = 228; __ram.z = -60; __ram.yaw = 0; __ram.v = 32; P.vx = 0; P.vz = 32;
      // how close the body comes to the player while they roll away
      window.__gap = Infinity; const up = __ram.update;
      __ram.update = function (dt) { up.call(this, dt); if (P.tumble) __gap = Math.min(__gap, this.K.reach ? Math.max(0, Math.hypot(this.x - P.x, this.z - P.z) - 1) : 9); };
    });
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player off');
    const mid = await game(() => ({ tumbling: !!__neonbay.P.tumble, hp: __neonbay.P.hp }));
    check(mid.tumbling, 'the player was not thrown out');
    check(await until(() => !__neonbay.P.tumble), 'the player never got back up');
    const r = await game(() => { const { P } = __neonbay; return { hp: P.hp, alive: P.alive, x: P.x, z: P.z, cz: __ram.z, gap: __gap, reach: __ram.K.reach(__ram, P) }; });
    check(r.alive && r.hp < 100 && r.hp >= 88, `bailing at speed should only sting (hp ${r.hp.toFixed(1)})`);
    check(r.x > 229.5, `not thrown out sideways (x ${r.x.toFixed(2)})`);
    check(r.gap > 0.2, `the ${model} ran into the player on the way out (gap ${r.gap.toFixed(2)})`);
    check(r.cz > r.z, `the ${model} did not roll on past the player`);
    await game(() => __neonbay.removeEntity(__ram));
  });

  await step('drives up onto the sidewalk instead of through it', async () => {
    await clearVehicles(5, -75);
    await game(() => { const { P, spawnVehicle } = __neonbay; P.x = 2; P.z = -73.5; window.__ram = spawnVehicle('sedan', 2, -75, Math.PI / 2); });
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), 'no prompt to get in');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__ram), 'F did not put the player behind the wheel');
    // across the lane towards the block at x 6 to 44, kerb first
    await game(() => { __ram.x = 2; __ram.z = -75; __ram.yaw = Math.PI / 2; __ram.v = 6; });
    await page.keyboard.down('KeyW');
    const up = await until(() => __ram.x > 10);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');
    await until(() => Math.abs(__ram.v) < 1);
    await page.keyboard.up('KeyS');
    const y = await game(() => __ram.mesh.grp.position.y);
    check(up, `the car did not get onto the sidewalk (x ${(await game(() => __ram.x)).toFixed(1)})`);
    check(y > 0.12, `the car sank into the sidewalk (body at y ${y.toFixed(2)})`);
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player out');
    await game(() => __neonbay.removeEntity(__ram));
  });

  await step('rams burnt-out wrecks out of the way', async () => {
    await clearVehicles(5, -50);
    await game(() => { const { P, spawnVehicle } = __neonbay; P.x = 5.5; P.z = -60; window.__ram = spawnVehicle('sedan', 3, -60, 0); });
    check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), 'no prompt to get in');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__ram), 'F did not put the player behind the wheel');
    // a wrecked car and, further on, a wrecked bike across the lane (the wrecks keep their hp so the player takes no blast)
    await game(() => {
      const { spawnVehicle } = __neonbay, wreck = v => { v.dead = true; v.K.wreck(v); return v; };
      window.__wcar = wreck(spawnVehicle('sedan', 3, -47, 0)); window.__wbike = wreck(spawnVehicle('gs', 3, -32, Math.PI / 2));
      __ram.x = 3; __ram.z = -60; __ram.yaw = 0; __ram.v = 20;
    });
    const car = await until(() => __wcar.z > -44);
    await game(() => { __ram.x = 3; __ram.z = -46; __ram.yaw = 0; __ram.v = 20; __wcar.x = 12; __wcar.kvx = __wcar.kvz = __wcar.kspin = 0; });
    const bike = await until(() => __wbike.z > -29);
    const r = await game(() => ({ cz: __wcar.z, bz: __wbike.z }));
    check(car, `the wrecked car was not pushed (at ${r.cz.toFixed(1)})`);
    check(bike, `the wrecked bike was not knocked (at ${r.bz.toFixed(1)})`);
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'F did not get the player out');
    await game(() => { __neonbay.removeEntity(__ram); __neonbay.removeEntity(__wcar); __neonbay.removeEntity(__wbike); });
  });

  await step('an explosion throws wrecks around', async () => {
    await clearVehicles(5, -85);
    await game(() => {
      const { P, spawnVehicle } = __neonbay; P.x = 5.5; P.z = -55;
      const wreck = v => { v.dead = true; v.K.wreck(v); v.peak = 0; const up = v.update; v.update = function (dt) { up.call(this, dt); this.peak = Math.max(this.peak, this.air || 0); }; return v; };
      window.__wcar = wreck(spawnVehicle('sedan', 3, -80, 0)); window.__wbike = wreck(spawnVehicle('gs', 3, -90, Math.PI / 2));
      window.__boom = spawnVehicle('sedan', 3, -85.5, Math.PI / 2); window.__start = [__wcar.z, __wbike.z];
      __boom.explode();
    });
    try {
      check(await until(() => __wcar.peak > 0.3 && __wbike.peak > 0.3, null, 60000), 'the wrecks were not thrown into the air');
      check(await until(() => !__wcar.air && !__wbike.air && !__wcar.kvz && !__wbike.kvz, null, 60000), 'the wrecks did not come back down and stop');
      const r = await game(() => ({ c: __wcar.z - __start[0], b: __start[1] - __wbike.z }));
      check(r.c > 1 && r.b > 1, `the wrecks were not thrown away from the blast (car ${r.c.toFixed(1)} m, bike ${r.b.toFixed(1)} m)`);
    } finally {
      await game(() => { __neonbay.removeEntity(__boom); __neonbay.removeEntity(__wcar); __neonbay.removeEntity(__wbike); });
    }
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

  await step('takes the stairs up to a roof, stays inside the railings and comes back down', async () => {
    const n = await game(() => __neonbay.ROOFS.length);
    check(n >= 6, `only ${n} rooftop door(s) in the city`);
    await game(() => { const { P, cam, ROOFS } = __neonbay, r = ROOFS[0]; P.x = r.street.x; P.z = r.street.z; cam.yaw = r.yaw + Math.PI; });
    await clearLane();
    check(await until(() => __neonbay.G.near.some(i => /roof/.test(i.prompt))), 'no prompt at the street door'); // the prompt element keeps stale text, so ask the game
    await press('KeyE');
    check(await until(() => { const { P, ROOFS } = __neonbay; return P.roof === ROOFS[0] && Math.abs(P.y - ROOFS[0].floor) < 0.01; }), 'did not get up onto the roof');
    // run straight at the railing: the player stops at it instead of walking off
    await game(() => { const { cam, ROOFS } = __neonbay; cam.yaw = ROOFS[0].yaw; });
    await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
    const on = await game(() => { const { P, ROOFS } = __neonbay, w = ROOFS[0].walk; return P.roof === ROOFS[0] && P.x > w.x0 && P.x < w.x1 && P.z > w.z0 && P.z < w.z1 && P.y >= ROOFS[0].floor - 0.01; });
    check(on, 'walked off the roof');
    await game(() => { const { P, cam, ROOFS } = __neonbay, r = ROOFS[0]; P.x = r.hutOut.x; P.z = r.hutOut.z; cam.yaw = r.yaw + Math.PI; });
    check(await until(() => __neonbay.G.near.some(i => /down/.test(i.prompt))), 'no prompt at the roof door');
    await press('KeyE');
    const down = await until(() => !__neonbay.P.roof);
    const at = await game(() => { const { P, G, ROOFS } = __neonbay; return { y: P.y, d: Math.hypot(P.x - ROOFS[0].street.x, P.z - ROOFS[0].street.z), near: G.near.map(i => i.prompt), roof: !!P.roof }; });
    check(down && at.y === 0 && at.d < 1.5, 'did not come back down to the street: ' + JSON.stringify(at));
  });

  await step('changes settings from the pause menu', async () => {
    await press('KeyP');
    check(await until(() => __neonbay.G.state === 'paused'), 'P did not pause');
    check(await game(() => __neonbay.Sound.dimmed), 'the sound did not dim in the pause menu');
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
    check(!(await game(() => __neonbay.Sound.dimmed)), 'the sound stayed dimmed after resuming');
  });

  await step('switches to AZERTY and rebinds a key', async () => {
    await press('KeyP');
    check(await until(() => __neonbay.G.state === 'paused'), 'P did not pause');
    await page.click('#pauseSettingsBtn'); await page.click('#setTabs [data-tab="controls"]');
    await page.click('#setBody [data-set="layout"][data-val="azerty"]');
    check(await page.textContent('#setBody [data-bind="forward"]') === 'Z' && await page.textContent('#setBody [data-bind="melee"]') === 'A', 'the AZERTY preset does not show Z and A');
    check(await page.textContent('#hint [data-kb="radio"]') === 'M' && await page.textContent('.controls [data-kb="move"]') === 'ZQSD', 'the on-screen hints did not follow the preset');
    await page.click('#setBody [data-bind="pause"]');
    await page.keyboard.press('KeyO');
    check(await page.textContent('#setBody [data-bind="pause"]') === 'O', 'pause was not rebound to O');
    check(await page.isVisible('#settings'), 'the key press left the Settings screen');
    await page.click('#setBack'); await page.click('#resumeBtn');
    check(await until(() => __neonbay.G.state === 'play'), 'did not resume');
    await press('KeyP'); await page.waitForTimeout(300);
    check(await game(() => __neonbay.G.state === 'play'), 'P still pauses after moving pause to O');
    await press('KeyO');
    check(await until(() => __neonbay.G.state === 'paused'), 'O did not pause');
    await page.click('#pauseSettingsBtn'); await page.click('#setTabs [data-tab="controls"]');
    await page.click('#setBody [data-set="layout"][data-val="qwerty"]');
    check(await page.textContent('#setBody [data-bind="forward"]') === 'W' && await page.textContent('#setBody [data-bind="pause"]') === 'P', 'QWERTY did not restore the keys');
    await page.click('#setBack'); await page.click('#resumeBtn');
    check(await until(() => __neonbay.G.state === 'play'), 'did not resume');
  });

  await step('plays a siren from each police car', async () => {
    check(await game(() => __neonbay.Sound.ready), 'audio did not start');
    await game(() => {
      const { G, P, spawnVehicle } = __neonbay; G.heat = 30; G.wanted = 2; G.spawnT = 99;
      window.__cops = [spawnVehicle('police', P.x + 18, P.z, 0), spawnVehicle('police', P.x - 18, P.z + 6, 0)];
    });
    check(await until(() => __neonbay.Sound.voices().siren === 2), 'expected two sirens: ' + JSON.stringify(await game(() => __neonbay.Sound.voices())));
    await game(() => { const { G, removeEntity } = __neonbay; for (const c of __cops) removeEntity(c); G.heat = 0; G.wanted = 0; });
    check(await until(() => __neonbay.Sound.voices().siren === 0), 'the sirens kept going after the cars left');
  });

  await step('drives a fire truck and a police car with the siren switched on and off', async () => {
    await clearVehicles(228, -60);
    for (const id of ['firetruck', 'police']) {
      await game(id => { const { G, P, spawnVehicle } = __neonbay; G.heat = 0; G.wanted = 0; P.x = 230.6; P.z = -60; window.__ram = spawnVehicle(id, 228, -60, 0); }, id);
      check(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ram.model.name)), `no prompt to get in the ${id}`);
      await press('KeyF');
      check(await until(() => __neonbay.P.vehicle === window.__ram), `F did not put the player in the ${id}`);
      check(await until(() => __neonbay.Sound.voices().siren === 0 && !__ram.mesh.lr.visible && !__ram.mesh.lb.visible, null, 3000), `the ${id} came with its siren on`);
      await press('KeyH');
      check(await until(() => __ram.siren && __neonbay.Sound.voices().siren === 1), `H did not switch the ${id}'s siren on`);
      check(await until(() => __ram.mesh.lr.visible || __ram.mesh.lb.visible), `the ${id}'s lights did not flash`);
      await page.keyboard.down('KeyW'); const drove = await until(() => __ram.z > -57, null, 10000); await page.keyboard.up('KeyW');
      check(drove, `the ${id} did not drive (${await game(() => __ram.z.toFixed(1))})`);
      await press('KeyH');
      check(await until(() => !__ram.siren && __neonbay.Sound.voices().siren === 0), `H did not switch the ${id}'s siren off`);
      await press('KeyF');
      check(await until(() => !__neonbay.P.vehicle), 'F did not get the player out');
      await game(() => __neonbay.removeEntity(__ram));
    }
  });

  await step('an electric car in traffic hums instead of revving', async () => {
    await game(() => {
      const { P, spawnVehicle, spawnNpc } = __neonbay;
      const c = window.__ev = spawnVehicle('eqa', P.x + 6, P.z, 0, 'traffic'); c.seatDriver(spawnNpc('motorist', c.x, c.z));
    });
    check(await until(() => __neonbay.Sound.voices().ev === 1), 'the EQA makes no sound: ' + JSON.stringify(await game(() => __neonbay.Sound.voices())));
    await game(() => { const c = __ev; if (c.driver) __neonbay.removeEntity(c.driver); __neonbay.removeEntity(c); });
    check(await until(() => __neonbay.Sound.voices().ev === 0), 'the EQA hum kept going after it left');
  });

  await step('a petrol car in traffic runs a four and the fire truck a diesel', async () => {
    await clearLane();
    await game(() => {
      const { P, spawnVehicle, spawnNpc } = __neonbay;
      window.__cars = ['sedan', 'firetruck'].map((id, i) => { const c = spawnVehicle(id, P.x + 5, P.z + (i ? 7 : -7), 0, 'traffic'); c.v = 0; c.seatDriver(spawnNpc('motorist', c.x, c.z)); return c; });
    });
    check(await until(() => __cars.every(c => __neonbay.Sound.playing('engine').includes(c))), 'the cars make no engine sound: ' + JSON.stringify(await game(() => __neonbay.Sound.voices())));
    check(await game(async () => { const { engineSources } = await import('/js/vehicles/engine.js'), s = engineSources(); return __cars.map(c => s.find(e => e.key === c).voice).join(); }) === 'four,diesel', 'wrong engine voices');
    await game(() => { for (const c of __cars) { if (c.driver) __neonbay.removeEntity(c.driver); __neonbay.removeEntity(c); } });
    check(await until(() => __cars.every(c => !__neonbay.Sound.playing('engine').includes(c))), 'the engines kept going after the cars left');
  });

  await step('survives a five-star chase', async () => {
    await game(() => { const { G, P } = __neonbay; G.heat = 100; G.wanted = 5; G.spawnT = 0; G.heliT = 0; P.hp = 100; });
    check(await until(() => __neonbay.all('npc').some(n => n.faction === 'law' && n.alive) && __neonbay.all('vehicle').some(v => v.model.police || v.model.army), undefined, 40000), 'the law never showed up');
    // the army comes in its own trucks, and soldiers get out of them. Which vehicle comes next is random and the game
    // runs slowly here, so send one army truck up the player's road rather than wait for the dice to pick one
    check(await until(async () => !!(window.__armyTruck = (await import('/js/vehicles/traffic.js')).spawnResponder('army')), undefined, 20000), 'no road to send an army truck up');
    check(await until(() => __armyTruck.mode === 'parked' || __armyTruck.dead, undefined, 60000), `the army truck never pulled up (${await game(() => JSON.stringify({ mode: __armyTruck.mode, respT: __armyTruck.respT }))})`);
    check(await until(() => __neonbay.all('npc').some(n => (n.type === 'army' || n.type === 'jugg') && Math.hypot(__armyTruck.x - n.x, __armyTruck.z - n.z) < 9)), 'no soldiers got out of the army truck');
    check(await until(() => !!__neonbay.G.heli, undefined, 20000), 'no helicopter at five stars');
    check(await until(() => !__neonbay.Sound.ready || __neonbay.Sound.intensity === 5), 'the music never reached five-star intensity');
    check(await until(() => __neonbay.Sound.voices().rotor === 1), 'the chopper makes no sound');
    await page.waitForTimeout(8000);
  });

  await step('a chopper crash wrecks the car and drops the bystander it comes down on', async () => {
    await game(async () => { const { G } = __neonbay; G.heat = 100; G.wanted = 5; if (!G.heli) (await import('/js/vehicles/heli.js')).spawnHeli(); });
    check(await until(() => !!__neonbay.G.heli, undefined, 20000), 'no helicopter to shoot down');
    await clearVehicles(5, -85);
    await game(() => {
      const { G, P, spawnVehicle, spawnNpc } = __neonbay; P.x = 5.5; P.z = -60; P.hp = 100;
      window.__ccar = spawnVehicle('sedan', 3, -80, 0); window.__cnpc = spawnNpc('civilian', 1, -88);
      const h = G.heli; h.x = 4; h.z = -85; h.y = 20; h.damage(1e6);
    });
    try {
      check(await until(() => !__neonbay.G.heli || !__neonbay.G.heli.falling, null, 60000), 'the chopper never hit the ground');
      check(await game(() => (__ccar.burnT > 0 || __ccar.dead) && !__cnpc.alive), 'the crash left the car or the bystander unharmed');
    } finally {
      await game(() => { __neonbay.removeEntity(__ccar); __neonbay.removeEntity(__cnpc); });
    }
  });

  await step('shoots the chopper\'s pilot, flies the chopper it leaves, and jumps out under the chute', async () => {
    await clearVehicles(0, -75);
    await game(async () => {
      const { G, P } = __neonbay, H = await import('/js/vehicles/heli.js'); P.x = 0; P.z = -60; P.y = 0; P.hp = 100;
      H.removeHeli(); H.spawnHeli(); const h = G.heli; h.x = 0; h.z = -80; h.y = 20; h.fireT = 1e9;
      h.onShot({ occupant: true, head: true }, 999);
    });
    check(await until(() => __neonbay.all('vehicle').some(v => v.model.id === 'heli' && !v.dead), undefined, 60000), 'the chopper did not come down in one piece');
    await game(() => { const { P } = __neonbay, v = __neonbay.all('vehicle').find(v => v.model.id === 'heli'); window.__heli = v; P.x = v.x + Math.cos(v.yaw) * 2.6; P.z = v.z - Math.sin(v.yaw) * 2.6; });
    check(await until(() => /fly/.test(document.getElementById('prompt').textContent) && !document.getElementById('prompt').hidden, undefined, 8000), 'no prompt to fly the chopper');
    await press('KeyF');
    check(await until(() => __neonbay.P.vehicle === window.__heli), 'did not get into the chopper');
    await page.keyboard.down('Space');
    const up = await until(() => window.__heli.y > 8, undefined, 60000);
    await page.keyboard.up('Space');
    check(up, 'the chopper did not lift off');
    await press('KeyF');
    check(await until(() => !__neonbay.P.vehicle), 'did not jump out');
    check(await game(() => __neonbay.P.chute && __neonbay.P.chute.open && !__neonbay.P.tumble), 'the parachute did not open by itself');
    check(await until(() => __neonbay.P.grounded && !__neonbay.P.chute, undefined, 60000), 'never landed under the chute');
    await game(() => __neonbay.removeEntity(window.__heli));
  });

  await step('a tank rolls in with the army and shells the player', async () => {
    // the soldiers from the steps before can have taken the player down, which clears the stars: wait out the respawn,
    // then keep them topped up until the tank is here, so the five stars hold
    check(await until(() => __neonbay.P.alive && __neonbay.G.state === 'play', undefined, 30000), 'the player never respawned');
    await game(() => { const { G, P } = __neonbay; G.heat = 100; G.wanted = 5; G.tankT = 0; P.hp = 100; });
    check(await until(() => { const { G, P } = __neonbay; P.hp = 100; P.armor = 100; G.wanted = 5; G.heat = 100; return !!G.tank; }, undefined, 20000), 'no tank at five stars');
    check(await until(() => __neonbay.Sound.voices().tank === 1), 'the tank makes no sound');
    // down an open stretch of road: the tank 30 m up it, rolling towards the player
    await clearVehicles(0, -75);
    await game(() => {
      const { G, P, all, removeEntity } = __neonbay, t = window.__tank = G.tank;
      G.spawnT = 999; // no police car or army truck rolling into the line of fire mid-step
      for (const v of all('vehicle')) if ((v.model.police || v.model.army) && Math.abs(v.x) < 6 && v.z > -150 && v.z < -30) removeEntity(v);
      P.x = 0; P.z = -60; P.y = 0; P.hp = 100; P.armor = 0;
      for (const n of all('npc')) if (Math.hypot(n.x, n.z + 75) < 25) removeEntity(n);
      Object.assign(t, { x: 0, z: -90, yaw: 0, dirX: 0, dirZ: 1, toX: 0, toZ: -50, v: 0, turretYaw: 0, aimYaw: 0, reloadT: 0 });
    });
    // a shell aimed a metre wide of the player flies on past and goes off far behind them, so one shot can miss; and at
    // the few frames a second software WebGL manages, a 4 s reload would leave time for only one or two. Count the
    // shots and cut each reload short, so the step waits for several shells rather than for the clock.
    await game(() => { window.__shells = 0; });
    const hurt = await until(() => {
      const t = __tank; if (t.reloadT > 1) { __shells++; t.reloadT = 0.4; }
      return __neonbay.P.hp < 100 || __shells >= 6;
    }, undefined, 60000) && await game(() => __neonbay.P.hp < 100);
    const r = await game(() => ({ hp: __neonbay.P.hp, tankHp: __tank.hp, d: Math.hypot(__tank.x - __neonbay.P.x, __tank.z - __neonbay.P.z), shells: __shells, los: __tank.los }));
    check(hurt, `no tank shell hit the player (hp ${r.hp}, tank ${r.d.toFixed(1)} m away, ${r.shells} shells fired, in sight ${r.los})`);
    check(r.tankHp > 0, 'the tank was caught in its own blast');
    await game(() => { __neonbay.P.hp = 100; });
  });

  await step('a tank goes down to rockets and leaves its wreck in the road', async () => {
    await game(async () => { const { G } = __neonbay; G.heat = 100; G.wanted = 5; window.__tank = G.tank || (await import('/js/vehicles/tank.js')).spawnTank(); });
    const r = await game(() => {
      const { G, all } = __neonbay, t = __tank;
      for (let i = 0; i < 8 && !t.dead; i++) t.onRocket(420);
      return { dead: t.dead, gone: !G.tank, wreck: all('tank').includes(t), solid: t.pushOut({ x: t.x, z: t.z }, 0.5) };
    });
    check(r.dead && r.gone, 'the tank survived eight rockets');
    check(r.wreck && r.solid, 'no wreck left in the road');
    await game(() => { __neonbay.removeEntity(__tank); __neonbay.P.hp = 100; });
  });

  await step('glows the minimap red while wanted', async () => {
    const glow = () => game(() => { const w = document.getElementById('radarWrap'); return { heat: +w.style.getPropertyValue('--heat'), pulse: w.classList.contains('pulse') }; });
    await game(() => { const { G } = __neonbay; G.heat = 100; G.wanted = 5; });
    check(await until(() => __neonbay.G.wanted >= 4), 'lost the wanted level too soon');
    const lit = await until(() => { const w = document.getElementById('radarWrap'); return +w.style.getPropertyValue('--heat') >= 0.8 && w.classList.contains('pulse'); });
    check(lit, 'no strong pulsing glow at high stars: ' + JSON.stringify(await glow()));
    await game(() => { const { G } = __neonbay; G.wanted = 0; G.heat = 0; });
    check(await until(() => +document.getElementById('radarWrap').style.getPropertyValue('--heat') === 0), 'the glow stayed on with no stars');
    check(!(await glow()).pulse, 'still pulsing with no stars');
  });

  await step('six stars after five minutes at five: a UFO beams down aliens with laser rifles', async () => {
    await game(async () => {
      const { G, P } = __neonbay, { exitVehicle } = await import('/js/game/player.js');
      if (P.vehicle) exitVehicle(false);
      Object.assign(P, { x: 0, z: 70, y: 0, floor: 0, roof: null, vy: 0, hp: 100, armor: 100 });
      G.heat = 100; G.wanted = 5; G.fiveT = 299; G.ufoT = 0;
    });
    check(await until(() => __neonbay.G.wanted === 6), 'no sixth star after five minutes at five');
    check(await game(() => document.querySelector('#stars .six').classList.contains('on') && document.getElementById('radarWrap').classList.contains('alien')), 'the HUD shows no green sixth star');
    check(await until(() => !!__neonbay.G.ufo, undefined, 20000), 'no UFO at six stars');
    check(await until(() => __neonbay.Sound.voices().ufo === 1), 'the UFO makes no sound');
    // bring it in over the player so it starts lowering its crew
    await game(() => { const { G, P } = __neonbay, u = G.ufo; u.ang = -Math.PI / 2; Object.assign(u, { x: P.x, z: P.z - 20, y: 24, dropT: 0 }); }); // over the road
    check(await until(() => __neonbay.G.ufo.beamT > 0 && __neonbay.all('npc').some(n => n.type === 'alien'), undefined, 30000), 'the UFO beamed nobody down');
    // frames are slow here: skip most of the way down the beam
    await game(() => { for (const n of __neonbay.all('npc')) if (n.type === 'alien' && n.y > 1) n.y = 1; });
    check(await until(() => __neonbay.all('npc').some(n => n.type === 'alien' && n.alive && n.behaviour === 'hunt' && !n.y), undefined, 30000), 'no alien landed');
    // take one down: it drops its laser rifle, and walking over it picks it up for key 0
    await game(() => {
      const { P } = __neonbay, n = __neonbay.all('npc').find(n => n.type === 'alien' && n.alive && n.behaviour === 'hunt');
      const r = Math.random; Math.random = () => 0.01; try { n.hurt(1e6, null, true); } finally { Math.random = r; }
      window.__laser = __neonbay.all('pickup').find(p => p.id === 'laser'); P.hp = 100;
    });
    check(await game(() => !!window.__laser), 'the alien dropped no laser rifle');
    await game(() => { const { P } = __neonbay; P.x = __laser.x; P.z = __laser.z; });
    check(await until(() => !!__neonbay.inv.owned.laser), 'could not pick up the laser rifle');
    await press('Digit0');
    check(await until(() => __neonbay.inv.cur === 'laser'), 'key 0 did not pull out the laser rifle');
    await game(async () => {
      const { G, P, inv } = __neonbay, { removeUfo } = await import('/js/vehicles/ufo.js'), { selectWeapon } = await import('/js/combat/combat.js');
      removeUfo(null); G.wanted = 0; G.heat = 0; G.fiveT = 0; P.hp = 100; selectWeapon('pistol');
      for (const n of __neonbay.all('npc')) if (n.type === 'alien') __neonbay.removeEntity(n);
      delete inv.owned.laser; delete inv.found.laser;
    });
  });

  await step('lights the streets at night', async () => {
    await game(() => __neonbay.lighting.set(1));
    check(await until(() => __neonbay.lighting.lit.lamps > 0 && __neonbay.lighting.lit.beams > 0), 'no street lamps or headlights came on');
    await game(() => __neonbay.lighting.set(null));
  });

  await step('every gun fires a recording of a real one', async () => {
    if (!(await game(() => __neonbay.Sound.ready))) return;
    check(await until(() => import('/js/data/shots.js').then(m => m.ALL_SHOT_FILES.every(f => __neonbay.Sound.samplesLoaded.includes(f)))), 'the gunshot recordings did not load');
    const played = await game(() => import('/js/data/shots.js').then(m => { const { Sound } = __neonbay, n0 = Sound.shotsPlayed, ids = Object.keys(m.SHOTS); for (const id of ids) Sound.shot(id); return { ids: ids.length, played: Sound.shotsPlayed - n0 }; }));
    check(played.played === played.ids, `some guns played the synthesized shot instead ${JSON.stringify(played)}`);
  });

  await step('every gun reloads with its own move and sound', async () => {
    // on keys 1, 2, 3, ... 0; grenades and molotovs are thrown one at a time and never reload
    const guns = await game(() => import('/js/data/weapons.js').then(m => m.GUNS.map((w, i) => [i, w.id, !!w.thrown])));
    await game(() => { const { G, P } = __neonbay; G.heat = 0; G.wanted = 0; P.hp = 100; });
    if (await game(() => __neonbay.Sound.ready)) check(await until(() => import('/js/data/reloads.js').then(m => Object.values(m.RELOADS).every(r => __neonbay.Sound.samplesLoaded.includes(r.sound)))), 'the reload sounds did not load');
    for (const [i, id, thrown] of guns) {
      if (thrown) continue;
      await game(id => { const { inv } = __neonbay; inv.owned[id] = true; if (id !== 'pistol') inv.ammo[id] = 50; inv.mag[id] = 0; }, id);
      await press(`Digit${(i + 1) % 10}`); // the tenth gun is on 0
      check(await until(id => __neonbay.inv.cur === id, id, 3000), `could not switch to the ${id}`);
      // frames are slow under software WebGL, so watch every frame from inside the page
      await game(() => { const { P } = __neonbay, w = window.__rl = { anims: new Set(), move: 0, x0: P.c.armL.rotation.x }; w.timer = setInterval(() => { if (P.reload) { w.anims.add(P.reload.anim); w.move = Math.max(w.move, Math.abs(P.c.armL.rotation.x - w.x0)); } }, 10); });
      await press('KeyR');
      // the game runs slowly here, so once the move is under way skip to the end of the reload
      const moved = await until(() => __rl.move > 0.3, undefined, 20000);
      await game(() => { if (__neonbay.G.reloadT > 0.01) __neonbay.G.reloadT = 0.01; });
      const done = await until(id => !__neonbay.G.reloadT && __neonbay.inv.mag[id] > 0, id, 5000);
      const seen = await game(() => { clearInterval(__rl.timer); return { anims: [...__rl.anims], move: __rl.move, t: __neonbay.G.reloadT, mag: __neonbay.inv.mag[__neonbay.inv.cur] }; });
      check(moved && seen.anims.length === 1, `the ${id} reload move did not play ${JSON.stringify(seen)}`);
      check(done, `the ${id} did not finish reloading ${JSON.stringify(seen)}`);
    }
    await press('Digit1');
    check(await until(() => __neonbay.inv.cur === 'pistol', undefined, 3000), 'could not switch back to the pistol');
    await game(guns => { const { inv } = __neonbay; for (const [, id] of guns) if (id !== 'pistol') { delete inv.owned[id]; delete inv.ammo[id]; delete inv.mag[id]; } }, guns);
  });
} finally {
  await close();
}
const bad = results.filter(r => !r.ok).map(r => r.name);
console.log(`${results.length} step(s) run, ${bad.length} failed`);
if (bad.length) console.log(`rerun just these: SMOKE_ONLY="${bad.join('|')}" node tests/smoke.mjs`);
console.log(failed ? `${failed} smoke step(s) failed` : 'smoke test passed');
process.exit(failed ? 1 : 0);
