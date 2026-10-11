import { afterEach, expect, it, vi } from 'vitest';
const net = vi.hoisted(() => ({ handlers: {}, status: null, online: true, send: vi.fn() }));
vi.mock('../../public/js/net/net.js', () => ({ MP: { id: 'me', state: 'on' }, connected: () => net.online, send: net.send, onMessage: (t, f) => net.handlers[t] = f, onStatus: f => net.status = f }));
import { P, G, inv } from '../../public/js/core/state.js';
import { worldEvents, updateWorldEvents, stopWorldEvent, startWorldEvent } from '../../public/js/game/world-events.js';
const packet = (active, now = Date.now()) => net.handlers.events({ t: 'events', now, active });
const incident = (id, age = 0) => ({ id, key: id + '-1', seed: 42, x: 50, z: 50, start: Date.now() - age * 1000, end: Date.now() + 90000, target: 'other', hp: 12000, collected: [] });
afterEach(() => { stopWorldEvent(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('uses server locations and time, blocks local scheduling, and keeps events through death', () => {
  Object.assign(P, { alive: true, club: null, x: -150, z: -150, y: 0 }); G.state = 'play';
  packet([incident('godzilla', 12), incident('tsunami', 12)]); updateWorldEvents(.01);
  const e = worldEvents.active.get('godzilla');
  expect(e.x).toBe(50); expect(e.t).toBeCloseTo(2, 1);
  expect(startWorldEvent('orbital')).toBe(false);
  P.alive = false; G.state = 'dead'; updateWorldEvents(1);
  expect(worldEvents.active.has('godzilla')).toBe(true);
  packet([incident('tsunami', 12)]); expect(worldEvents.active.has('godzilla')).toBe(false);
});
it('replays the same seeded meteor pattern for players joining from different locations', () => {
  P.alive = true; G.state = 'play'; P.club = null;
  const e = incident('meteors', 10); packet([e]); updateWorldEvents(.01);
  const first = worldEvents.active.get('meteors').rocks.map(r => [r.x, r.z]);
  stopWorldEvent(); P.x = 180; P.z = -180;
  packet([e]); updateWorldEvents(.01);
  expect(worldEvents.active.get('meteors').rocks.map(r => [r.x, r.z])).toEqual(first);
  expect(first.length).toBeGreaterThan(0);
});
it('sends boss damage to the server and waits for the shared health snapshot', () => {
  P.alive = true; G.state = 'play'; packet([incident('godzilla')]);
  const e = worldEvents.active.get('godzilla'); e.onRocket(100);
  expect(net.send).toHaveBeenCalledWith({ t: 'evhit', key: 'godzilla-1', d: 100 });
  expect(e.hp).toBe(12000);
});
it('keeps incidents when the player list changes and catches up without replaying damage', () => {
  vi.spyOn(Date, 'now').mockReturnValue(3000000);
  P.alive = true; P.hp = 100; G.state = 'play'; P.club = null; P.x = 50; P.z = 50;
  packet([incident('orbital', 45)]); updateWorldEvents(.01);
  const e = worldEvents.active.get('orbital');
  expect(e.t).toBeCloseTo(25, 1); expect(P.hp).toBe(100);
  net.status(); expect(worldEvents.active.get('orbital')).toBe(e);
  G.state = 'paused'; vi.spyOn(Date, 'now').mockReturnValue(3002000); updateWorldEvents(.01);
  expect(e.t).toBeCloseTo(27, 1); expect(P.hp).toBe(100);
});
it('uses the server-selected UFO victim and releases at the same shared time', () => {
  vi.spyOn(Date, 'now').mockReturnValue(4000000);
  Object.assign(P, { alive: true, club: null, abducted: null, x: 50, z: 50, y: 0 }); G.state = 'play';
  P.c = { body: new THREE.Group() }; P.chute = null;
  const ufo = incident('ufo', 12); ufo.target = 'me'; ufo.capture = { at: 0, x: 50, z: 50, y: 0 };
  packet([ufo]); updateWorldEvents(.01);
  expect(P.abducted).toBe(worldEvents.active.get('ufo')); expect(P.y).toBeGreaterThan(50);
  vi.spyOn(Date, 'now').mockReturnValue(4005000); updateWorldEvents(.01);
  expect(P.abducted).toBeNull(); expect(P.grounded).toBe(false);
});
it('automatically requests landed cash in a vehicle and applies the server award only once', () => {
  let now = 5000000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  Object.assign(P, { alive: true, club: null, abducted: null, tumble: null, vehicle: { v: 0 }, y: 0 }); G.state = 'play';
  const cash = incident('cashrain', 12); packet([cash]); updateWorldEvents(.01);
  const e = worldEvents.active.get('cashrain'), b = e.bundles[0]; P.x = b.x; P.z = b.z;
  net.send.mockClear(); now += 40; updateWorldEvents(.04);
  expect(net.send).toHaveBeenCalledWith({ t: 'evcash', key: cash.key, i: b.index });
  const feed = { children: [], appendChild(el) { this.children.push(el); } };
  vi.stubGlobal('document', { createElement: () => ({ style: {}, remove() {} }), getElementById: () => feed });
  const before = inv.money;
  net.handlers.evaward({ key: cash.key, i: b.index, value: 25 });
  net.handlers.evaward({ key: cash.key, i: b.index, value: 25 });
  expect(inv.money).toBe(before + 25); expect(b.mesh.visible).toBe(false);
});
it('retains local events when connected to a legacy server without snapshots', () => {
  stopWorldEvent(); worldEvents.shared = false;
  Object.assign(P, { alive: true, club: null, vehicle: null, abducted: null, x: 0, z: 0 }); G.state = 'play';
  expect(startWorldEvent('fireworks')).toBe(true);
  const e = worldEvents.active.get('fireworks'); updateWorldEvents(.1);
  expect(e.t).toBeGreaterThan(-4);
});
