// The game's MBP Games account client against the real accounts Worker (mbp-games/), run in-process.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../mbp-games/src/index.js';
import { makeD1 } from '../../mbp-games/test/d1.js';

const GAME = 'https://mbp-scrum-city.atlesque.dev', APP = 'https://accounts.atlesque.dev';
let env, mails, store, A, inv, stats;

beforeAll(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) });
  vi.stubGlobal('location', { href: GAME + '/', search: '', origin: GAME, assign: vi.fn() });
  vi.stubGlobal('history', { replaceState: (s, t, url) => { const u = new URL(url); location.href = u.toString(); location.search = u.search; } });
  // the game's requests go straight to the Worker, from the game's origin
  vi.stubGlobal('fetch', async (url, opts = {}) => {
    const headers = new Headers(opts.headers); headers.set('origin', GAME);
    return worker.fetch(new Request(url, { method: opts.method || 'GET', headers, body: opts.body }), env, {});
  });
});
beforeEach(async () => {
  mails = []; store.clear();
  env = { DB: makeD1(), ADMIN_EMAILS: '', MAIL_FROM: 'noreply@atlesque.dev', EMAIL: { send: async m => { mails.push(m); } } };
  vi.resetModules();
  A = await import('../../public/js/core/account.js');
  ({ inv, stats } = await import('../../public/js/core/state.js'));
});
const server = () => env.DB.prepare('SELECT data, rev FROM progress').first();

// play through the hosted sign-in: the game sends us off, the player opens the emailed link, we come back
async function signIn(email = 'player@example.com') {
  await A.beginSignIn();
  const out = new URL(location.assign.mock.calls.at(-1)[0]);
  expect(out.origin + out.pathname).toBe(`${A.ACCOUNTS_URL}/signin`);
  const q = Object.fromEntries(out.searchParams);
  const post = (path, body, extra = {}) => worker.fetch(new Request(APP + path, { method: 'POST', headers: { origin: APP, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) }), env, {});
  const { request, poll } = await (await post('/api/signin/start', { email, ...q })).json();
  const t = new URL(mails.at(-1).text.match(/https:\/\/\S+/)[0]).searchParams.get('t');
  await worker.fetch(new Request(APP + '/auth/link', { method: 'POST', headers: { origin: APP }, body: new URLSearchParams({ t }) }), env, {});
  const { redirect } = await (await post('/api/signin/poll', { request, poll })).json();
  const back = new URL(redirect);
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
    expect(JSON.parse((await server()).data).money).toBe(900);
    // nothing changed, nothing sent
    expect(await A.sync()).toBe('same');
    inv.money = 1500;
    expect(await A.sync()).toBe('saved');
    expect(await server()).toMatchObject({ rev: 2 });
  });
  it('takes the account\'s copy when it already has progress', async () => {
    inv.money = 900; await signIn(); await A.connect();
    // a new browser: guest progress there, then the same account signs in
    store.clear(); vi.resetModules();
    A = await import('../../public/js/core/account.js');
    ({ inv } = await import('../../public/js/core/state.js'));
    inv.money = 50;
    await signIn();
    expect(await A.connect()).toBe('loaded');
    expect(inv.money).toBe(900);
  });
  it('adopts an admin reset on the next save', async () => {
    inv.money = 4000; inv.owned.minigun = true; stats.kills = 12;
    await signIn(); await A.connect();
    await env.DB.prepare('UPDATE progress SET data = NULL, rev = rev + 1').run();
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
    await env.DB.prepare("UPDATE users SET banned_at = 1, ban_reason = 'cheating'").run();
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
