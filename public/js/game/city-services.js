import { repairTires } from '../vehicles/tires.js';
import { kb } from '../core/controls.js';
import { emit, on } from '../core/events.js';
import { G, P, inv, stats } from '../core/state.js';
import { clock } from '../core/util.js';
import { addEntity, all } from '../entities/registry.js';
import { showBig, toast } from '../ui/hud.js';
import { makeServiceMarker, moveDeliveryMarker } from '../world/city-services.js';

import { COURIER, GARAGE, DELIVERY_STOPS } from '../data/city-services.js';
export { COURIER, GARAGE } from '../data/city-services.js';

let job = null, route = 0, panel = null;
const civilian = v => v && !v.dead && !(v.burnT > 0) && !v.model.police && !v.model.siren;
const courierRide = v => civilian(v) && ['car', 'bike'].includes(v.model.kind);
const near = (p, s, radius = 6) => p.y < 2 && Math.hypot(p.x - s.x, p.z - s.z) < radius;
export const courierJob = () => job;

export function startCourier() {
  if (job || !P.alive || G.state !== 'play' || !near(P, COURIER) || !courierRide(P.vehicle) || G.wanted) return false;
  // Rotate through routes; each run has three distinct stops, never the depot itself.
  const stops = Array.from({ length: 3 }, (_, i) => DELIVERY_STOPS[(route + i * 2) % DELIVERY_STOPS.length]); route++;
  job = { vehicle: P.vehicle, stops, stop: 0, left: 110, condition: P.vehicle.hp / P.vehicle.model.hp };
  toast('Neon Express: three deliveries in 1:50. Stop inside each gold ring. Keep this ride in one piece.', 6);
  updateCityServicesHUD(); return true;
}
export function cancelCourier(message) {
  if (!job) return;
  job = null; moveDeliveryMarker(null); if (panel) panel.hidden = true;
  if (message) toast(message, 5);
}
on('player:died', () => cancelCourier('Delivery cancelled.'));

export function updateCityServicesHUD() {
  moveDeliveryMarker(job ? job.stops[job.stop] : null);
  if (!panel) return;
  panel.hidden = !job || G.state !== 'play' || !!P.club;
  if (!job) return;
  const stop = job.stops[job.stop], distance = Math.round(Math.hypot(P.x - stop.x, P.z - stop.z));
  const instruction = P.vehicle !== job.vehicle ? 'Return to your delivery vehicle' : G.wanted ? 'Lose the cops before delivering' : 'Stop in the gold ring';
  panel.textContent = `NEON EXPRESS · ${job.stop + 1}/3 · ${clock(Math.ceil(job.left))}\n${stop.name} · ${distance} m\n${instruction} · depot ${kb('use')} to cancel`;
}
export function updateCourier(dt) {
  if (!job || G.state !== 'play' || P.club) { updateCityServicesHUD(); return; }
  if (!P.alive || job.vehicle.dead || job.vehicle.removed || job.vehicle.burnT > 0) { cancelCourier('Delivery failed: your ride is out of action.'); return; }
  job.left -= dt; job.condition = Math.min(job.condition, Math.max(0, job.vehicle.hp / job.vehicle.model.hp));
  if (job.left <= 0) { cancelCourier('Delivery failed: time ran out.'); return; }
  const stop = job.stops[job.stop];
  if (P.vehicle === job.vehicle && near(P, stop, 5) && Math.abs(job.vehicle.v) < 1.5 && Math.abs(job.vehicle.slip || 0) < 1.5 && !(job.vehicle.air > 0) && !G.wanted) {
    job.stop++;
    if (job.stop === job.stops.length) {
      const pay = 450 + Math.round(job.left * 3) + Math.round(job.condition * 250);
      inv.money += pay; stats.earned += pay;
      cancelCourier(); showBig(`Delivery complete · $${pay}`);
      emit('courier:complete', { pay }); return;
    }
    toast(`Delivered. Next stop: ${job.stops[job.stop].name}.`, 3);
  }
  updateCityServicesHUD();
}

