import { ACCOUNTS_URL, account } from '../core/account.js';
import { NAME_MAX, cleanName, defaultName } from './protocol.js';

// ================= MULTIPLAYER: THE CONNECTION =================
// Opt-in: single player is the default and doesn't touch the network. Turned on (ui/multiplayer.js), the game joins the
// one shared city on the Atlesque Play service, wss://play.atlesque.dev/mp/scrum-city, which takes 16 players and costs
// nothing while it's empty. A dropped connection is retried a few times; the game itself never waits on it.
// net/sync.js turns the messages into other players in the world.
export const ROOM_URL = ACCOUNTS_URL.replace(/^http/, 'ws') + '/mp/scrum-city';
const RETRY = [2, 5, 10, 20, 30]; // seconds before each reconnect attempt, then give up
const PING_EVERY = 25e3; // keeps a quiet connection open; answered by the room without waking it

// state: 'off' | 'connecting' | 'on' | 'full' | 'error'
export const MP = { state: 'off', id: null, max: 16, players: new Map(), error: '' };
const KEY = 'mbp_mp';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} },
};
// the name shown over this player's head, and whether they had multiplayer on last time
export const prefs = () => store.get();
export function myName() { return cleanName(prefs().name) || defaultName(account() && account().user.email); }
export function setName(n) { const name = cleanName(n).slice(0, NAME_MAX); store.set({ ...prefs(), name: name || undefined }); return myName(); }

// who listens: the menus (onStatus) and the world (onMessage, by type)
const statusFns = [], msgFns = {};
export function onStatus(fn) { statusFns.push(fn); }
export function onMessage(t, fn) { (msgFns[t] = msgFns[t] || []).push(fn); }
const changed = () => { for (const fn of statusFns) fn(MP); };
const dispatch = m => { for (const fn of msgFns[m.t] || []) fn(m); };

let ws = null, wanted = false, tries = 0, retryT = 0, pingT = 0;
export const connected = () => MP.state === 'on' && ws && ws.readyState === 1;
export function send(msg) { if (connected()) { try { ws.send(JSON.stringify(msg)); } catch (e) {} } }
export const nameOf = id => (MP.players.get(id) || {}).name || 'Someone';

export function join() {
  wanted = true; store.set({ ...prefs(), on: true });
  if (ws) return;
  clearTimeout(retryT);
  MP.state = 'connecting'; MP.error = ''; changed();
  let sock;
  try { sock = ws = new WebSocket(ROOM_URL); } catch (e) { fail('Could not reach the server.'); return; }
  sock.onopen = () => { if (ws === sock) sock.send(JSON.stringify({ t: 'hello', name: myName() })); };
  sock.onmessage = e => { if (ws === sock) receive(e.data); };
  sock.onclose = e => { if (ws !== sock) return; ws = null; closed(e.code); };
  sock.onerror = () => {};
}
export function leave() {
  wanted = false; store.set({ ...prefs(), on: false });
  clearTimeout(retryT); clearInterval(pingT);
  const sock = ws; ws = null;
  if (sock) try { sock.close(1000, 'bye'); } catch (e) {}
  reset('off');
}

function receive(raw) {
  if (raw === 'pong') return;
  let m; try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'welcome') {
    MP.id = m.id; MP.max = m.max || 16; MP.players = new Map((m.players || []).map(p => [p.id, p]));
    MP.state = 'on'; tries = 0;
    clearInterval(pingT); pingT = setInterval(() => { if (ws && ws.readyState === 1) try { ws.send('ping'); } catch (e) {} }, PING_EVERY);
    changed();
  } else if (m.t === 'join') { MP.players.set(m.id, { id: m.id, name: m.name }); changed(); }
  else if (m.t === 'full') { MP.max = m.max || MP.max; MP.full = true; }
  dispatch(m);
  if (m.t === 'leave') { MP.players.delete(m.id); changed(); }
}
function closed(code) {
  clearInterval(pingT);
  const full = MP.full || code === 4001;
  if (full) { wanted = false; store.set({ ...prefs(), on: false }); reset('full'); return; }
  if (!wanted) { reset('off'); return; }
  // dropped: try again in a bit, a few times
  if (tries >= RETRY.length) { wanted = false; fail('Lost the connection to the city.'); return; }
  reset('connecting', 'Reconnecting…');
  retryT = setTimeout(() => { if (wanted) join(); }, RETRY[tries++] * 1000);
}
function fail(msg) { ws = null; reset('error', msg); }
function reset(state, error = '') {
  const gone = [...MP.players.keys()];
  MP.state = state; MP.error = error; MP.id = null; MP.full = false; MP.players = new Map();
  for (const id of gone) dispatch({ t: 'leave', id }); // their players leave the world (quietly: it's us who went)
  changed();
}
