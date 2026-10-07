import { on } from './events.js';
import { ALT, keyLabel } from './keymap.js';
import { settings } from './settings.js';
import { keys } from './state.js';

// ================= CONTROLS =================
// The game asks about actions, not keys: held('forward') while driving, actionFor(e.code) on a key press,
// kb('ride') for the key name in a prompt or tip. The bindings live in settings.binds (core/keymap.js).
let printed = null; // the browser's own key names for this keyboard, where it shares them (Chromium)

export const held = action => !!(keys[settings.binds[action]] || keys[ALT[action]]);
export function actionFor(code) {
  for (const id in settings.binds) if (settings.binds[id] === code) return id;
  return null;
}
export const kb = action => keyLabel(settings.binds[action], settings.layout, printed);
export const kbMove = () => ['forward', 'left', 'back', 'right'].map(kb).join('');
export const labelOf = code => keyLabel(code, settings.layout, printed);

// <kbd data-kb="ride"> anywhere on the page shows the key for that action (data-kb="move" the four movement keys)
export function paintKeys() {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll('[data-kb]')) el.textContent = el.dataset.kb === 'move' ? kbMove() : kb(el.dataset.kb);
}
on('settings:changed', ({ id }) => { if (id === 'binds' || id === 'layout') paintKeys(); });

// Ask the browser what the keys read; on a first visit with an AZERTY board, start on the AZERTY preset.
export async function detectLayout(firstVisit, choose) {
  try {
    if (typeof navigator === 'undefined' || !navigator.keyboard?.getLayoutMap) return;
    printed = await navigator.keyboard.getLayoutMap();
    if (firstVisit && printed.get('KeyQ') === 'a' && printed.get('KeyW') === 'z') choose('azerty');
  } catch (e) {}
  paintKeys();
}
