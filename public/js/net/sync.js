import { explosion } from '../combat/combat.js';
import { emit, on } from '../core/events.js';
import { G, P, cam } from '../core/state.js';
import { angDiff, clamp } from '../core/util.js';
import { all } from '../entities/registry.js';
import { crew } from '../game/crew.js';
import { LAYOUT } from '../game/club.js';
import { hurtPlayer } from '../game/player.js';
import { HEAT } from '../data/wanted.js';
import { addHeat, setWanted } from '../game/wanted.js';
import { alarm } from '../npcs/npc.js';
import { NPC_TYPES } from '../npcs/types.js';
import { toast } from '../ui/hud.js';
import { ghostOf, ghostsFrom, pruneGhosts } from './ghosts.js';
import { MP, connected, onMessage, send } from './net.js';
import { NPC_CHUNK, NPC_EVERY, NPC_SHARE_R, chunks, due, heatNews, packNpc, packShot, packState, unpackNpc } from './protocol.js';
import { addRemote, allRemotes, dropRemote, remoteOf } from './remote.js';
import { rideState } from './ride.js';

// ================= MULTIPLAYER: THE GAME SIDE =================
// Everyone in the room is one crew. What this game tells the room: where the player is, their shots and blasts, the
// people it runs near another player, and the crew's heat. What it does with what the others send: moves their players
// (net/remote.js) and their people (net/ghosts.js), plays their gunfire, takes the hits their people land, and keeps
// one wanted level for all. The crew can't hurt each other. Traffic, the chopper, the tank and the UFO stay each
// player's own.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// (the city doesn't stop for the pause menu, the map or a shop in multiplayer, main.js, so they're still out in it)
const inWorld = () => ['play', 'dead', 'map', 'paused', 'shop'].includes(G.state) && !P.club;
const SEEN_FOR = 1.6; // seconds a crewmate's "they've seen me" lasts (they repeat it at least once a second)
const r2 = n => Math.round(n * 100) / 100;
let last = null, lastAt = 0, npcAt = 0, told = null, wasOff = false, nid = 0, npcTime = -1;

// ---- out ----
function tick() {
  const now = performance.now() / 1000;
  pruneGhosts(now);
  if (!connected()) { last = null; told = null; G.crewSeen = false; return; }
  G.crewSeen = allRemotes().some(r => r.seenUntil > now);
  shareHeat();
  const v = P.vehicle, aimYaw = v && P.aiming ? clamp(angDiff(v.yaw, cam.yaw), -2.4, 2.4) : null;
  // on the club's floor they're seen by the others in there; in the Pink Room by nobody
  const s = P.club === LAYOUT ? { ...packState(P, true), w: 2 } : packState(P, inWorld(), aimYaw);
  s.wl = G.wanted; s.sn = performance.now() - (G.seenAt || 0) < 700 ? 1 : 0;
  const rd = s.w === 1 && rideState(); if (rd) Object.assign(s, rd); // a passenger's seat in a crewmate's vehicle
  if (G.wanted >= 5) { s.fr = Math.floor(G.fiveRun || 0); s.ft = Math.floor(G.fiveT || 0); }
  if (due(s, last, now - lastAt)) { send(s); last = s; lastAt = now; }
  if (now - npcAt >= NPC_EVERY) { npcAt = now; shareNpcs(); }
}
setInterval(tick, 50); // (it keeps going while paused, so the others see the player step out of the city)

// the crew's heat: what this game added, and a level its own rules set (protocol.js heatNews)
function shareHeat() {
  const nowH = { heat: G.heat, wanted: G.wanted }, off = G.state === 'dead' || G.state === 'title';
  if (!told) { told = nowH; wasOff = off; return; }
  // the hospital, or Exit to title (ui/exit.js), clears this player's heat, not the crew's; coming back, they take it up again
  const back = wasOff && !off; wasOff = off;
  for (const m of heatNews(told, nowH, off || back)) send(m);
  told = nowH;
  if (back) { const l = Math.max(0, ...allRemotes().map(r => r.wl || 0)); if (l > G.wanted) take(l); }
}
// a level from the crew, without sending it back
function take(l, h) { setWanted(l, h ?? Math.max(G.heat, HEAT[Math.min(l, 5)] || 0)); told = { heat: G.heat, wanted: G.wanted }; }

// the people this game runs, near anyone else in the crew. Only while its city is running: in a tab in the background the
// browser stops drawing frames, so its people stand frozen. Sharing them then would leave the crew with statues (and keep
// their own games from bringing out people of their own); once they're no longer sent, they go (net/ghosts.js).
function shareNpcs() {
  const running = G.time !== npcTime; npcTime = G.time;
  if (!inWorld() || !running) return;
  const others = allRemotes().filter(r => r.where === 1); if (!others.length) return;
  const near = all('npc').filter(n => !n.vehicle && others.some(r => Math.hypot(n.x - r.x, n.z - r.z) < NPC_SHARE_R));
  for (const n of near) if (!n.nid) n.nid = ++nid;
  for (const part of chunks(near.map(packNpc), NPC_CHUNK)) send({ t: 'npcs', n: part });
}

