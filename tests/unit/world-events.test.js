vi.mock('../../public/js/net/net.js', () => ({ MP: { state: 'off' }, connected: () => false, send: vi.fn(), onMessage() {}, onStatus() {} }));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { scene } from '../../public/js/render/scene.js';
import { Sound } from '../../public/js/core/audio.js';
import { worldEvents, startWorldEvent, stopWorldEvent, updateWorldEvents, EVENTS, breathSegment } from '../../public/js/game/world-events.js';
beforeEach(() => {
  Object.assign(P, { alive: true, club: null, vehicle: null, x: 0, z: 0, y: 0, abducted: null });
  G.state = 'play'; G.stairs = false; worldEvents.quiet = 0;
  for (const id of Object.keys(EVENTS)) worldEvents.timers[id] = 999;
});
afterEach(() => { stopWorldEvent(); vi.restoreAllMocks(); });
it('suspends every clock in menus and interiors, then starts only one of the due events', () => {
  worldEvents.timers.ufo = 90; worldEvents.timers.cashrain = 90;
  G.state = 'paused'; updateWorldEvents(100); expect(worldEvents.timers.ufo).toBe(90);
  G.state = 'play'; P.club = {}; updateWorldEvents(100); expect(worldEvents.timers.ufo).toBe(90);
  P.club = null; updateWorldEvents(89); expect(worldEvents.active.size).toBe(0);
  updateWorldEvents(1);
  expect(worldEvents.active.get('ufo').t).toBe(-EVENTS.ufo.warning);
  expect(worldEvents.active.size).toBe(1);
  expect(worldEvents.active.has('cashrain')).toBe(false);
});
it('allows different incidents together but prevents duplicate instances of one event', () => {
  expect(startWorldEvent('godzilla')).toBe(true); expect(startWorldEvent('godzilla')).toBe(false);
  expect(startWorldEvent('tsunami')).toBe(true); expect(worldEvents.active.size).toBe(2);
  expect(startWorldEvent('nope')).toBe(false);
});
it('holds inactive timers during an event and leaves a quiet interval before the next warning', () => {
  startWorldEvent('godzilla'); worldEvents.timers.tsunami = .1;
  updateWorldEvents(.1); expect(worldEvents.active.has('tsunami')).toBe(false);
  expect(worldEvents.timers.tsunami).toBe(.1);
  stopWorldEvent('godzilla');
  expect(worldEvents.timers.godzilla).toBeGreaterThanOrEqual(120); expect(worldEvents.timers.godzilla).toBeLessThanOrEqual(240);
  expect(worldEvents.quiet).toBeGreaterThanOrEqual(20); expect(worldEvents.quiet).toBeLessThanOrEqual(40);
  const quiet = worldEvents.quiet;
  G.state = 'paused'; updateWorldEvents(100); expect(worldEvents.quiet).toBe(quiet);
  G.state = 'play'; updateWorldEvents(quiet); expect(worldEvents.active.size).toBe(0);
  updateWorldEvents(.1); expect(worldEvents.active.has('tsunami')).toBe(true);
});
it('never starts a backlog of disasters together after a large time step', () => {
  for (const id of Object.keys(EVENTS)) worldEvents.timers[id] = 1;
  updateWorldEvents(300);
  expect(worldEvents.active.size).toBe(1);
  const e = [...worldEvents.active.values()][0];
  expect(e.t).toBe(-EVENTS[e.id].warning);
  e.t = EVENTS[e.id].duration; updateWorldEvents(.1);
  expect(worldEvents.active.size).toBe(0);
  updateWorldEvents(1); expect(worldEvents.active.size).toBe(0);
  updateWorldEvents(worldEvents.quiet); updateWorldEvents(.1);
  expect(worldEvents.active.size).toBe(1);
  expect(worldEvents.active.has(e.id)).toBe(false);
});
it('suspends running incidents in menus and removes all their resources on death', () => {
  const before = scene.children.length;
  startWorldEvent('godzilla'); startWorldEvent('orbital');
  const e = worldEvents.active.get('godzilla');
  G.state = 'map'; updateWorldEvents(10); expect(e.t).toBe(-EVENTS.godzilla.warning);
  G.state = 'dead'; P.alive = false; updateWorldEvents(.1);
  expect(worldEvents.active.size).toBe(0); expect(scene.children.length).toBe(before);
  expect(worldEvents.timers.godzilla).toBeGreaterThanOrEqual(120);
});
it('cancelling another event leaves the abduction alone, and cancelling the UFO releases falling physics', () => {
  startWorldEvent('ufo'); startWorldEvent('fireworks'); P.abducted = worldEvents.active.get('ufo'); P.y = 70; P.vy = 30;
  stopWorldEvent('fireworks'); expect(P.abducted).toBe(worldEvents.active.get('ufo'));
  stopWorldEvent('ufo'); expect(P.abducted).toBeNull(); expect(P.grounded).toBe(false);
  expect(P.vy).toBe(0); expect(P.jumps).toBe(2);
});
it('aims atomic breath from the mouth down to the street and sweeps sideways', () => {
  const a = breathSegment(10, 20, 0, 0), b = breathSegment(10, 20, 0, 1);
  expect(a.from.y).toBeGreaterThan(20); expect(a.to.y).toBe(2);
  expect(Math.hypot(a.to.x - a.from.x, a.to.z - a.from.z)).toBeGreaterThan(80);
  expect(a.to.x).not.toBe(b.to.x);
});
it('lets gunfire drive the monster away without cancelling an overlapping event', () => {
  startWorldEvent('godzilla'); startWorldEvent('cashrain'); const e = worldEvents.active.get('godzilla');
  const hit = e.raycast(new THREE.Vector3(e.x, 25, e.z - 50), new THREE.Vector3(0, 0, 1), 100);
  expect(hit?.t).toBeLessThan(50);
  e.onRocket(20000); expect(worldEvents.active.has('godzilla')).toBe(false); expect(e.removed).toBe(true);
  expect(worldEvents.active.has('cashrain')).toBe(true);
});
it('winds up before firing atomic breath and ignores the monster’s own explosions', () => {
  const cue = vi.spyOn(Sound, 'disasterCue');
  startWorldEvent('godzilla'); const e = worldEvents.active.get('godzilla');
  P.x = 200; P.z = 200; e.t = 4.9;
  updateWorldEvents(.2); expect(e.breath.visible).toBe(false);
  expect(cue).toHaveBeenCalledWith('charge', expect.any(Object));
  e.t = 7.9; updateWorldEvents(.2); expect(e.breath.visible).toBe(true);
  expect(cue).toHaveBeenCalledWith('beam', expect.any(Object));
  expect(e.hp).toBe(12000);
});
it('submits overlapping events together to the spatial audio mixer', () => {
  const loops = vi.spyOn(Sound, 'loops');
  startWorldEvent('cashrain'); startWorldEvent('fireworks'); updateWorldEvents(.01);
  const sources = loops.mock.calls.filter(([kind]) => kind === 'disaster').at(-1)[1];
  expect(sources.map(s => s.id).sort()).toEqual(['cashrain', 'fireworks']);
  stopWorldEvent('cashrain');
  expect(loops.mock.calls.at(-1)[1].map(s => s.id)).toEqual(['fireworks']);
});
it('normal expiry cleans up one event while another continues without advancing waiting clocks', () => {
  startWorldEvent('fireworks'); startWorldEvent('cashrain');
  const celebration = worldEvents.active.get('fireworks'), cash = worldEvents.active.get('cashrain');
  celebration.t = EVENTS.fireworks.duration; worldEvents.timers.godzilla = 42;
  const before = cash.t;
  updateWorldEvents(.1);
  expect(worldEvents.active.has('fireworks')).toBe(false); expect(celebration.removed).toBe(true);
  expect(worldEvents.active.get('cashrain')).toBe(cash); expect(cash.t).toBeCloseTo(before + .1);
  expect(worldEvents.timers.godzilla).toBe(42);
  expect(worldEvents.timers.fireworks).toBeGreaterThanOrEqual(35);
});
