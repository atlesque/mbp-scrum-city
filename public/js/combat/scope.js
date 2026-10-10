import { Sound } from '../core/audio.js';
import { G, P, inv } from '../core/state.js';
import { WBY } from '../data/weapons.js';

// ================= SCOPE =================
// Right mouse on a scoped gun steps through 2.25x, 9x and back out, like the CS sniper scope. The scope stays
// on through every shot and the bolt; only right click, a reload, a weapon switch, a vehicle or dying leave it.
export const SCOPE_ZOOM = [1, 2.25, 9];
export const nextScope = level => (level + 1) % SCOPE_ZOOM.length;
export const scopeFov = (base, level) => base / SCOPE_ZOOM[level || 0];
// the scope only works on foot, alive, with a scoped gun in hand and no reload going
const canScope = () => !!WBY[inv.cur].scope && P.alive && !P.vehicle && G.reloadT <= 0 && G.state === 'play';
export function toggleScope() {
  if (!canScope()) return;
  G.scope = nextScope(G.scope || 0); Sound.zoom(G.scope);
}
export function updateScope() {
  if (!canScope()) G.scope = 0;
  const on = G.scope > 0;
  if (on !== updateScope.on) { updateScope.on = on; document.getElementById('scope').hidden = !on; document.getElementById('crosshair').hidden = on; }
}
