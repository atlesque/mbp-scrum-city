// Multiplayer: what goes over the wire (net/protocol.js) and the connection to the room (net/net.js), against a stand-in
// WebSocket that behaves like the room in github.com/atlesque/mbp-games (src/room.js).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAG, SNAP, cleanName, defaultName, due, lookFor, packShot, packState, sample, trim } from '../../public/js/net/protocol.js';

describe('multiplayer protocol', () => {
  const P = { x: 1.234, y: 0, z: -5.678, yaw: 0.12345, moveSpeed: 4.2, jumpY: 0, c: { gunId: 'smg' }, aiming: true, aimPitch: -0.1, twoHand: false, melee: null, alive: true, vehicle: null };

  it('packs the player small, and nothing but "away" when they are not in the city', () => {
    expect(packState(P, true)).toEqual({ t: 's', w: 1, x: 1.23, y: 0, z: -5.68, yaw: 0.123, ms: 4.2, j: 0, g: 'smg', a: 1, p: -0.1, th: 0, m: 0, al: 1 });
    expect(packState(P, false)).toEqual({ t: 's', w: 0 });
    const bike = { ...P, vehicle: { model: { id: 'gs' }, x: 3, z: 4, yaw: 1, v: 12.345, steer: 0.2, pop: 0.3 } };
    expect(packState(bike, true, 0.5).v).toEqual({ m: 'gs', x: 3, y: 0, z: 4, yaw: 1, v: 12.35, st: 0.2, ay: 0.5, pp: 0.3 });
    const heli = { ...P, vehicle: { model: { id: 'heli' }, x: 3, y: 30, z: 4, yaw: 1, v: 0, steer: 0, rotor: 1, landed: false } };
    expect(packState(heli, true).v).toMatchObject({ m: 'heli', y: 30, r: 1, l: 0, ay: null });
    expect(JSON.stringify(packState(bike, true)).length).toBeLessThan(220);
  });

  it('sends often while moving, rarely while standing still', () => {
    const s = packState(P, true);
    expect(due(s, null, 0.1)).toBe(true);
    expect(due(s, s, 0.05)).toBe(false); // never faster than SEND_EVERY
    expect(due(s, s, 0.3)).toBe(false); // nothing changed: wait for IDLE_EVERY
    expect(due(s, s, 1)).toBe(true);
    expect(due({ ...s, x: s.x + 0.5 }, s, 0.1)).toBe(true);
    expect(due({ ...s, a: 0 }, s, 0.1)).toBe(true);
    expect(due({ t: 's', w: 0 }, s, 0.1)).toBe(true);
  });

  it('draws others between the states either side of the moment shown, and jumps over big gaps', () => {
    const buf = [{ at: 0, s: { w: 1, x: 0, z: 0, yaw: 3, ms: 0 } }, { at: 0.1, s: { w: 1, x: 1, z: 0, yaw: -3, ms: 2 } }];
    const mid = sample(buf, 0.05);
    expect(mid.x).toBeCloseTo(0.5); expect(mid.ms).toBeCloseTo(1);
    expect(Math.abs(mid.yaw)).toBeGreaterThan(3); // the short way round, through ±π
    expect(sample(buf, 1).x).toBe(1);
    expect(sample(buf, -1).x).toBe(0);
    buf.push({ at: 0.2, s: { w: 1, x: 1 + SNAP + 1, z: 0, yaw: 0 } });
    expect(sample(buf, 0.15).x).toBe(1 + SNAP + 1); // a respawn: no gliding across the city
    trim(buf, 0.15); expect(buf.length).toBe(2);
    expect(LAG).toBeGreaterThan(0.05);
  });

  it('cleans names and makes default ones', () => {
    expect(cleanName('  <i>Neo</i>\n ')).toBe('iNeo/i');
    expect(cleanName('x'.repeat(30))).toHaveLength(16);
    expect(defaultName('alex.smith@example.com')).toBe('Alex Smith');
    expect(defaultName(null, () => 0.5)).toBe('Guest 5500');
  });

  it('gives each player the same look on every screen', () => {
    expect(lookFor('abc123')).toEqual(lookFor('abc123'));
    const looks = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => JSON.stringify(lookFor(id))));
    expect(looks.size).toBeGreaterThan(4);
  });

  it('sends a shotgun blast as at most 8 rounded pellets', () => {
    const v = (x, y, z) => ({ x, y, z });
    const m = packShot('shotgun', v(1.111, 2, 3), Array.from({ length: 10 }, (_, i) => v(i, 0.5551, 0)));
    expect(m.f).toEqual([1.11, 2, 3]); expect(m.h).toHaveLength(8); expect(m.h[1]).toEqual([1, 0.56, 0]);
  });
});

