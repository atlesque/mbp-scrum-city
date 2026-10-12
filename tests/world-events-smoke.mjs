import assert from 'node:assert/strict';
import { openGame } from './lib/browser.mjs';
const { page, game, press, until, close, errors } = await openGame();
try {
  await game(async () => {
    // Observe real Web Audio output from newly created event voices, without replacing their synthesis.
    window.eventAnalysers = [];
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      if (this instanceof GainNode && !this.__metered) {
        this.__metered = true; const a = this.context.createAnalyser(); a.fftSize = 256;
        connect.call(this, a); eventAnalysers.push(a);
      }
      return connect.apply(this, args);
    };
    window.eventsModule = await import('/js/game/world-events.js');
    window.eventScene = (await import('/js/render/scene.js')).scene;
    const { P, G, all, removeEntity } = __neonbay;
    for (const e of all()) if (e.kind === 'npc' || e.kind === 'vehicle') removeEntity(e);
    Object.assign(P, { x: 0, z: -100, y: 0, floor: 0, hp: 100, armor: 0, vx: 0, vz: 0 });
    G.wanted = G.heat = 0; for (const id of Object.keys(__neonbay.worldEvents.timers)) __neonbay.worldEvents.timers[id] = 999;
  });
  assert(await game(() => {
    const { worldEvents, stopWorldEvent } = __neonbay;
    stopWorldEvent(); worldEvents.quiet = 0;
    for (const id of Object.keys(worldEvents.timers)) worldEvents.timers[id] = 1;
    eventsModule.updateWorldEvents(300);
    const single = worldEvents.active.size === 1;
    stopWorldEvent();
    const recovery = worldEvents.quiet >= 20 && worldEvents.quiet <= 40;
    eventsModule.updateWorldEvents(1);
    const quiet = worldEvents.active.size === 0;
    for (const id of Object.keys(worldEvents.timers)) worldEvents.timers[id] = 999;
    worldEvents.quiet = 0;
    return single && recovery && quiet;
  }));
  console.log('ok event pacing: one overdue incident starts, followed by a quiet recovery');
  assert(await game(() => __neonbay.startWorldEvent('ufo')));
  await game(() => { eventsModule.updateWorldEvents(8); eventsModule.updateWorldEvents(7); });
  assert(await game(() => __neonbay.P.abducted && __neonbay.P.y === 95 && !!__neonbay.P.chute));
  // A rendered frame must place the character at the camera's height, not twice as high.
  assert(await until(() => {
    const { P } = __neonbay; return Math.abs(P.c.body.getWorldPosition(new THREE.Vector3()).y - P.y) < 2;
  }));
  if (process.env.EVENT_SHOTS) await page.screenshot({ path: `${process.env.EVENT_SHOTS}/ufo.png` });
  await game(() => eventsModule.updateWorldEvents(1.1));
  assert(await game(() => !__neonbay.P.abducted && __neonbay.P.y > 80));
  await page.keyboard.down('Space');
  assert(await until(() => __neonbay.P.chute?.open));
  await page.keyboard.up('Space');
  await game(() => { __neonbay.stopWorldEvent(); __neonbay.P.y = 0; __neonbay.P.floor = 0; __neonbay.P.vy = 0; __neonbay.P.grounded = true; });
  console.log('ok UFO: capture, 95m lift, matching render height, release, Space opens parachute');
  for (const id of ['godzilla', 'tsunami', 'volcano', 'meteors', 'tornado']) {
    assert(await game(async id => {
      const { P, G, startWorldEvent, worldEvents, cam } = __neonbay;
      G.state = 'play'; P.alive = true; P.hp = 100; P.x = -50; P.z = -100; P.y = P.floor = 0; P.vx = P.vz = 0;
      startWorldEvent(id);
      const e = worldEvents.active.get(id);
      if (id === 'godzilla') {
        const b = (await import('/js/world/event-destruction.js')).eventBuildings.find(b => !b.protected);
        e.x = (b.x0 + b.x1) / 2; e.z = (b.z0 + b.z1) / 2 - 70;
      }
      // Keep a safe view of the event for geometry and sound checks.
      P.x = id === 'volcano' ? 200 : id === 'tsunami' ? 235 : e.x + 40; P.z = id === 'volcano' ? e.z - 40 : id === 'tsunami' ? 0 : e.z - 45;
      cam.yaw = id === 'volcano' ? .6 : id === 'tsunami' ? Math.PI / 2 : -.7; cam.pitch = .35;
      e.t = id === 'godzilla' ? 9.45 : 1;
      eventsModule.updateWorldEvents(.05);
      return e.g.children.length > 0 && (!['volcano', 'meteors'].includes(id) || e.rocks.length > 0);
    }, id));
    assert(await until(() => eventAnalysers.some(a => {
      const samples = new Float32Array(a.fftSize); a.getFloatTimeDomainData(samples);
      return samples.some(x => Math.abs(x) > .001);
    })), `${id} generated no audible waveform`);
    assert(await game(() => __neonbay.Sound.voices().disaster === 1), `${id} has no sound voice`);
    if (id === 'godzilla') {
      assert(await game(() => __neonbay.worldEvents.active.get('godzilla').breath.visible));
      assert(await game(async () => (await import('/js/world/event-destruction.js')).eventBuildings.some(b => b.broken)), 'atomic breath did not collapse any buildings');
    }
    if (id === 'volcano') assert(await game(() => {
      const e = __neonbay.worldEvents.active.get('volcano'), p = e.rocks[0].ring.getWorldPosition(new THREE.Vector3());
      return Math.abs(p.x - e.rocks[0].x) < .01 && Math.abs(p.z - e.rocks[0].z) < .01;
    }), 'volcano impact marker has a double world offset');
    if (process.env.EVENT_SHOTS) await page.screenshot({ path: `${process.env.EVENT_SHOTS}/${id}.png` });
    await game(() => {
      const { G, worldEvents, stopWorldEvent, Sound } = __neonbay, t = [...worldEvents.active.values()][0].t;
      G.state = 'paused'; eventsModule.updateWorldEvents(2);
      if ([...worldEvents.active.values()][0].t !== t || Sound.voices().disaster !== 0) throw new Error('pause did not freeze event/silence loop');
      G.state = 'play'; stopWorldEvent();
      for (const a of eventAnalysers) a.disconnect(); eventAnalysers.length = 0;
      if (worldEvents.active.size || Sound.voices().disaster) throw new Error('event leaked after cleanup');
    });
    console.log(`ok ${id}: visible geometry, spatial sound, hazard update, pause and cleanup`);
  }
  assert.deepEqual(errors, []);
} finally { await close(); }
