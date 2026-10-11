import { Sound } from '../core/audio.js';
import { save } from '../core/save.js';
import { G, I, P, cam } from '../core/state.js';
import { $ } from '../core/util.js';
import { sync } from '../core/account.js';
import { exitVehicle, respawn } from '../game/player.js';
import { dropChute } from '../game/parachute.js';
import { closeWheel } from './wheel.js';
import { renderAccount } from './account.js';

// ================= EXIT TO TITLE =================
// The pause menu's Exit to title button asks once (Exit / Stay), then saves, pushes the progress to the account
// and puts the title screen back up, without reloading the page. The city goes on behind the title as it does at
// boot. Like a trip to the hospital it clears the heat, gets the player off whatever they were riding and stands
// them at the spawn point, but takes no hospital bill and leaves every weapon where it was.
// Multiplayer stays connected: on the title screen the player is out of the city for the others (net/sync.js),
// and the title's Multiplayer box can leave the room.
export function askExit(open) {
  $('exitAsk').hidden = !open; $('pauseExitBtn').hidden = open;
  setTimeout(() => $(open ? 'exitNo' : 'pauseExitBtn').focus(), 20);
}
export function exitToTitle() {
  if (G.state !== 'paused') return;
  save();
  closeWheel(false);
  // off the vehicle at a standstill (a chopper up in the air drops them out with a chute, which goes at once)
  if (P.vehicle) { P.vehicle.v = 0; P.vx = P.vz = 0; exitVehicle(false); }
  if (P.ride) { P.vx = P.vz = 0; exitVehicle(false, P.ride); }
  dropChute(); P.tumble = null; P.bailFrom = null;
  respawn(); // leaves the club, clears the heat, the chopper, the tank and the UFO, and stands them at the spawn point
  Object.assign(G, { scope: 0, reloadT: 0, bigT: 0, toastT: 0 }); Object.assign(P, { reload: null, swing: null, aiming: false });
  Object.assign(I, { mouseL: false, mouseR: false, clickQ: 0 });
  $('bigText').classList.remove('show'); $('toast').classList.remove('show'); $('prompt').hidden = true;
  $('exitAsk').hidden = true; $('pauseExitBtn').hidden = false;
  $('pause').hidden = true; $('hud').hidden = true; $('title').hidden = false;
  G.state = 'title'; cam.pitch = -0.08; Sound.hush();
  sync().then(renderAccount); renderAccount();
  setTimeout(() => $('playBtn').focus(), 20);
}
$('pauseExitBtn').addEventListener('click', () => askExit(true));
$('exitNo').addEventListener('click', () => askExit(false));
$('exitYes').addEventListener('click', exitToTitle);
