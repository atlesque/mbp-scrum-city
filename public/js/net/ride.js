import { G, P, cam } from '../core/state.js';
import { kb } from '../core/controls.js';
import { angDiff, clamp } from '../core/util.js';
import { crew } from '../game/crew.js';
import { exitVehicle } from '../game/player.js';
import { toast } from '../ui/hud.js';
import { aimFromSeat, rideHooks, seatAt, seatsOf } from '../vehicles/seats.js';
import { allRemotes } from './remote.js';

// ================= MULTIPLAYER: RIDING TOGETHER =================
// The crew can ride along with whoever is driving. Walk up to a crewmate's car, truck, bike, e-step or chopper (one
// standing on its skids) and press the ride key: you take the first free passenger seat (vehicles/seats.js: four in a car,
// a truck or a chopper, two on a bike or a step). The driver's game drives; a passenger's game only puts its player in
// that seat on its copy of the vehicle (net/remote.js), and tells the others which seat that is (rd in its state, so they
// draw them there too). From the seat they shoot whatever they hold (not the rocket launcher, as in any vehicle). The ride
// key gets them off, out of their own side; they get off anyway when the driver does, leaves the room or goes down.
// Two crewmates who take the same seat at once: the one whose id sorts first keeps it, the other moves along.

// the seats of a driver's vehicle the crew already sits in (besides this player)
function taken(ownerId) {
  const s = new Set();
  for (const r of allRemotes()) if (r.rd && r.rd[0] === ownerId) s.add(r.rd[1]);
  return s;
}
export function freeSeat(ownerId, n, mine = 0) {
  const t = taken(ownerId);
  if (mine && !t.has(mine)) return mine;
  for (let k = 1; k < n; k++) if (!t.has(k)) return k;
  return 0;
}

// the prompt at a crewmate's vehicle
rideHooks.board = (v, p) => {
  const r = v.owner;
  if (!r || !r.alive || P.ride || P.vehicle || v.dead || !crew.online()) return null;
  const n = seatsOf(v); if (n < 2) return null;
  const dist = v.K.reach(v, p); if (!(dist <= v.K.reachMax)) return null;
  const k = freeSeat(r.id, n), name = r.name.replace(/[&<>"']/g, '');
  return { keys: ['ride'], priority: 1, dist, run: () => { if (k) board(r, v, k); },
    prompt: k ? `Press <kbd>${kb('ride')}</kbd> to ride with <b>${name}</b>` : `<b>${name}</b>'s ${v.model.short} is full` };
};
export function board(r, v, k) {
  P.ride = { r, v, k, aimed: false };
  P.moveSpeed = 0; P.vx = P.vz = P.vy = 0; P.grounded = true; P.tumble = null; P.swing = null; G.scope = 0;
  seatAt(v, P.c, k); carry(v);
  toast(`Riding with <b>${r.name.replace(/[&<>"']/g, '')}</b>. Shoot from your seat; <em>${kb('ride')}</em> to get off.`, 4);
  G.hudCache = '';
}
export const getOff = (crash = false) => { if (P.ride) exitVehicle(crash, P.ride); };
// the way off, offered while riding (game/interact.js)
export const getOffHere = { keys: ['ride', 'use'], prompt: null, priority: 9, dist: 0, run: () => getOff(false) };

// where the vehicle took them: called as the copy of the vehicle is moved (net/remote.js), so the camera keeps up with it
function carry(v) {
  P.x = v.x; P.z = v.z; P.y = v.K.flies ? v.y : 0; P.floor = P.y; P.roof = null; P.yaw = v.yaw;
  P.vx = v.vx || 0; P.vz = v.vz || 0;
}
rideHooks.carry = v => { if (P.ride && P.ride.v === v) carry(v); };

// each frame while riding (game/player.js): still a ride to be on, and the gun arm following the aim
export function rideAlong(aiming) {
  const R = P.ride, r = R.r, v = R.v;
  if (!crew.online() || !r.alive || r.vehicle !== v || !allRemotes().includes(r)) { getOff(false); return; }
  // someone else got this seat at the same moment: the first id keeps it
  const clash = allRemotes().some(o => o !== r && o.rd && o.rd[0] === r.id && o.rd[1] === R.k && o.id < crew.me());
  if (clash) {
    const k = freeSeat(r.id, seatsOf(v));
    if (!k) { getOff(false); toast('No seat left', 2.5); return; }
    v.K.unseat(v, P.c); R.k = k; seatAt(v, P.c, k); R.aimed = false;
  }
  if (aiming) { aimFromSeat(P.c, clamp(angDiff(v.yaw, cam.yaw), -2.4, 2.4), cam.pitch); R.aimed = true; }
  else if (R.aimed) { seatAt(v, P.c, R.k); R.aimed = false; } // back to sitting
  P.moveSpeed = 0;
}
// in the state this player sends (net/sync.js): [driver id, seat], and where they aim from it
export const rideState = () => P.ride ? { rd: [P.ride.r.id, P.ride.k], ay: P.aiming ? Math.round(clamp(angDiff(P.ride.v.yaw, cam.yaw), -2.4, 2.4) * 1000) / 1000 : null } : null;
