vi.mock('../../public/js/net/net.js', () => ({ MP: { state: 'off' }, connected: () => false, send: vi.fn(), onMessage() {}, onStatus() {} }));
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { G, P, inv } from '../../public/js/core/state.js';
import { worldEvents, EVENTS, INTENSITY, startWorldEvent, stopWorldEvent, updateWorldEvents } from '../../public/js/game/world-events.js';
import { EVENT_LOOPS } from '../../public/js/data/world-event-sounds.js';
import { addEntity, removeEntity } from '../../public/js/entities/registry.js';
beforeEach(() => {
  Object.assign(G, { state: 'play', stairs: false });
  Object.assign(P, { alive: true, club: null, vehicle: null, x: 0, z: 0, y: 0, armor: 0, hp: 100, abducted: null, tumble: null });
  for (const id of Object.keys(EVENTS)) worldEvents.timers[id] = 999;
  const feed = { children: [], appendChild(el) { this.children.push(el); } };
  vi.stubGlobal('document', { createElement: () => ({ style: {}, remove() {} }), getElementById: () => ({ ...feed, style: {} }) });
});
afterEach(() => { stopWorldEvent(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('gives smaller incidents shorter breaks while every major disaster retains 2–4 minutes', () => {
  for (const id of ['cashrain', 'thunderstorm', 'godzilla', 'orbital']) {
    expect(startWorldEvent(id)).toBe(true); stopWorldEvent();
    const [min, max] = INTENSITY[EVENTS[id].intensity].cooldown;
    expect(worldEvents.timers[id]).toBeGreaterThanOrEqual(min); expect(worldEvents.timers[id]).toBeLessThanOrEqual(max);
  }
  expect(INTENSITY.mild.cooldown[1]).toBeLessThan(INTENSITY.catastrophic.cooldown[0]);
  for (const def of Object.values(EVENTS)) if (['severe', 'catastrophic'].includes(def.intensity)) expect(INTENSITY[def.intensity].cooldown).toEqual([120, 240]);
});
it('automatically collects landed cash on foot or in a car once, with no use prompt', () => {
  inv.money = 0; startWorldEvent('cashrain'); const e = worldEvents.active.get('cashrain');
  const b = e.bundles[0]; e.bundles = [b]; P.x = b.x; P.z = b.z; P.y = 0;
  e.t = 0; updateWorldEvents(.1); expect(inv.money).toBe(0);
  e.t = 10; updateWorldEvents(.1); updateWorldEvents(.1);
  expect(inv.money).toBe(25); expect(e.interaction).toBeUndefined();
  b.collected = false; b.mesh.visible = true; P.vehicle = { v: 0 };
  updateWorldEvents(.1); expect(inv.money).toBe(50);
  stopWorldEvent(); updateWorldEvents(.1); expect(inv.money).toBe(50);
});
it('keeps fireworks harmless to nearby people, cars and the player', () => {
  const damage = vi.fn(), target = addEntity({ kind: 'vehicle', x: 0, z: 0, blast: damage });
  try {
    startWorldEvent('fireworks'); worldEvents.active.get('fireworks').t = 0; updateWorldEvents(.1);
    expect(P.hp).toBe(100); expect(damage).not.toHaveBeenCalled();
  } finally { removeEntity(target); }
});
it('gives storm strikes a warning before damage and releases the strike meshes afterwards', () => {
  startWorldEvent('thunderstorm'); const e = worldEvents.active.get('thunderstorm');
  e.t = 0; updateWorldEvents(.05); expect(e.strikes).toHaveLength(1);
  const strike = e.strikes[0], damage = vi.fn();
  const target = addEntity({ kind: 'vehicle', x: strike.x, z: strike.z, blast: damage });
  P.x = -190; P.z = -190;
  try {
    updateWorldEvents(1); expect(damage).not.toHaveBeenCalled();
    updateWorldEvents(2.1); expect(damage).toHaveBeenCalled();
    expect(damage.mock.calls[0][5]).toBe(false);
    e.spawn = 100; updateWorldEvents(.7); expect(e.strikes).not.toContain(strike);
    expect(strike.g.parent).toBeNull();
  } finally { removeEntity(target); }
});
it('charges the orbital cannon before unleashing a much larger, environmental blast', () => {
  startWorldEvent('orbital'); const e = worldEvents.active.get('orbital');
  P.x = -190; P.z = -190;
  const damage = vi.fn(), target = addEntity({ kind: 'vehicle', x: e.x, z: e.z, blast: damage });
  try {
    e.t = 5; updateWorldEvents(.05); expect(e.beam.visible).toBe(false); expect(damage).not.toHaveBeenCalled();
    e.t = 7; updateWorldEvents(.05); expect(e.beam.visible).toBe(true);
    expect(damage.mock.calls[0][3]).toBeGreaterThanOrEqual(55); expect(damage.mock.calls[0][5]).toBe(false);
  } finally { removeEntity(target); }
});
it('owns and disposes every new event mesh, and supplies a sound profile for each', () => {
  for (const id of ['cashrain', 'fireworks', 'steam', 'thunderstorm', 'earthquake', 'invasion', 'orbital']) {
    expect(EVENT_LOOPS[id]).toBeTruthy(); expect(startWorldEvent(id)).toBe(true);
    const e = worldEvents.active.get(id), disposed = [];
    e.g.traverse(o => { if (o.geometry) disposed.push(vi.spyOn(o.geometry, 'dispose')); });
    expect(disposed.length).toBeGreaterThan(0); stopWorldEvent();
    for (const spy of disposed) expect(spy).toHaveBeenCalled();
    expect(e.g.parent).toBeNull(); expect(e.removed).toBe(true);
  }
});
it('connects invasion beams to the moving saucers and lets rockets stop the fleet', () => {
  P.x = 100; P.z = 100; startWorldEvent('invasion'); const e = worldEvents.active.get('invasion');
  P.x = -190; P.z = -190; e.t = 3.1; updateWorldEvents(.01);
  const c = e.craft.find(c => c.beam.visible); expect(c).toBeTruthy();
  e.g.updateMatrixWorld(true);
  const top = c.beam.localToWorld(new THREE.Vector3(0, -.5, 0));
  const ship = c.ship.getWorldPosition(new THREE.Vector3());
  expect(top.distanceTo(ship)).toBeLessThan(.01);
  const end = c.beam.localToWorld(new THREE.Vector3(0, .5, 0));
  expect(end.y).toBeCloseTo(.2); expect(Math.hypot(end.x - e.x, end.z - e.z)).toBeCloseTo(60);
  e.onRocket(3500); expect(worldEvents.active.has('invasion')).toBe(false);
});
it('keeps steam damage modest, warns before erupting and launches only nearby players', () => {
  startWorldEvent('steam'); const e = worldEvents.active.get('steam'), v = e.vents[0];
  P.x = e.x + v.x; P.z = e.z + v.z;
  e.t = 1; updateWorldEvents(.01); expect(P.hp).toBe(100); expect(v.jet.visible).toBe(false);
  e.t = 2.1; updateWorldEvents(.01); // wait for the shared hazard pulse
  e.pulse = 0; updateWorldEvents(.01);
  expect(P.hp).toBe(95); expect(P.vy).toBe(12); expect(P.grounded).toBe(false);
});
it('creates damaging tremors over multiple blocks without making them player crimes', () => {
  startWorldEvent('earthquake'); const e = worldEvents.active.get('earthquake');
  P.x = -190; P.z = -190;
  const damage = vi.fn(), target = addEntity({ kind: 'vehicle', x: e.x, z: e.z, blast: damage });
  try {
    e.t = 0; updateWorldEvents(.05);
    expect(damage).toHaveBeenCalledTimes(6);
    const centers = damage.mock.calls.map(call => `${call[0]},${call[2]}`);
    expect(new Set(centers).size).toBe(6);
    expect(damage.mock.calls.every(call => call[5] === false)).toBe(true);
  } finally { removeEntity(target); }
});
it('gives every invasion saucer a full marked windup before its first shot', () => {
  startWorldEvent('invasion'); const e = worldEvents.active.get('invasion');
  P.x = -190; P.z = -190;
  e.t = 0; updateWorldEvents(.01);
  expect(e.craft.every(c => !c.beam.visible && !c.hit)).toBe(true);
  e.t = 2.9; updateWorldEvents(.01);
  expect(e.craft.every(c => !c.beam.visible && !c.hit)).toBe(true);
  e.t = 3.1; updateWorldEvents(.01);
  expect(e.craft[0].hit).toBe(true); expect(e.craft.slice(1).every(c => !c.hit)).toBe(true);
});