export function garageReason() {
  const v = P.vehicle;
  if (!P.alive || G.state !== 'play' || !near(P, GARAGE)) return 'Drive into the garage bay';
  if (!civilian(v) || v.model.kind !== 'car') return 'Civilian cars only; no emergency vehicles, fire or wrecks';
  if (Math.abs(v.v) >= 1.5 || Math.abs(v.slip || 0) >= 1.5 || v.air > 0) return 'Stop the car in the bay';
  if (G.wanted >= 4) return 'Garage closed at four stars or more';
  // lostT advances only while the law has no line of sight. A little unseen time avoids drive-through escapes.
  if (G.wanted && (G.seenNow || G.lostT < 3 || all('npc').some(n => n.faction === 'law' && n.alive && !n.leaving && n.los && Math.hypot(n.x - P.x, n.z - P.z) < 70))) return 'Lose sight of the law for three seconds first';
  if (G.time < (v.resprayUntil || 0)) return 'Fresh paint is still drying';
  if (inv.money < GARAGE.price) return `You need $${GARAGE.price}`;
  return null;
}

// Car bodies start with a painted panel. Only replace that colour, keeping trim, glass and wheels intact.
// Detailed models share geometry; clone once per car so a respray never changes the rest of the traffic.
export function repaintCar(v) {
  const m = v.mesh.m;
  if (!v.resprayGeometry) { m.geometry = m.geometry.clone(); v.resprayGeometry = m.geometry; }
  const colors = m.geometry.attributes.color, old = [colors.getX(0), colors.getY(0), colors.getZ(0)];
  const paints = ['#ff7eb6', '#3fd6c8', '#7a5cff', '#ffb347'];
  v.paintIndex = ((v.paintIndex ?? -1) + 1) % paints.length;
  let paint = new THREE.Color(paints[v.paintIndex]);
  if (Math.abs(old[0] - paint.r) + Math.abs(old[1] - paint.g) + Math.abs(old[2] - paint.b) < 0.01) { v.paintIndex = (v.paintIndex + 1) % paints.length; paint = new THREE.Color(paints[v.paintIndex]); }
  for (let i = 0; i < colors.count; i++) if (Math.abs(colors.getX(i) - old[0]) + Math.abs(colors.getY(i) - old[1]) + Math.abs(colors.getZ(i) - old[2]) < 0.001) colors.setXYZ(i, paint.r, paint.g, paint.b);
  colors.needsUpdate = true;
}
export function useGarage() {
  const reason = garageReason(); if (reason) { toast(reason, 3); return false; }
  const v = P.vehicle; repaintCar(v); inv.money -= GARAGE.price; v.hp = v.model.hp; repairTires(v); v.resprayUntil = G.time + GARAGE.cooldown;
  if (G.wanted) {
    G.wanted = G.heat = G.lostT = G.fiveT = G.fiveRun = 0;
    for (const n of all('npc')) if (n.faction === 'law') n.leaving = true;
    emit('wanted:lost', {});
  }
  toast('Fresh paint, full repair. Enjoy the ride.', 4); emit('garage:respray', { vehicle: v, price: GARAGE.price }); return true;
}

export function serviceInteraction(type, p) {
  const s = type === 'courier' ? COURIER : GARAGE, dist = Math.hypot(p.x - s.x, p.z - s.z);
  if (!near(p, s)) return null;
  const label = type === 'courier' ? (job ? 'cancel the delivery run' : 'start a courier run · civilian car or bike · no stars') : (garageReason() || `repair & respray · $${GARAGE.price}`);
  return { keys: ['use'], priority: 10, dist, prompt: `<kbd>${kb('use')}</kbd> ${s.name}: ${label}`, run: () => type === 'courier' ? (job ? cancelCourier('Delivery cancelled.') : startCourier() || toast('Bring a civilian car or bike with no wanted stars.', 4)) : useGarage() };
}
export function spawnCityServices() {
  panel = document.createElement('div'); panel.id = 'courierStatus'; panel.hidden = true;
  panel.style.cssText = 'position:fixed;top:290px;right:24px;max-width:min(330px,45vw);padding:12px 16px;background:rgba(23,15,35,.88);border-left:3px solid #ffd23e;color:#fff1ca;font:600 15px/1.5 "Chakra Petch",sans-serif;white-space:pre-line;pointer-events:none;z-index:5';
  document.body.append(panel);
  for (const type of ['courier', 'garage']) {
    const s = type === 'courier' ? COURIER : GARAGE;
    makeServiceMarker(s, type);
    addEntity({ kind: 'service', ...s, inVehicle: true, blipLayer: 2, interaction: p => serviceInteraction(type, p),
      blip: r => r.glyph(s.x, s.z, type === 'courier' ? 'D' : 'G', s.color),
      update: type === 'courier' ? updateCourier : undefined });
  }
  addEntity({ kind: 'delivery', blipLayer: 3, blip(r) { if (job) { const s = job.stops[job.stop]; r.dot(s.x, s.z, COURIER.color, 10, true, 'sq'); } } });
}
