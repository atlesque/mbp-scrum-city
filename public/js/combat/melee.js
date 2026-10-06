import { startSwing } from '../characters/swing.js';
import { Sound } from '../core/audio.js';
import { G, P, cam, inv } from '../core/state.js';
import { $, angDiff, clamp } from '../core/util.js';
import { MELEE, WBY, wStat } from '../data/weapons.js';
import { all } from '../entities/registry.js';
import { addHeat } from '../game/wanted.js';
import { alarm, onFoot } from '../npcs/npc.js';
import { emit } from '../render/effects.js';
import { zoneDamage } from './hitzones.js';

// ================= MELEE =================
// Fists and the street weapons (data/weapons.js, melee: true). A click starts a swing (characters/swing.js);
// when it lands, everyone in reach in front of the player takes the hit, where the player is looking deciding
// the zone (combat/hitzones.js) the same way a bullet does.

// distance to something at (tx, tz) of radius r if a swing from (px, pz) facing yaw reaches it, else null
export function inArc(px, pz, yaw, tx, tz, reach, arc, r = 0.4) {
  const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz);
  if (d > reach + r) return null;
  if (d <= r) return d; // already touching
  const off = Math.abs(angDiff(yaw, Math.atan2(dx, dz)));
  return off <= arc + Math.asin(Math.min(1, r / d)) ? d : null;
}

// what one blow does: kicks (every third move of a fist combo) hit and shove harder and knock people down
export function blowOf(w, st, step) {
  const kick = !!w.combo && step === 2;
  return { kick, reach: w.reach * (kick ? 1.15 : 1), dmg: st.dmg * (kick ? 1.8 : 1), knock: w.knock * (kick ? 1.8 : 1), down: kick || w.knock >= 6 };
}

// heat for hitting someone: assaulting an officer always counts; a civilian counts for more with a cop close by
export function meleeHeat(victim, copNear) {
  if (victim.faction === 'law') return 1.5;
  return copNear ? 1 : 0.35;
}

export function playerSwing(w, st) {
  const combo = w.combo && G.time - (P.lastSwing ?? -9) < st.rate + 0.4 ? ((P.combo || 0) + 1) % 3 : 0;
  P.combo = combo; P.lastSwing = G.time; P.lastShot = G.time; G.fireCd = st.rate;
  const dur = w.anim === 'saw' ? st.rate : st.rate * (combo === 2 ? 1.35 : 1);
  if (combo === 2) G.fireCd = dur;
  startSwing(P, w.anim, dur, combo);
  if (w.anim === 'saw') Sound.saw(); else Sound.swing(w.knock >= 4 ? 1 : 0.6);
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
// the swing in hand has reached its hit moment: land it on whoever is in reach
export function landPlayerSwing(sw) {
  const w = WBY[inv.cur]; if (!w || !w.melee || !P.alive || P.vehicle) return;
  const st = wStat(w, inv.lvl[w.id] || 0), b = blowOf(w, st, sw.step);
  const yaw = P.yaw, pitch = clamp(cam.pitch, -0.6, 0.7);
  const targets = [];
  for (const n of all('npc')) {
    if (!onFoot(n) || Math.abs((n.y || 0) - P.y) > 1.3) continue;
    const d = inArc(P.x, P.z, yaw, n.x, n.z, b.reach, w.arc, n.r + 0.1); if (d != null) targets.push({ n, d });
  }
  targets.sort((a, c) => a.d - c.d);
  let landed = 0, head = false;
  for (const { n, d } of targets.slice(0, w.hits)) {
    // aim from the chest at the target along the camera's pitch; the zone that line meets is where the blow lands
    const dx = (n.x - P.x) / (d || 1), dz = (n.z - P.z) / (d || 1);
    _o.set(P.x, P.y + 1.3, P.z); _d.set(dx * Math.cos(pitch), Math.sin(pitch), dz * Math.cos(pitch)).normalize();
    const h = b.kick ? null : n.raycast(_o, _d, b.reach + 2), zone = (h && h.zone) || 'torso';
    const copNear = n.faction !== 'law' && all('npc').some(c => c.faction === 'law' && c.alive && Math.hypot(c.x - P.x, c.z - P.z) < 30);
    n.meleeHit({ dmg: zoneDamage(b.dmg, zone), zone, dir: new THREE.Vector3(dx, 0, dz), knock: b.knock, down: b.down, blade: !!w.blade, weapon: w.id });
    addHeat(meleeHeat(n, copNear));
    landed++; if (zone === 'head') head = true;
  }
  if (landed) {
    G.hitT = 0.12; $('crosshair').className = head ? 'head' : 'hit';
    Sound.smack(w.blade ? 'blade' : w.id === 'fist' || w.id === 'knuckles' ? 'fist' : 'blunt');
    cam.shake = Math.max(cam.shake, w.anim === 'saw' ? 0.05 : b.knock >= 6 ? 0.22 : 0.1);
    alarm(P.x, P.z, 14);
    return;
  }
  // nobody in reach: a swing at a car dents it
  if (w.id === 'fist' && !b.kick) return;
  _o.set(P.x, P.y + 0.9, P.z); _d.set(Math.sin(yaw), 0, Math.cos(yaw));
  for (const v of all('vehicle')) {
    if (v.dead || v.driver === P || Math.hypot(v.x - P.x, v.z - P.z) > 8) continue;
    const h = v.raycast(_o, _d, b.reach + 0.3); if (!h || h.occupant) continue;
    v.damage(b.dmg * 0.4, true);
    const p = _o.clone().addScaledVector(_d, h.t); emit(p.x, p.y, p.z, 5, '#ffe9a8', 4, 0.25, 0.06);
    Sound.smack('metal'); cam.shake = Math.max(cam.shake, 0.12);
    return;
  }
}

// Q: from a gun to the melee weapon used last, then on through the melee weapons the player owns
export function nextMelee(cur, owned, last) {
  const list = MELEE.filter(w => owned[w.id]).map(w => w.id);
  if (!WBY[cur]?.melee) return list.includes(last) ? last : list[0];
  return list[(list.indexOf(cur) + 1) % list.length];
}
