import { emit } from '../core/events.js';
import { G, P, cam } from '../core/state.js';
import { $ } from '../core/util.js';
import { addEntity } from '../entities/registry.js';

// ================= ROOFTOP DOORS =================
// The door pair of one roof (world/rooftops.js): E at the street door takes the stairs up, E at the
// hut door on the roof takes them back down. A short fade to black hides the jump.
const REACH = 1.8;
const RoofDoor = {
  kind: 'roofdoor',
  blipLayer: 1,
  onRoof: true, // offers its interaction while the player is up on a roof
  interaction(p) {
    if (G.stairs) return null;
    const up = p.y < 2;
    if (!up && p.roof !== this.roof) return null;
    const at = up ? this.roof.street : this.roof.hutOut, dist = Math.hypot(at.x - p.x, at.z - p.z);
    if (dist >= REACH) return null;
    return { keys: ['KeyE'], priority: 1, dist, prompt: up ? 'Press <kbd>E</kbd> to take the stairs to the roof' : 'Press <kbd>E</kbd> to head back down', run: () => takeStairs(this.roof, up) };
  },
  blip(radar) { if (P.roof !== this.roof) radar.dot(this.roof.street.x, this.roof.street.z, '#5dff9e', 7, false, 'sq'); },
};
export function spawnRoofDoor(roof) { return addEntity(Object.assign(Object.create(RoofDoor), { roof, x: roof.street.x, z: roof.street.z })); }

// put the player on a roof (or back on the street when roof is null), facing out of the door
export function placeOnRoof(roof, up) {
  const at = up ? roof.hutOut : roof.street;
  P.roof = up ? roof : null;
  P.x = at.x; P.z = at.z; P.y = P.floor = up ? roof.floor : 0; P.vy = 0; P.grounded = true; P.vx = P.vz = 0; P.moveSpeed = 0;
  P.yaw = cam.yaw = up ? roof.hutYaw ?? roof.yaw : roof.yaw;
  P.c.root.position.set(P.x, P.y, P.z); P.c.root.rotation.y = P.yaw;
  emit(up ? 'roof:up' : 'roof:down', { roof });
}
export function takeStairs(roof, up) {
  if (G.stairs) return;
  G.stairs = true; $('fade').classList.add('on');
  setTimeout(() => {
    G.stairs = false; $('fade').classList.remove('on');
    if (P.alive && !P.vehicle) placeOnRoof(roof, up);
  }, 280);
}
