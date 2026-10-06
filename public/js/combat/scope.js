import { Sound } from '../core/audio.js';
import { G, P, inv } from '../core/state.js';
import { WBY } from '../data/weapons.js';

// ================= SCOPE =================
// Right mouse on a scoped gun steps through 2.25x, 9x and back out, like the CS sniper scope. Each shot
// knocks the scope out while the bolt cycles, then it comes back at the same zoom.
export const SCOPE_ZOOM = [1, 2.25, 9];
export const nextScope = level => (level + 1) % SCOPE_ZOOM.length;
export const scopeFov = (base, level) => base / SCOPE_ZOOM[level || 0];
// the scope only works on foot, alive, with a scoped gun in hand and no reload going
const canScope = () => !!WBY[inv.cur].scope && P.alive && !P.vehicle && G.reloadT <= 0 && G.state === 'play';
export function toggleScope() {
  if (!canScope()) return;
  G.rescope = 0; G.scope = nextScope(G.scope || 0); Sound.zoom(G.scope);
}
// called on each shot: drop out of the scope until the bolt is back
export function boltOut() { if (G.scope) { G.rescope = G.scope; G.scope = 0; } }
export function updateScope() {
  if (!canScope()) G.scope = G.rescope = 0;
  else if (G.rescope && G.fireCd <= 0) { G.scope = G.rescope; G.rescope = 0; }
  const on = G.scope > 0;
  if (on !== updateScope.on) { updateScope.on = on; document.getElementById('scope').hidden = !on; document.getElementById('crosshair').hidden = on; }
}
