// The game's MBP Games account client, against a small stand-in for the accounts service
// (github.com/atlesque/mbp-games): the token swap and the rev-checked progress API.
import { createHash } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const GAME = 'https://mbp-scrum-city.atlesque.dev';
let store, A, inv, stats, svc;

// what the service does, as far as the game can tell
function fakeService() {
  const s = { codes: new Map(), tokens: new Map(), saves: new Map(), banned: null };
  const res = (status, body) => ({ status, json: async () => body });
  s.fetch = async (url, opts = {}) => {
    const u = new URL(url), body = opts.body ? JSON.parse(opts.body) : null;
    const auth = (opts.headers && opts.headers.authorization || '').replace('Bearer ', '');
    if (u.pathname === '/api/token') {
      const c = s.codes.get(body.code);
      const challenge = createHash('sha256').update(body.code_verifier).digest('base64url');
      if (!c || c.challenge !== challenge || c.redirect !== body.redirect_uri || body.client !== 'scrum-city') return res(400, { error: 'bad_code', message: 'That sign-in has expired.' });
      s.codes.delete(body.code);
      s.tokens.set('tok-' + c.email, c.email);
      return res(200, { token: 'tok-' + c.email, user: { id: c.email, email: c.email } });
    }
    const email = s.tokens.get(auth);
    if (!email) return res(401, { error: 'signed_out' });
    if (s.banned === email) return res(403, { error: 'banned', message: 'This account is banned: cheating' });
    if (u.pathname === '/api/logout') { s.tokens.delete(auth); return res(200, { ok: true }); }
    const cur = s.saves.get(email) || { data: null, rev: 0 };
    if (!opts.method || opts.method === 'GET') return res(200, cur);
    if (body.rev !== cur.rev) return res(409, { error: 'conflict', ...cur });
    s.saves.set(email, { data: body.data, rev: cur.rev + 1 });
    return res(200, { rev: cur.rev + 1 });
  };
  return s;
}

beforeAll(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) });
  vi.stubGlobal('location', { href: GAME + '/', search: '', origin: GAME, assign: vi.fn() });
  vi.stubGlobal('history', { replaceState: (s, t, url) => { const u = new URL(url); location.href = u.toString(); location.search = u.search; } });
  vi.stubGlobal('fetch', (url, opts) => svc.fetch(url, opts));
});
async function freshGame() {
  vi.resetModules();
  A = await import('../../public/js/core/account.js');
  ({ inv, stats } = await import('../../public/js/core/state.js'));
}
beforeEach(async () => { store.clear(); svc = fakeService(); await freshGame(); });

// the game sends the player to the hosted sign-in page; they come back with a code
async function signIn(email = 'player@example.com') {
  await A.beginSignIn();
  const out = new URL(location.assign.mock.calls.at(-1)[0]);
  expect(out.origin + out.pathname).toBe(`${A.ACCOUNTS_URL}/signin`);
  const q = Object.fromEntries(out.searchParams);
  expect(q.client).toBe('scrum-city');
  svc.codes.set('code-1', { email, challenge: q.code_challenge, redirect: q.redirect_uri });
  const back = new URL(q.redirect_uri);
  back.searchParams.set('mbpg_code', 'code-1'); back.searchParams.set('mbpg_state', q.state);
  location.href = back.toString(); location.search = back.search;
  expect(await A.finishSignIn()).toBe(true);
  expect(location.search).toBe(''); // the code is gone from the address bar
}

describe('MBP Games account in the game', () => {
  it('signs in and moves guest progress into a new account', async () => {
    inv.money = 900;
    await signIn();
    expect(A.account().user.email).toBe('player@example.com');
    expect(await A.connect()).toBe('uploaded');
    expect(svc.saves.get('player@example.com')).toMatchObject({ rev: 1, data: { money: 900 } });
    // nothing changed, nothing sent
    expect(await A.sync()).toBe('same');
    inv.money = 1500;
    expect(await A.sync()).toBe('saved');
    expect(svc.saves.get('player@example.com').rev).toBe(2);
  });
  it('takes the account\'s copy when it already has progress', async () => {
    inv.money = 900; await signIn(); await A.connect();
    // a new browser with its own guest progress, then the same account signs in
    store.clear(); await freshGame();
    inv.money = 50;
    await signIn();
    expect(await A.connect()).toBe('loaded');
    expect(inv.money).toBe(900);
  });
  it('adopts an admin reset on the next save', async () => {
    inv.money = 4000; inv.owned.minigun = true; stats.kills = 12;
    await signIn(); await A.connect();
    svc.saves.set('player@example.com', { data: null, rev: 2 });
    inv.money = 4100;
    expect(await A.sync()).toBe('replaced');
    expect(inv.money).toBe(500);
    expect(inv.owned.minigun).toBeUndefined();
    expect(stats.kills).toBe(0);
    // and saves on from the fresh start
    inv.money = 600;
    expect(await A.sync()).toBe('saved');
  });
  it('drops back to guest when banned', async () => {
    await signIn(); await A.connect();
    svc.banned = 'player@example.com';
    inv.money = 777;
    expect(await A.sync()).toBe('offline');
    expect(A.account()).toBeNull();
    expect(A.status.banned).toBe('This account is banned: cheating');
    expect(inv.money).toBe(777); // still playable as a guest
  });
  it('ignores a code it did not ask for', async () => {
    location.search = '?mbpg_code=abc&mbpg_state=xyz';
    expect(await A.finishSignIn()).toBe(false);
    expect(A.account()).toBeNull();
  });
});
