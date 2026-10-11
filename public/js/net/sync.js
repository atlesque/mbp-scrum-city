import { explosion } from '../combat/combat.js';
import { on } from '../core/events.js';
import { G, P, cam } from '../core/state.js';
import { angDiff, clamp } from '../core/util.js';
import { hurtPlayer } from '../game/player.js';
import { toast } from '../ui/hud.js';
import { MP, connected, nameOf, onMessage, send } from './net.js';
import { due, packShot, packState } from './protocol.js';
import { addRemote, dropRemote, remoteOf } from './remote.js';

// ================= MULTIPLAYER: THE GAME SIDE =================
// What this game tells the room (where the player is, their shots, blasts and deaths) and what it does with what the
// others send: moves their players (net/remote.js), plays their gunfire, takes their hits and blows up their rockets here too.
// Traffic, people and police stay each player's own; only the players are shared.
const KILL_CREDIT = 10; // seconds a hit from someone still counts as theirs when the player goes down

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inWorld = () => (G.state === 'play' || G.state === 'dead') && !P.club;
let last = null, lastAt = 0, lastHit = null;

// ---- out ----
function tick() {
  if (!connected()) { last = null; return; }
  const now = performance.now() / 1000, v = P.vehicle;
  const aimYaw = v && P.aiming ? clamp(angDiff(v.yaw, cam.yaw), -2.4, 2.4) : null;
  const s = packState(P, inWorld(), aimYaw);
  if (!due(s, last, now - lastAt)) return;
  send(s); last = s; lastAt = now;
}
setInterval(tick, 50); // (it keeps going while paused, so the others see the player step out of the city)

// the player's own gun (combat/combat.js, vehicles/heli-guns.js) and their rockets and grenades going off
on('player:shot', ({ weapon, from, ends }) => { if (connected() && inWorld()) send(packShot(weapon, from, ends)); });
on('player:boom', ({ x, y, z, R, dmg, power }) => {
  if (connected()) send({ t: 'boom', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100, r: R, d: dmg, p: power });
});
// down: whoever hit the player last takes the credit
on('player:died', () => {
  if (connected() && lastHit && performance.now() / 1000 - lastHit.at < KILL_CREDIT) { send({ t: 'kill', by: lastHit.id }); toast(`<b>${esc(nameOf(lastHit.id))}</b> wasted you`, 4); }
  lastHit = null;
});

// ---- in ----
onMessage('welcome', m => { for (const p of m.players) addRemote(p.id, p.name); });
onMessage('join', m => { addRemote(m.id, m.name); if (G.state !== 'title') toast(`<b>${esc(m.name)}</b> came into the city`, 3); });
onMessage('leave', m => {
  const r = remoteOf(m.id); dropRemote(m.id);
  if (r && MP.state === 'on' && G.state !== 'title') toast(`<b>${esc(r.name)}</b> left the city`, 3);
});
onMessage('s', m => { const r = remoteOf(m.id); if (r) r.push(m, performance.now() / 1000); });
onMessage('shot', m => { const r = remoteOf(m.id); if (r) r.showShot(m); });
// their rocket or grenade, where it burst for them: it goes off here too, and hurts this player if they're close
onMessage('boom', m => {
  if (![m.x, m.y, m.z, m.r, m.d].every(Number.isFinite) || !remoteOf(m.id)) return;
  const R = clamp(m.r, 0, 30), dmg = clamp(m.d, 0, 400);
  if (Math.hypot(m.x - P.x, m.z - P.z) < R) lastHit = { id: m.id, at: performance.now() / 1000 };
  explosion(m.x, m.y, m.z, R, dmg, false, clamp(m.p || 1, 0, 3), true);
});
// one of their bullets landed on this player, or on what they drive
onMessage('hit', m => {
  const d = clamp(Number(m.d) || 0, 0, 250); if (!d || !P.alive || !inWorld()) return;
  lastHit = { id: m.from, at: performance.now() / 1000 };
  hurtPlayer(d, ['head', 'torso', 'limb'].includes(m.z) ? m.z : 'torso');
});
onMessage('vhit', m => {
  const d = clamp(Number(m.d) || 0, 0, 1000); if (!d || !P.vehicle || !inWorld()) return;
  lastHit = { id: m.from, at: performance.now() / 1000 };
  P.vehicle.damage(d, false);
});
onMessage('kill', m => {
  const by = m.by === MP.id ? 'You' : esc(nameOf(m.by)), who = m.id === MP.id ? 'you' : esc(nameOf(m.id));
  if (m.by === MP.id || m.id === MP.id || G.state === 'play') toast(`<b>${by}</b> wasted <b>${who}</b>`, 4);
});
