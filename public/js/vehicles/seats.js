// ================= PASSENGER SEATS =================
// In multiplayer the crew can ride together (net/ride.js): the driver's seat is seat 0, the rest are passengers'. A car,
// a truck (the fire engine and the army truck) and a chopper take four in all; a bike and an e-step two, the second one
// behind the rider. A passenger seat is the driver's seat moved over (a mirror image across the vehicle, or a row back),
// so each kind seats a passenger with its own seat() and the same pose its driver gets.
export const SEATS = { car: 4, truck: 4, heli: 4, bike: 2, step: 2 };
export const seatsOf = v => SEATS[v.model.kind] || 1;

// where seat k sits, in the same space as the driver's seat: { x, y, z }
export function seatOffset(kind, p, k) {
  if (kind === 'bike') return { x: p.x, y: p.y + 0.06, z: p.z - 0.5 };
  if (kind === 'step') return { x: p.x, y: p.y, z: p.z - 0.4 };
  const sx = Math.abs(p.x) < 0.2 ? 0.45 : p.x; // (a driver sat in the middle: the others go either side)
  return { x: k % 2 ? -sx : sx, y: p.y, z: p.z - (k >= 2 ? (kind === 'heli' ? 1.0 : 0.95) : 0) };
}
function seatGroup(v, k) {
  const m = v.mesh, list = m.seats || (m.seats = []);
  if (list[k]) return list[k];
  const d = m.seat, g = new THREE.Group(), o = seatOffset(v.model.kind, d.position, k);
  g.position.set(o.x, o.y, o.z); g.rotation.copy(d.rotation); g.scale.copy(d.scale); g.userData = { ...d.userData };
  d.parent.add(g); return (list[k] = g);
}
// put a character in seat k (0: the driver's)
export function seatAt(v, ch, k) {
  if (!k) { v.K.seat(v, ch); return; }
  const m = v.mesh, d = m.seat; m.seat = seatGroup(v, k);
  try { v.K.seat(v, ch); } finally { m.seat = d; }
}
// a passenger aiming from their seat: the gun arm turned towards aimYaw (from the vehicle's heading) and pitched up
export function aimFromSeat(ch, aimYaw, pitch) {
  if (aimYaw == null) return;
  ch.armR.rotation.set(-Math.PI / 2 - pitch + 0.1, aimYaw, 0, 'YXZ');
}
// filled in by net/ride.js, read by the copies of the crew's vehicles (net/remote.js)
export const rideHooks = { board: null, carry: null };
