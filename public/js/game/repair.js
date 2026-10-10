import { muzzleOf } from '../characters/character.js';
import { Sound } from '../core/audio.js';
import { G, I, P, cam, inv } from '../core/state.js';
import { $, angDiff, clamp } from '../core/util.js';
import { REPAIR, WBY } from '../data/weapons.js';
import { all } from '../entities/registry.js';
import { emit as emitFx } from '../render/effects.js';
import { toast } from '../ui/hud.js';

// ================= REPAIR TOOL =================
// Battlefield's repair tool: hold fire with it in hand, up close to a vehicle you're aiming at, and the torch puts its
// bodywork back together. A vehicle on fire is put out first; a wreck stays a wreck. Welding drains the charge, which
// fills back up whenever the trigger is let go, in hand or not, the way the jetpack's fuel comes back on the ground.
// It works on anything with a health() and a repair(dt) (vehicles/vehicle.js for every drivable vehicle, the chopper
// you took included, and vehicles/firetruck.js for the fire brigade's truck):
//   health()   null for a wreck, else { hp, max, burning, name, x, y, z, hw, hl }: hw and hl are the half width (x) and
//              half length (z) of the box round it, y the height of its base
//   repair(dt) dt seconds of the torch on it; true if that did anything (a full one at full health doesn't need it)
// How fast it works and how long the charge lasts is REPAIR in data/weapons.js.
export { REPAIR };
export const tool = { charge: REPAIR.charge, on: false, target: null };

// how far (p.x, p.z) is from the box round h, and the nearest point of it
export function boxDist(p, h) {
  const nx = clamp(p.x, h.x - h.hw, h.x + h.hw), nz = clamp(p.z, h.z - h.hl, h.z + h.hl);
  return { d: Math.hypot(p.x - nx, p.z - nz), x: nx, z: nz };
}
// the vehicle the torch reaches from p aiming along yaw: the closest one in reach and in front, or null.
// Returns { e, h, x, z }: the entity, its health() and the nearest point of its box.
export function findTarget(p, yaw, ents) {
  let best = null, bd = REPAIR.reach;
  for (const e of ents) {
    const h = e.health && e.health(); if (!h) continue;
    if (Math.abs((p.y || 0) - h.y) > REPAIR.lift) continue;
    const n = boxDist(p, h); if (n.d > bd) continue;
    // standing right against it, any way the player faces will do
    if (n.d > 0.3 && Math.abs(angDiff(yaw, Math.atan2(n.x - p.x, n.z - p.z))) > REPAIR.cone) continue;
    best = { e, h, x: n.x, z: n.z }; bd = n.d;
  }
  return best;
}
// One frame of the tool: held is the trigger. Welding drains the charge; a let-go trigger refills it (holding it with
// nothing to fix neither drains nor refills, so an empty tool can't trickle on). Returns whether it welded.
export function toolStep(t, held, target, dt) {
  const work = !!(held && t.charge > 0 && target && target.e.repair(dt));
  t.on = work;
  if (work) t.charge = Math.max(0, t.charge - dt);
  else if (!held) t.charge = Math.min(REPAIR.charge, t.charge + REPAIR.refill * dt);
  return work;
}

// every frame, from updatePlayer: the torch in hand on foot, the charge, the sparks and the gauges
let told = 0;
export function updateTool(dt) {
  const inHand = !!WBY[inv.cur]?.tool && P.alive && !P.vehicle && !P.tumble && G.state === 'play';
  const held = inHand && !!I.mouseL;
  const target = inHand ? findTarget(P, cam.yaw, all()) : null;
  tool.target = target;
  if (toolStep(tool, held, target, dt)) {
    const y = (target.h.y || 0) + 0.7 + Math.random() * 0.4, m = muzzleOf(P.c);
    emitFx(target.x, y, target.z, 2, Math.random() < 0.5 ? '#ffd23e' : '#fff3c4', 4, 0.35, 0.05, -14, 2);
    emitFx(m.x, m.y, m.z, 1, Math.random() < 0.5 ? '#7fd8ff' : '#e8f8ff', 0.6, 0.12, 0.07, 0, 0);
    if (G.time - (updateTool.t || 0) > 0.09) { updateTool.t = G.time; Sound.weld(); }
  }
  // say how it works once, the first time the trigger is held with nothing in reach
  if (held && !target && told < 0.5) { told += dt; if (told >= 0.5) toast('Walk up to a vehicle and aim at it to <em>repair</em> it.', 4); }
  gauges(inHand, target);
}
// FIX: the charge, while the tool is in hand or filling back up; and over the crosshair, what it would fix
function gauges(inHand, target) {
  const show = !!inv.owned.repair && (inHand || tool.charge < REPAIR.charge), v = $('fixVital');
  if (v.hidden === show) v.hidden = !show;
  if (show) $('fixFill').style.width = (tool.charge / REPAIR.charge * 100).toFixed(1) + '%';
  const h = target && target.h, box = $('fixTarget');
  if (box.hidden === !!h) box.hidden = !h;
  if (!h) return;
  const name = h.burning ? `${h.name} · on fire` : h.hp >= h.max ? `${h.name} · fixed` : h.name;
  if (name !== gauges.label) { gauges.label = name; $('fixName').textContent = name; }
  $('fixHp').style.width = clamp(h.hp / h.max * 100, 0, 100).toFixed(1) + '%';
}
// getting wasted: a fresh charge for the next life (a found tool is gone anyway)
export function resetTool() { tool.charge = REPAIR.charge; tool.on = false; tool.target = null; }
