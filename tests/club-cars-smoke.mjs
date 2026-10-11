import { openGame } from './lib/browser.mjs';
const { page, game, press, until, close, errors } = await openGame({ viewport: { width: 1280, height: 720 } });
const check = (ok, why) => { if (!ok) throw new Error(why); };
try {
  check(await game(() => ['comet', 'stallion', 'estate', 'taxi'].every(id => __neonbay.all('vehicle').some(v => v.home && v.model.id === id))), 'new models are missing from the parking lots');
  await game(() => {
    const { P, G, CLUB, inv, all, removeEntity } = __neonbay;
    for (const e of all()) if (e.kind === 'npc' || e.kind === 'vehicle') removeEntity(e);
    G.wanted = G.heat = 0; inv.money = 1000;
    P.x = CLUB.site.street.x; P.z = CLUB.site.street.z; P.vx = P.vz = 0;
  });
  check(await until(() => __neonbay.G.near.some(i => i.prompt?.includes('Velvet Flamingo'))), 'no club entrance prompt');
  await press('KeyE'); check(await until(() => !!__neonbay.P.club && !__neonbay.G.stairs), 'club did not open');
  await game(async () => {
    const { CLUB_AT, STAGE_TIP } = await import('/js/world/club.js'), { P, cam } = __neonbay;
    P.x = CLUB_AT.x + STAGE_TIP.x; P.z = CLUB_AT.z + STAGE_TIP.z; P.vx = P.vz = 0; cam.yaw = Math.PI; cam.pitch = 0.06;
  });
  check(await until(() => document.getElementById('prompt').textContent.includes('tip the stage')), 'no tipping prompt');
  await press('KeyE');
  check(await game(async () => {
    let bills = 0; (await import('/js/game/club.js')).clubScene().traverse(o => { if (o.name === 'stage-tip-bill' && o.visible) bills++; });
    return __neonbay.inv.money === 980 && bills === 10;
  }), 'tip did not charge or animate bills');
  await press('KeyE'); check(await game(() => __neonbay.inv.money === 980), 'tip cooldown charged twice');
  if (process.env.CLUB_SHOT) await page.screenshot({ path: process.env.CLUB_SHOT });
  await game(async () => {
    const { CLUB_AT, DJ } = await import('/js/world/club.js'), { P, cam } = __neonbay;
    P.x = CLUB_AT.x + DJ.front.x; P.z = CLUB_AT.z + DJ.front.z; P.vx = P.vz = 0; cam.yaw = Math.PI; cam.pitch = 0.03;
  });
  check(await until(() => document.getElementById('prompt').textContent.includes('DJ request')), 'no DJ prompt');
  await press('KeyE');
  check(await game(async () => __neonbay.inv.money === 955 && (await import('/js/game/club.js')).clubSpeakers()[0].sound === 'club-disco'), 'DJ did not take payment and change the music');
  if (process.env.DJ_SHOT) await page.screenshot({ path: process.env.DJ_SHOT });
  console.log('ok club: E to enter, E to tip, visible bills, cooldown, accessible DJ and music request');
  await game(async () => { (await import('/js/game/club.js')).leaveClub(); });
  for (const id of ['comet', 'stallion', 'estate', 'taxi']) {
    await game(id => {
      const { P, G, all, removeEntity, spawnVehicle, cam } = __neonbay;
      for (const e of all()) if (e.kind === 'npc' || e.kind === 'vehicle') removeEntity(e);
      G.wanted = G.heat = 0;
      P.x = 0; P.z = -98; P.y = P.floor = 0; P.vx = P.vz = 0; P.tumble = null; cam.yaw = Math.PI * 0.75; cam.pitch = -0.1;
      window.__retro = spawnVehicle(id, 0, -100, 0);
    }, id);
    check(await until(() => __neonbay.G.near.some(i => i.keys.includes('ride') && i.prompt?.includes(window.__retro.model.name))), `${id}: no enter prompt`);
    await press('KeyF'); check(await until(() => __neonbay.P.vehicle === window.__retro), `${id}: F did not enter`);
    if (process.env.CAR_SHOTS) await page.screenshot({ path: `${process.env.CAR_SHOTS}/${id}.png` });
    await page.keyboard.down('KeyW');
    check(await until(() => __neonbay.P.z > -94), `${id}: could not drive`);
    await page.keyboard.up('KeyW');
    await game(() => { __neonbay.P.vehicle.v = 0; __neonbay.P.vehicle.slip = 0; __neonbay.P.vx = __neonbay.P.vz = 0; });
    await press('KeyF'); check(await until(() => !__neonbay.P.vehicle), `${id}: F did not exit`);
    console.log(`ok ${id}: enter, drive and exit`);
  }
  check(!errors.length, errors.join('\n'));
} finally { await close(); }
