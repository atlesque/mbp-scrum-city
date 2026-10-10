import { emit } from './events.js';
import { PRESETS, sanitizeBinds } from './keymap.js';

// ================= SETTINGS =================
// Player preferences, kept in their own localStorage key so they survive a lost or reset save.
// Each row is one control on the Settings screen. Add a row here, then read `settings.<id>` where it matters
// (or listen for `settings:changed`); the screen, saving and validation pick it up on their own.
//   type 'toggle'  true / false
//   type 'range'   a number from min to max in steps of step; fmt turns it into the label shown beside the slider
//   type 'choice'  one of options: [[value, label], ...]
//   type 'binds'   the key for each action in core/keymap.js (drawn by the Controls tab itself)
// A row's optional then(value) runs after it changes.
export const SETTINGS_KEY = 'neonbay86.settings';
const pct = v => Math.round(v * 100) + '%';
export const SETTINGS = [
  { id: 'sound', tab: 'sound', label: 'Sound', type: 'toggle', def: true },
  { id: 'sfxVolume', tab: 'sound', label: 'Effects volume', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
  { id: 'musicVolume', tab: 'sound', label: 'Music volume', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },
  { id: 'ambVolume', tab: 'sound', label: 'City ambience volume', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct },

  { id: 'quality', tab: 'graphics', label: 'Render quality', type: 'choice', def: 'high', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
  { id: 'drawDistance', tab: 'graphics', label: 'Draw distance', type: 'choice', def: 'normal', options: [['near', 'Near'], ['normal', 'Normal'], ['far', 'Far']] },
  { id: 'water', tab: 'graphics', label: 'Animated waves', type: 'toggle', def: true },

  { id: 'sensitivity', tab: 'gameplay', label: 'Mouse sensitivity', type: 'range', min: 0.25, max: 2.5, step: 0.05, def: 1, fmt: pct },
  { id: 'invertY', tab: 'gameplay', label: 'Invert look up / down', type: 'toggle', def: false },
  { id: 'fov', tab: 'gameplay', label: 'Field of view', type: 'range', min: 60, max: 90, step: 1, def: 70, fmt: v => v + '°' },
  { id: 'shake', tab: 'gameplay', label: 'Camera shake', type: 'toggle', def: true },
  { id: 'density', tab: 'gameplay', label: 'Crowds and traffic', type: 'choice', def: 'normal', options: [['light', 'Light'], ['normal', 'Normal'], ['busy', 'Busy']] },
  { id: 'units', tab: 'gameplay', label: 'Speed', type: 'choice', def: 'kmh', options: [['kmh', 'km/h'], ['mph', 'mph']] },

  // picking a keyboard loads its preset; the keys can then be changed one by one
  { id: 'layout', tab: 'controls', label: 'Keyboard', type: 'choice', def: 'qwerty', options: [['qwerty', 'QWERTY'], ['azerty', 'AZERTY']], then: v => setSetting('binds', PRESETS[v]) },
  { id: 'binds', tab: 'controls', label: 'Keys', type: 'binds', def: PRESETS.qwerty },
];
// what the choices mean to the game
export const RENDER_SCALE = { low: 0.6, medium: 1, high: 1.5, ultra: 2 }; // cap on the device pixel ratio
export const DRAW_DISTANCE = { near: 180, normal: 290, far: 420 }; // where the fog closes in, in metres
export const DENSITY = { light: 0.6, normal: 1, busy: 1.3 }; // scales how many people and cars the city keeps around

export const DEFAULTS = Object.fromEntries(SETTINGS.map(s => [s.id, s.def]));
export const settings = { ...DEFAULTS };

// Keeps what is valid in `raw` and falls back to the default for anything missing, mistyped or out of range.
export function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const s of SETTINGS) {
    const v = raw[s.id];
    if (s.type === 'toggle' && typeof v === 'boolean') out[s.id] = v;
    else if (s.type === 'range' && typeof v === 'number' && Number.isFinite(v)) out[s.id] = Math.min(s.max, Math.max(s.min, v));
    else if (s.type === 'choice' && s.options.some(o => o[0] === v)) out[s.id] = v;
    else if (s.type === 'binds') out[s.id] = sanitizeBinds(v, out.layout);
  }
  return out;
}

export function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) {}
  Object.assign(settings, sanitize(raw));
  return settings;
}
export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}
export function setSetting(id, value) {
  const next = sanitize({ ...settings, [id]: value });
  if (JSON.stringify(next[id]) === JSON.stringify(settings[id])) return;
  settings[id] = next[id]; saveSettings();
  emit('settings:changed', { id, value: settings[id] });
  SETTINGS.find(s => s.id === id).then?.(settings[id]);
}
export function resetSettings() {
  for (const s of SETTINGS) setSetting(s.id, s.def);
}