// a WebSocket that plays the room: welcome on hello, and whatever the test pushes
class FakeSocket {
  static last = null; static fullRoom = false;
  constructor(url) { this.url = url; this.sent = []; this.readyState = 0; FakeSocket.last = this; queueMicrotask(() => { this.readyState = 1; this.onopen && this.onopen(); }); }
  send(t) {
    this.sent.push(t);
    const m = t.startsWith('{') ? JSON.parse(t) : null;
    if (m && m.t === 'hello') queueMicrotask(() => {
      if (FakeSocket.fullRoom) { this.push({ t: 'full', max: 16 }); this.drop(4001); return; }
      this.push({ t: 'welcome', id: 'me', max: 16, players: [{ id: 'bo', name: 'Bo' }] });
    });
  }
  push(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
  drop(code = 1006) { this.readyState = 3; this.onclose && this.onclose({ code }); }
  close() { this.drop(1000); }
}

describe('multiplayer connection', () => {
  let N, store;
  beforeAll(async () => {
    store = {};
    vi.stubGlobal('localStorage', { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } });
    vi.stubGlobal('location', { search: '', href: 'https://mbp-scrum-city.atlesque.dev/' });
    vi.stubGlobal('WebSocket', FakeSocket);
    N = await import('../../public/js/net/net.js');
  });
  beforeEach(() => { N.leave(); FakeSocket.fullRoom = false; });
  const settle = () => new Promise(r => setTimeout(r, 0));

  it('joins the one room on the accounts service with the player\'s name, and hears about the others', async () => {
    expect(N.ROOM_URL).toBe('wss://play.atlesque.dev/mp/scrum-city');
    N.setName('Neo');
    const seen = []; N.onMessage('join', m => seen.push(m.name));
    N.join(); await settle(); await settle();
    expect(JSON.parse(FakeSocket.last.sent[0])).toEqual({ t: 'hello', name: 'Neo' });
    expect(N.MP.state).toBe('on'); expect(N.MP.id).toBe('me'); expect(N.nameOf('bo')).toBe('Bo');
    FakeSocket.last.push({ t: 'join', id: 'cy', name: 'Cy' });
    expect(seen).toEqual(['Cy']); expect(N.MP.players.size).toBe(2);
    N.send({ t: 's', w: 0 }); expect(FakeSocket.last.sent.at(-1)).toBe('{"t":"s","w":0}');
    expect(N.prefs().on).toBe(true);
  });

  it('remembers leaving, and sends nothing once out', async () => {
    N.join(); await settle(); await settle();
    const sock = FakeSocket.last, left = []; N.onMessage('leave', m => left.push(m.id));
    N.leave();
    expect(N.MP.state).toBe('off'); expect(N.prefs().on).toBe(false); expect(left).toContain('bo');
    N.send({ t: 's' }); expect(sock.sent.some(t => t === '{"t":"s"}')).toBe(false);
  });

  it('says so when the city is full, and doesn\'t keep trying', async () => {
    FakeSocket.fullRoom = true;
    N.join(); await settle(); await settle();
    expect(N.MP.state).toBe('full'); expect(N.prefs().on).toBe(false);
  });

  it('reconnects after a dropped connection', async () => {
    vi.useFakeTimers();
    try {
      N.join(); await vi.advanceTimersByTimeAsync(1);
      const first = FakeSocket.last; first.drop(1006);
      expect(N.MP.state).toBe('connecting');
      await vi.advanceTimersByTimeAsync(2100);
      expect(FakeSocket.last).not.toBe(first); expect(N.MP.state).toBe('on');
    } finally { vi.useRealTimers(); }
  });
});
