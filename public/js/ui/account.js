import { SYNC_EVERY, account, beginSignIn, connect, finishSignIn, onAccount, setAfterReplace, signOut, status, sync, syncOnLeave } from '../core/account.js';
import { on } from '../core/events.js';
import { save } from '../core/save.js';
import { G, inv, stats } from '../core/state.js';
import { $ } from '../core/util.js';
import { selectWeapon } from '../combat/combat.js';
import { toast } from './hud.js';

// ================= ACCOUNT MENUS =================
// The title screen offers playing as a guest or signing in; the pause menu says where progress is saved.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let note = ''; // one line under the account box: what just happened

function ago(t) {
  if (!t) return 'not yet';
  const m = Math.round((Date.now() - t) / 60e3);
  return m < 1 ? 'just now' : m === 1 ? '1 minute ago' : m < 60 ? `${m} minutes ago` : `${Math.round(m / 60)} h ago`;
}
export function playLabel() {
  const back = inv.money > 500 || stats.kills;
  return back ? `Back to the city ($${inv.money.toLocaleString()})` : account() ? 'Hit the streets' : 'Play as guest';
}

export function renderAccount() {
  const a = account(), b = $('playBtn');
  if (!b.disabled) b.textContent = playLabel();
  const warn = status.banned || status.error;
  $('signInBtn').hidden = !!a;
  $('acctBox').innerHTML = (a
    ? `<p class="small">Signed in as <b>${esc(a.user.email)}</b>: your cash and guns save to your MBP Games account. <button class="linkbtn" id="signOutBtn">Sign out</button></p>`
    : `<p class="small">Guests save in this browser only. An MBP Games account keeps your cash and guns on any device.</p>`)
    + (warn ? `<p class="small acct-warn" role="alert">${esc(warn)}</p>` : note ? `<p class="small acct-note">${esc(note)}</p>` : '');
  $('pauseAcct').innerHTML = a
    ? `Signed in as ${esc(a.user.email)} · saved to your account ${status.busy ? 'now' : ago(a.syncedAt)}`
    : `Playing as a guest: progress saves in this browser only. <button class="linkbtn" id="pauseSignInBtn">Sign in</button>`;
}

function goSignIn() { save(); beginSignIn(); }
document.addEventListener('click', e => {
  const id = e.target && e.target.id;
  if (id === 'signInBtn' || id === 'pauseSignInBtn') goSignIn();
  if (id === 'signOutBtn') { note = 'Signed out. You are playing as a guest; your progress stays in this browser.'; status.banned = null; signOut(); }
});

// Boot: finish a sign-in we're coming back from, then line up with the account's copy. The city keeps
// loading meanwhile, and a slow or missing service never holds up the game.
export async function initAccount(signingIn) {
  setAfterReplace(() => { if (!inv.owned[inv.cur]) selectWeapon('pistol'); G.hudCache = ''; });
  onAccount(what => {
    if (what === 'banned') toast(esc(status.banned || 'This account is banned.'));
    if (what === 'signed-out' && G.state !== 'title') toast('Signed out of MBP Games. Playing as a guest.');
    renderAccount();
  });
  const signedIn = await signingIn;
  const how = await Promise.race([connect(), new Promise(r => setTimeout(() => r('slow'), 6000))]);
  if (account()) note = how === 'loaded' ? 'Loaded your saved progress from your account.'
    : how === 'reset' ? 'Your progress was reset by an admin.'
    : how === 'uploaded' ? 'Your progress is now saved to your account.'
    : signedIn ? 'Signed in.' : '';
  renderAccount();
  // auto-save to the account: every few minutes in play, on every death, and on the way out
  setInterval(() => { if (G.state !== 'title' && G.state !== 'loading') sync().then(renderAccount); }, SYNC_EVERY);
  on('player:died', () => { sync(); });
  addEventListener('pagehide', () => { if (G.state !== 'loading') { save(); syncOnLeave(); } });
}
export { finishSignIn };
