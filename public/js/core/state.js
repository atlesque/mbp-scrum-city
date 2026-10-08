// Player, camera, inventory and the other values many modules read and write.
export const P = { x: 0, z: 0, y: 0, vy: 0, yaw: 0, hp: 100, armor: 0, alive: true, c: null, moveSpeed: 0, aiming: false, aimPitch: 0, twoHand: false, lastShot: -9, grounded: true, vehicle: null, roof: null };
export const cam = { yaw: Math.PI, pitch: -0.08, dist: 4.6, shake: 0, fov: 70 };
export const inv = { money: 500, owned: { fist: true, pistol: true }, lvl: { pistol: 0 }, mag: { pistol: 12 }, ammo: {}, found: {}, cur: 'pistol' };
// played: seconds of play, counted up to HINT_FOR (game/hint.js); fiveStar: lifetime seconds spent at five stars, the player's
// five star heat highscore (synced with the rest of the save)
export const stats = { kills: 0, cops: 0, best: 0, earned: 0, played: 0, fiveStar: 0 };
export const keys = {};
// mutable game-wide values, shared across modules
export const G = {
  state: 'loading', // loading | title | play | paused | shop | dead
  time: 0,
  wanted: 0,
  heat: 0,
  fiveRun: 0, // seconds at five stars since the fifth star last lit up
  lostT: 0,
  seenNow: false,
  spawnT: 0,
  copCarT: 0,
  heliT: 0,
  heli: null,
  tankT: 6, // seconds until the army's tank rolls in at five stars (vehicles/tank.js)
  tank: null,
  fiveT: 0, // seconds at five stars in a row; SIX_STAR_AFTER of them bring the secret sixth (game/wanted.js)
  ufoT: 2, // seconds until the UFO comes at six stars (vehicles/ufo.js)
  ufo: null,
  shootersNow: 0,
  reloadT: 0,
  fireCd: 0,
  spin: 0,
  scope: 0, // sniper zoom step (combat/scope.js); rescope is the step to return to once the bolt is back
  rescope: 0,
  deadT: 0,
  toastT: 0,
  bigT: 0,
  hitT: 0,
  radioT: 0,
  firstPlay: true,
  hudCache: '',
  shop: null, // the shop entity whose menu is open
  stairs: false, // taking the stairs to or from a roof (the screen is faded out)
  near: [], // interactions the player can trigger right now, best first
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
