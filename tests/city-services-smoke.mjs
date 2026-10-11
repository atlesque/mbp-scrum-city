// Bounded single-browser gameplay check; run separately from the full smoke suite.
import { openGame } from './lib/browser.mjs';
const { page, game, press, until, close, errors } = await openGame({ viewport: { width: 1280, height: 720 } });
const check = (ok, why) => { if (!ok) throw new Error(why); };
try {
  await game(async () => {
    const { P, G, inv, all, removeEntity, cam, spawnVehicle } = __neonbay;
    const { COURIER } = await import('/js/data/city-services.js');
    for (const e of all()) if (e.kind === 'npc' || e.kind === 'vehicle') removeEntity(e);
    G.wanted = G.heat = 0; inv.money = 1000;
    P.x = COURIER.x; P.z = COURIER.z + 2; P.y = 0; P.vx = P.vz = 0; cam.yaw = Math.PI; cam.pitch = -0.05;
    window.__deliveryCar = spawnVehicle('sedan', COURIER.x, COURIER.z, 0);
  });
  await until(() => __neonbay.G.near.some(it => it.keys.includes('ride')));
  await press('KeyF');
  check(await until(() => !!__neonbay.P.vehicle), 'F did not enter the delivery car');
  check(await until(() => document.getElementById('prompt').textContent.includes('Neon Express')), 'missing mounted depot prompt');
  await press('KeyE');
  check(await until(async () => !!(await import('/js/game/city-services.js')).courierJob()), 'E did not start the courier run');
  check(await page.isVisible('#courierStatus'), 'missing courier HUD');
  if (process.env.COURIER_SHOT) await page.screenshot({ path: process.env.COURIER_SHOT });
  await press('KeyM');
  check(await until(() => __neonbay.G.state === 'map'), 'map did not open');
  check(await page.locator('#mapLegend').textContent().then(t => t.includes('Courier depot') && t.includes('Repair & respray')), 'service map legend missing');
  await press('KeyM');
  for (let i = 0; i < 3; i++) {
    await game(async () => {
      const { P, G } = __neonbay, s = (await import('/js/game/city-services.js')).courierJob().stops[(await import('/js/game/city-services.js')).courierJob().stop];
      P.x = P.vehicle.x = s.x; P.z = P.vehicle.z = s.z; P.vehicle.v = 0; P.vehicle.slip = 0; G.wanted = G.heat = 0;
    });
    check(await until(async n => { const j = (await import('/js/game/city-services.js')).courierJob(); return n === 2 ? !j : j?.stop === n + 1; }, i), `delivery ${i + 1} did not complete`);
  }
  check(await game(() => __neonbay.inv.money > 1000), 'delivery paid no cash');
  console.log('ok courier: F to enter, E to start, HUD, map markers, three stops and cash payout');
  await game(async () => {
    const { GARAGE } = await import('/js/data/city-services.js'), { P, G } = __neonbay;
    P.x = P.vehicle.x = GARAGE.x; P.z = P.vehicle.z = GARAGE.z; P.vehicle.v = 0; P.vehicle.hp = 20;
    G.wanted = 2; G.heat = 12; G.lostT = 0;
    window.__beforeGarage = __neonbay.inv.money;
    __neonbay.cam.yaw = Math.PI; __neonbay.cam.pitch = -0.06;
  });
  check(await until(() => document.getElementById('prompt').textContent.includes('Spray & Go')), 'missing garage prompt');
  await press('KeyE');
  check(await game(() => __neonbay.inv.money === window.__beforeGarage), 'garage charged while being pursued');
  await game(() => { __neonbay.G.lostT = 4; }); await press('KeyE');
  check(await until(() => __neonbay.inv.money === window.__beforeGarage - 300 && __neonbay.G.wanted === 0 && __neonbay.P.vehicle.hp === __neonbay.P.vehicle.model.hp), 'respray failed to repair, charge or clear heat');
  await press('KeyE'); check(await game(() => __neonbay.inv.money === window.__beforeGarage - 300), 'fresh-paint cooldown allowed a second charge');
  if (process.env.SERVICE_SHOT) await page.screenshot({ path: process.env.SERVICE_SHOT });
  await page.keyboard.down('KeyW');
  check(await until(() => Math.hypot(__neonbay.P.x - 75, __neonbay.P.z + 75) > 7), 'car could not drive out of the garage bay');
  await page.keyboard.up('KeyW');
  await game(() => { __neonbay.P.vehicle.v = 0; __neonbay.P.vehicle.slip = 0; });
  await press('KeyF'); check(await until(() => !__neonbay.P.vehicle), 'F did not leave the garage car');
  console.log('ok garage: pursuit refusal, E to pay/repair/respray/lose heat, cooldown, driving out and F to exit');
  check(!errors.length, errors.join('\n'));
} finally { await close(); }
