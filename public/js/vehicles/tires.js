// Per-vehicle handling changes: never alter a kind or model shared with other cars.
export function punctureTires(v) {
  if (v.dead || v.tiresFlat || v.K.tracks || v.K.flies || (v.air || 0) > 0.4) return false;
  v.tireHandling = { ...v.H }; v.tireTop = v.top; v.tiresFlat = true;
  for (const key of ['top', 'boostTop', 'grip', 'gripFast']) if (Number.isFinite(v.H[key])) v.H[key] *= key.includes('grip') ? 0.4 : 0.45;
  v.top = Math.min(v.top, v.H.top); v.v *= 0.65; v.hp = Math.max(1, v.hp - 5);
  return true;
}
export function repairTires(v) {
  if (!v.tiresFlat) return false;
  Object.assign(v.H, v.tireHandling); v.top = v.tireTop; delete v.tireTop; delete v.tireHandling; v.tiresFlat = false; return true;
}