// the player's own gun (combat/combat.js, vehicles/heli-guns.js) and their rockets and grenades going off
on('player:shot', ({ weapon, from, ends }) => { if (connected() && inWorld()) send(packShot(weapon, from, ends)); });
const boom = ({ x, y, z, R, dmg, power }, n) => ({ t: 'boom', x: r2(x), y: r2(y), z: r2(z), r: R, d: dmg, p: power, ...(n ? { n: 1 } : {}) });
on('player:boom', b => { if (connected()) send(boom(b)); });
// the people this game runs firing at the crew, and their rockets going off
on('npc:boom', b => { if (connected() && allRemotes().length) send(boom(b, true)); });
on('npc:shot', ({ npc, from, end }) => {
  if (!connected() || !npc.nid) return;
  send({ t: 'nshot', i: npc.nid, w: npc.def.gun, f: [r2(from.x), r2(from.y), r2(from.z)], h: [[r2(end.x), r2(end.y), r2(end.z)]] });
});
crew.others = () => connected() ? allRemotes().filter(r => r.alive && r.where === 1 && r.c.root.visible) : [];
crew.online = connected; crew.me = () => MP.id || '';
crew.hit = (r, d, zone) => send({ t: 'hit', to: r.id, d: Math.round(d * 10) / 10, z: zone });
on('player:died', () => {
  if (!connected()) return;
  send({ t: 'kill' });
  // wasted with the menu, the map or a shop open (the city kept going behind it): they close, for the wasted screen
  for (const id of ['pause', 'worldMap', 'shop']) document.getElementById(id).hidden = true;
  document.getElementById('hud').hidden = false; G.shop = null;
});

// ---- in ----
onMessage('welcome', m => { for (const p of m.players) addRemote(p.id, p.name); });
onMessage('join', m => { addRemote(m.id, m.name); if (G.state !== 'title') toast(`<b>${esc(m.name)}</b> joined the crew`, 3); });
onMessage('leave', m => {
  const r = remoteOf(m.id); dropRemote(m.id); pruneGhosts(0, m.id);
  if (r && MP.state === 'on' && G.state !== 'title') toast(`<b>${esc(r.name)}</b> left the city`, 3);
});
onMessage('s', m => {
  const r = remoteOf(m.id); if (!r) return;
  const now = performance.now() / 1000;
  r.push(m, now); r.seenUntil = m.sn ? now + SEEN_FOR : 0;
  const wl = clamp(m.wl | 0, 0, 6);
  // someone new in the crew: whoever is more wanted brings their heat
  if (!r.heard) { r.heard = true; if (wl > G.wanted) take(wl); }
  r.wl = wl;
  // the five star clocks are the crew's too: everyone's tick at the same pace, so the longest one is the crew's streak (and
  // the UFO comes for all of them at once)
  if (wl >= 5 && G.wanted >= 5) {
    if (Number.isFinite(m.fr)) G.fiveRun = Math.max(G.fiveRun || 0, clamp(m.fr, 0, 1e6));
    if (Number.isFinite(m.ft) && wl === G.wanted) G.fiveT = Math.max(G.fiveT || 0, clamp(m.ft, 0, 1e6));
  }
});
onMessage('shot', m => {
  const r = remoteOf(m.id); if (!r) return;
  r.showShot(m); if (Array.isArray(m.f) && m.f.every(Number.isFinite)) alarm(m.f[0], m.f[2], 32); // people here run from it too
});
// a rocket or grenade, where it burst for them: it goes off here too. A crewmate's spares this player; one fired at the
// crew by someone hunting them doesn't.
onMessage('boom', m => {
  if (![m.x, m.y, m.z, m.r, m.d].every(Number.isFinite) || !remoteOf(m.id)) return;
  explosion(m.x, m.y, m.z, clamp(m.r, 0, 30), clamp(m.d, 0, 400), false, clamp(m.p || 1, 0, 3), true, !m.n);
});
// their people near this player, and what they do
onMessage('npcs', m => {
  if (!remoteOf(m.id) || !Array.isArray(m.n)) return;
  ghostsFrom(m.id, m.n.slice(0, NPC_CHUNK).map(unpackNpc).filter(Boolean), performance.now() / 1000);
});
onMessage('nshot', m => { const g = ghostOf(m.id, m.i); if (g) g.showShot(m); });
// someone this game runs shot by a crewmate: the damage lands here, and a kill is theirs
onMessage('nhit', m => {
  const n = all('npc').find(e => e.nid === m.i), d = clamp(Number(m.d) || 0, 0, 500);
  if (!n || !n.alive || !d) return;
  n.hurt(d, new THREE.Vector3(Number(m.dx) || 0, 0, Number(m.dz) || 1), false);
  if (!n.alive) send({ t: 'nkill', to: m.from, ty: n.type, x: r2(n.x), z: r2(n.z) });
});
// this player took one of theirs down: the cash, the drops, the heat (game/rewards.js)
onMessage('nkill', m => {
  const def = NPC_TYPES[m.ty]; if (!def || ![m.x, m.z].every(Number.isFinite)) return;
  emit('npc:killed', { npc: { type: m.ty, def, faction: def.faction, x: m.x, z: m.z }, byPlayer: true });
});
// one of the people this crewmate's game runs shot this player
onMessage('hit', m => {
  const d = clamp(Number(m.d) || 0, 0, 250); if (!d || !P.alive || !inWorld()) return;
  hurtPlayer(d, ['head', 'torso', 'limb'].includes(m.z) ? m.z : 'torso');
});
onMessage('heat', m => {
  const v = clamp(Number(m.v) || 0, 0, 40); if (!v || !told) return;
  addHeat(v); told = { heat: G.heat, wanted: G.wanted };
});
onMessage('wanted', m => { if (told && Number.isFinite(m.l)) take(m.l, Number(m.h) || 0); });
onMessage('kill', m => { if (G.state === 'play') toast(`<b>${esc((remoteOf(m.id) || {}).name || 'Someone')}</b> got wasted`, 4); });
