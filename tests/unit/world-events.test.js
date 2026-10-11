import { afterEach, beforeEach, expect, it } from 'vitest';
import { G, P } from '../../public/js/core/state.js';
import { scene } from '../../public/js/render/scene.js';
import { worldEvents, startWorldEvent, stopWorldEvent, updateWorldEvents, EVENTS, breathSegment } from '../../public/js/game/world-events.js';
beforeEach(() => {
  Object.assign(P, { alive: true, club: null, vehicle: null, x: 0, z: 0, y: 0, abducted: null });
  G.state = 'play'; G.stairs = false;
  Object.assign(worldEvents, { wait: 90, previous: null });
});
afterEach(() => stopWorldEvent());
it('waits for outdoor play, then starts one event with advance warning', () => {
  G.state = 'paused'; updateWorldEvents(100); expect(worldEvents.wait).toBe(90);
  G.state = 'play'; P.club = {}; updateWorldEvents(100); expect(worldEvents.wait).toBe(90);
  P.club = null; updateWorldEvents(89); expect(worldEvents.active).toBeNull();
  updateWorldEvents(1); expect(worldEvents.active.t).toBe(-EVENTS[worldEvents.active.id].warning);
  expect(startWorldEvent('godzilla')).toBe(false);
});
it('suspends an active event in menus and removes its resources on death', () => {
  const before = scene.children.length;
  expect(startWorldEvent('godzilla')).toBe(true);
  const e = worldEvents.active;
  G.state = 'map'; updateWorldEvents(10); expect(e.t).toBe(-EVENTS.godzilla.warning);
  G.state = 'dead'; P.alive = false; updateWorldEvents(.1);
  expect(worldEvents.active).toBeNull(); expect(scene.children.length).toBe(before);
  expect(worldEvents.wait).toBeGreaterThanOrEqual(120);
});
it('rejects unknown events and avoids immediately repeating the last event', () => {
  expect(startWorldEvent('nope')).toBe(false);
  worldEvents.previous = 'ufo'; worldEvents.wait = 0;
  updateWorldEvents(.01); expect(worldEvents.active.id).not.toBe('ufo');
});
it('cancelling an abduction releases the player into ordinary falling physics', () => {
  startWorldEvent('ufo'); P.abducted = worldEvents.active; P.y = 70; P.vy = 30;
  stopWorldEvent(); expect(P.abducted).toBeNull(); expect(P.grounded).toBe(false);
  expect(P.vy).toBe(0); expect(P.jumps).toBe(2);
});
it('aims atomic breath from the mouth down to the street and sweeps sideways', () => {
  const a = breathSegment(10, 20, 0, 0), b = breathSegment(10, 20, 0, 1);
  expect(a.from.y).toBeGreaterThan(20); expect(a.to.y).toBe(2);
  expect(Math.hypot(a.to.x - a.from.x, a.to.z - a.from.z)).toBeGreaterThan(80);
  expect(a.to.x).not.toBe(b.to.x);
});
it('lets gunfire hit the monster and drive it away without leaving an event entity', () => {
  startWorldEvent('godzilla'); const e = worldEvents.active;
  const hit = e.raycast(new THREE.Vector3(e.x, 25, e.z - 50), new THREE.Vector3(0, 0, 1), 100);
  expect(hit?.t).toBeLessThan(50);
  e.onRocket(20000); expect(worldEvents.active).toBeNull(); expect(e.removed).toBe(true);
});
it('winds up before firing atomic breath and ignores the monster’s own explosions', async () => {
  const { Sound } = await import('../../public/js/core/audio.js');
  const { vi } = await import('vitest');
  const cue = vi.spyOn(Sound, 'disasterCue');
  startWorldEvent('godzilla'); const e = worldEvents.active;
  P.x = 200; P.z = 200; e.t = 4.9;
  updateWorldEvents(.2); expect(e.breath.visible).toBe(false);
  expect(cue).toHaveBeenCalledWith('charge', expect.any(Object));
  e.t = 7.9; updateWorldEvents(.2); expect(e.breath.visible).toBe(true);
  expect(cue).toHaveBeenCalledWith('beam', expect.any(Object));
  expect(e.hp).toBe(12000);
  cue.mockRestore();
});
