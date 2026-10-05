export const P = { x: 0, z: 0, y: 0, vy: 0, yaw: 0, hp: 100, armor: 0, alive: true, c: null, moveSpeed: 0, aiming: false, aimPitch: 0, twoHand: false, lastShot: -9, grounded: true };
export const cam = { yaw: Math.PI, pitch: -0.08, dist: 4.6, shake: 0, fov: 70 };
export const inv = { money: 500, owned: { pistol: true }, lvl: { pistol: 0 }, mag: { pistol: 12 }, ammo: {}, cur: 'pistol' };
export const stats = { kills: 0, cops: 0, best: 0, earned: 0 };
export const peds = [], enemies = [], cars = [], pickups = [], rockets = [], parkedCars = [], bikes = [], riders = [];
export const keys = {};
// mutable game-wide values, shared across modules
export const G = {
  state: 'loading',
  shootersNow: 0,
  wanted: 0,
  heat: 0,
  lostT: 0,
  seenNow: false,
  spawnT: 0,
  copCarT: 0,
  heliT: 0,
  heli: null,
  reloadT: 0,
  fireCd: 0,
  spin: 0,
  time: 0,
  deadT: 0,
  toastT: 0,
  bigT: 0,
  hitT: 0,
  firstPlay: true,
  hudCache: '',
  radioT: 0,
};
// mouse and pointer-lock input
export const I = {
  clickQ: 0,
  mouseL: false,
  mouseR: false,
  locked: false,
  noLock: false,
  mouseDX: 0,
  mouseDY: 0,
  lockFails: 0,
  lockFromClick: false,
};
