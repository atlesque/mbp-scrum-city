import { G, P } from '../core/state.js';
import { $ } from '../core/util.js';
import { entities } from '../entities/registry.js';
import { exitVehicle } from './player.js';

// What the player can use right now: every entity offering an interaction (a shop door, a free
// vehicle), best first by priority then distance. The best one is shown as the on-screen prompt;
// a key press runs the best one that listens for that key.
const leave = { keys: ['KeyF', 'KeyE'], prompt: null, priority: 9, dist: 0, run: () => exitVehicle(false) };
const better = (a, b) => b.priority - a.priority || a.dist - b.dist;
export function updateInteraction() {
  const near = [];
  if (P.alive && G.state === 'play' && !P.tumble) { // nothing to grab while rolling down the road
    if (P.vehicle) near.push(leave);
    else for (const e of entities) { if (!e.interaction || (P.y > 2 && !e.onRoof)) continue; const it = e.interaction(P); if (it) near.push(it); }
  }
  near.sort(better); G.near = near;
  const best = near[0], pr = $('prompt');
  if (best && best.prompt) { pr.hidden = false; if (pr.innerHTML !== best.prompt) pr.innerHTML = best.prompt; }
  else pr.hidden = true;
}
export function interact(code) {
  const it = (G.near || []).find(i => i.keys.includes(code));
  if (!it) return false;
  it.run(); return true;
}
