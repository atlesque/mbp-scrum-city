// ================= RELOADS =================
// How each gun reloads: `anim` is a move in RELOAD_ANIMS (characters/reload.js) and `sound` a file in
// public/sfx/ (without .mp3; sources and licences in public/sfx/CREDITS.md). A new gun is one line here.
// A gun without a line reloads with the 'mag' move and the synthesized click.
export const RELOADS = {
  pistol: { anim: 'pistol', sound: 'reload-pistol' },
  smg: { anim: 'mag', sound: 'reload-smg' },
  shotgun: { anim: 'pump', sound: 'reload-shotgun' },
  rifle: { anim: 'mag', sound: 'reload-rifle' },
  minigun: { anim: 'box', sound: 'reload-minigun' },
  rpg: { anim: 'tube', sound: 'reload-rpg' },
  sniper: { anim: 'bolt', sound: 'reload-sniper' },
  laser: { anim: 'mag', sound: 'reload-smg' }, // a power cell slapped in like a magazine
};
export const SFX_DIR = '/sfx/';
export const reloadOf = id => RELOADS[id] || { anim: 'mag', sound: null };
