import { on } from './events.js';
import { ALT, keyLabel } from './keymap.js';
import { settings } from './settings.js';
import { keys } from './state.js';

// ================= CONTROLS =================
// The game asks about actions, not keys: held('forward') while driving, actionFor(e.code) on a key press,
// kb('ride') for the key name in a prompt or tip. The bindings live in settings.binds (core/keymap.js).
export const held = action => !!(keys[settings.binds[action]] || keys[ALT[action]]);
export function actionFor(code) {
  for (const id in settings.binds) if (settings.binds[id] === code) return id;
  return null;
}
export const kb = action => keyLabel(settings.binds[action], settings.layout);
export const kbMove = () => ['forward', 'left', 'back', 'right'].map(kb).join('');
export const labelOf = code => keyLabel(code, settings.layout);

// <kbd data-kb="ride"> anywhere on the page shows the key for that action (data-kb="move" the four movement keys)
export function paintKeys() {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll('[data-kb]')) el.textContent = el.dataset.kb === 'move' ? kbMove() : kb(el.dataset.kb);
}
on('settings:changed', ({ id }) => { if (id === 'binds' || id === 'layout') paintKeys(); });

// On a first visit, ask the browser what the keys read (Chromium shares it) and start on AZERTY for an AZERTY board.
// Key names then follow the chosen preset, so picking one always shows its letters.
export async function detectLayout(firstVisit, choose) {
  try {
    if (!firstVisit || typeof navigator === 'undefined' || !navigator.keyboard?.getLayoutMap) return;
    const printed = await navigator.keyboard.getLayoutMap();
    if (printed.get('KeyQ') === 'a' && printed.get('KeyW') === 'z') choose('azerty');
  } catch (e) {}
}
