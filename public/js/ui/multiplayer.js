import { $ } from '../core/util.js';
import { MP, join, leave, myName, onStatus, prefs, setName } from '../net/net.js';
import { NAME_MAX } from '../net/protocol.js';
import '../net/sync.js';

// ================= MULTIPLAYER MENUS =================
// The title screen's Multiplayer button opens a box to pick a name and join the shared city (or leave it); the pause
// menu says who's in and has the same join / leave. Whoever had it on last time is taken back in when the game loads.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let open = false;

export function statusLine() {
  const n = MP.players.size + 1;
  if (MP.state === 'on') return n === 1 ? `You're in the city, on your own for now (1/${MP.max}).` : `You're in the city with ${MP.players.size} other player${n > 2 ? 's' : ''} (${n}/${MP.max}).`;
  if (MP.state === 'connecting') return MP.error || 'Joining the city…';
  if (MP.state === 'full') return `The city is full (${MP.max}/${MP.max} players). Try again in a bit.`;
  if (MP.state === 'error') return MP.error || 'Could not reach the city. Try again in a moment.';
  return `Share the city with up to ${MP.max - 1} other players. Traffic, people and police stay your own.`;
}
const inCity = () => MP.state === 'on' || MP.state === 'connecting';

export function renderMultiplayer() {
  const btn = $('mpBtn'); if (!btn) return;
  btn.textContent = MP.state === 'on' ? `Multiplayer · ${MP.players.size + 1}/${MP.max}` : 'Multiplayer';
  btn.setAttribute('aria-expanded', String(open));
  const box = $('mpBox'); box.hidden = !open;
  if (open) {
    const input = $('mpName');
    if (document.activeElement !== input) input.value = myName();
    input.disabled = inCity();
    $('mpGo').textContent = inCity() ? 'Leave the city' : 'Join the city';
    $('mpStatus').textContent = statusLine();
    $('mpStatus').className = 'small' + (MP.state === 'error' || MP.state === 'full' ? ' acct-warn' : MP.state === 'on' ? ' acct-note' : '');
    $('mpList').innerHTML = MP.state === 'on' && MP.players.size ? 'In the city: ' + [...MP.players.values()].map(p => `<b>${esc(p.name)}</b>`).join(', ') : '';
  }
  $('pauseMp').innerHTML = inCity()
    ? `${esc(statusLine())} <button class="linkbtn" id="pauseMpGo">Leave the city</button>`
    : `Single player. <button class="linkbtn" id="pauseMpGo">Join the shared city</button>`;
}

document.addEventListener('click', e => {
  const id = e.target && e.target.id;
  if (id === 'mpBtn') { open = !open; renderMultiplayer(); if (open && !inCity()) $('mpName').focus(); }
  if (id === 'mpGo' || id === 'pauseMpGo') {
    if (inCity()) leave();
    else { if (id === 'mpGo') setName($('mpName').value); join(); }
  }
});
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'mpName' && e.key === 'Enter') { e.preventDefault(); $('mpGo').click(); } });
document.addEventListener('change', e => { if (e.target && e.target.id === 'mpName') { e.target.value = setName(e.target.value); } });

export function initMultiplayer() {
  $('mpName').maxLength = NAME_MAX;
  onStatus(renderMultiplayer);
  renderMultiplayer();
  if (prefs().on) join(); // on last time: back in
}
