// Screenshots of the game for PRs and visual checks, without writing a new script each time.
//   npm run shots -- <out folder> [options]
// Options (each takes one value; --time and --cam also take a comma list and shoot every combination):
//   --at x,z | roof:N | spawn   where the player stands (roof:N takes the stairs up to ROOFS[N])     default spawn
//   --face <degrees>            which way the player and the game camera look (0 = +z, 90 = +x)      default as spawned
//   --time day|dawn|morning|dusk|night|<0..1>   time of day                                           default day
//   --cam game|side|front|back|top|<dist>,<height>,<degrees>   game = the player's own camera; the others film the
//                               player (or what they drive) from that side; numbers: distance, height and angle round them
//   --ride <vehicle model>      spawn that vehicle (sedan, modely, eqa, bmw5, gs, t7, police, firetruck, ...) and get in
//   --spawn <what>[,<what>]     vehicle models or npc:<type> (npc:civilian, npc:cop, npc:army, ...) 6 m ahead, side by side
//   --wanted <0..6>             stars
//   --setup "<js>"              code run in the page first, with G, P, cam, inv, all, spawnVehicle, spawnNpc and the rest of
//                               window.__neonbay in scope (it may be async and use await import('/js/...'))
//   --scene <file.mjs>          for anything more: a module whose default export gets { page, game, until, press, shoot }
//   --keep                      leave the people and traffic around the player (cleared within 40 m by default)
//   --wait <ms>                 settle time before each picture                                      default 1500
//   --name <prefix>             file name prefix                                                     default shot
// Examples:
//   npm run shots -- shots/roof --at roof:0 --time day,night --cam game,side
//   npm run shots -- shots/truck --at 5.5,-60 --face 0 --ride firetruck --cam side,front --setup "P.vehicle.siren = true"
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { openGame } from './lib/browser.mjs';

const args = process.argv.slice(2), out = args[0] && !args[0].startsWith('--') ? args.shift() : 'shots', opt = {};
for (let i = 0; i < args.length; i++) {
  const k = args[i].replace(/^--/, '');
  if (k === 'keep') opt.keep = true; else opt[k] = args[++i];
}
const TIMES = { day: 0.15, midday: 0.15, dawn: 0.89, morning: 0.02, afternoon: 0.3, dusk: 0.37, sunset: 0.37, night: 0.6 };
const CAMS = { side: [5, 1.6, 90], front: [6, 1.8, 0], back: [6, 2.2, 180], top: [0.01, 22, 180] };
mkdirSync(out, { recursive: true });

const { page, game, until, press, close, errors } = await openGame();
const shoot = async name => { const f = `${out}/${name}.png`; await page.screenshot({ path: f }); console.log(f); return f; };
try {
  if (opt.at && opt.at.startsWith('roof:')) {
    const n = +opt.at.slice(5);
    await game(n => { const { P, ROOFS } = __neonbay, r = ROOFS[n]; P.x = r.street.x; P.z = r.street.z; }, n);
    if (!(await until(() => __neonbay.G.near.some(i => /roof/.test(i.prompt))))) throw new Error(`no roof door at ROOFS[${n}]`);
    await press('KeyE');
    if (!(await until(n => __neonbay.P.roof === __neonbay.ROOFS[n], n))) throw new Error('did not get up onto the roof');
    // step out of the stair hut onto the roof
    await game(n => { const { P, ROOFS } = __neonbay, r = ROOFS[n]; P.x = r.hutOut.x + r.fn[0] * 4; P.z = r.hutOut.z + r.fn[1] * 4; }, n);
  } else if (opt.at && opt.at !== 'spawn') {
    const [x, z] = opt.at.split(',').map(Number);
    await game(([x, z]) => { const { P } = __neonbay; P.x = x; P.z = z; }, [x, z]);
  }
  await game(([face, keep, wanted]) => {
    const { G, P, cam, all, removeEntity } = __neonbay;
    if (face != null) cam.yaw = P.yaw = face * Math.PI / 180;
    if (!keep) for (const e of all()) if ((e.kind === 'npc' || e.kind === 'vehicle') && Math.hypot(e.x - P.x, e.z - P.z) < 40) removeEntity(e);
    G.heat = wanted ? [0, 10, 30, 50, 75, 100, 100][wanted] : 0; G.wanted = wanted || 0; if (wanted >= 6) G.fiveT = 299;
    P.hp = 100;
  }, [opt.face != null ? +opt.face : null, !!opt.keep, opt.wanted ? +opt.wanted : 0]);
  for (const what of (opt.spawn || '').split(',').filter(Boolean).map((w, i, a) => [w, i - (a.length - 1) / 2])) {
    await game(([w, off]) => {
      const { P, spawnVehicle, spawnNpc } = __neonbay, f = [Math.sin(P.yaw), Math.cos(P.yaw)], x = P.x + f[0] * 6 + f[1] * off * 4, z = P.z + f[1] * 6 - f[0] * off * 4;
      if (w.startsWith('npc:')) { const n = spawnNpc(w.slice(4), x, z); n.update = function () { this.place && this.place(); }; } // stand still for the picture
      else spawnVehicle(w, x, z, P.yaw + Math.PI / 2);
    }, what);
  }
  if (opt.ride) {
    await game(m => { const { P, spawnVehicle } = __neonbay; window.__ride = spawnVehicle(m, P.x + Math.sin(P.yaw) * 2.5, P.z + Math.cos(P.yaw) * 2.5, P.yaw); }, opt.ride);
    if (!(await until(() => (__neonbay.G.near[0] || {}).prompt?.includes(__ride.model.name)))) throw new Error(`no prompt to get in the ${opt.ride}`);
    await press('KeyF');
    if (!(await until(() => __neonbay.P.vehicle === window.__ride))) throw new Error(`could not get in the ${opt.ride}`);
  }
  if (opt.setup) await game(async code => { const AsyncFn = (async () => {}).constructor; await new AsyncFn(...Object.keys(__neonbay), code)(...Object.values(__neonbay)); }, opt.setup);
  if (opt.scene) await (await import(pathToFileURL(resolve(opt.scene)).href)).default({ page, game, until, press, shoot });

  // a camera that films the player from outside: swap the game camera's pose in just before each frame is drawn
  await game(async () => {
    const { P } = __neonbay, { renderer, camera } = await import('/js/render/scene.js'), draw = renderer.render.bind(renderer);
    window.__shotCam = null;
    renderer.render = (s, c) => {
      const k = window.__shotCam;
      if (k && c === camera) {
        const t = P.vehicle || P, y = (P.y || 0) + 1, a = (t.yaw || 0) + k[2] * Math.PI / 180, d = k[0] * (P.vehicle ? 1.8 : 1); // step back for a vehicle
        camera.position.set(t.x + Math.sin(a) * d, (P.y || 0) + k[1], t.z + Math.cos(a) * d); camera.lookAt(t.x, y, t.z);
      }
      return draw(s, c);
    };
  });
  const times = (opt.time || 'day').split(','), cams = (opt.cam || 'game').split(','), name = opt.name || 'shot';
  for (const t of times) {
    await game(p => __neonbay.lighting.setTime(p), TIMES[t] ?? +t);
    for (const c of cams) {
      await game(k => { window.__shotCam = k; }, c === 'game' ? null : CAMS[c] || c.split(',').map(Number));
      await page.waitForTimeout(+opt.wait || 1500);
      await shoot([name, times.length > 1 && t, cams.length > 1 && c].filter(Boolean).join('-').replace(/[^\w.-]+/g, '_'));
    }
  }
  if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));
} finally { await close(); }
