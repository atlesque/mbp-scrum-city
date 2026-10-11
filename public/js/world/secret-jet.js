import { all } from '../entities/registry.js';
import { spawnVehicle } from '../vehicles/vehicle.js';

// A secluded stretch of coast, away from the starting street. Discovered only when approached.
export const SECRET_JET = { x: 222, z: 175, yaw: Math.PI };
export function spawnSecretJet() {
  const existing = all('vehicle').find(v => v.model.id === 'jet'); if (existing) return existing;
  const v = spawnVehicle('jet', SECRET_JET.x, SECRET_JET.z, SECRET_JET.yaw); v.home = true; return v;
}
