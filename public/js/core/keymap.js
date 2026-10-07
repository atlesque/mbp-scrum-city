// ================= KEY MAP =================
// The keyboard actions a player can rebind, the QWERTY and AZERTY presets, and how a key is named on screen.
// Keys are stored as KeyboardEvent.code, which names the physical key by where it sits on a US keyboard,
// so the key under the left hand that reads Z on an AZERTY board is 'KeyW'. A preset therefore keeps the
// same hand position on both layouts; what changes is the name shown for each key, and the radio,
// which follows the letter M (it sits right of L on an AZERTY board).
// To add an action: add a row here, then read held('<id>') or compare actionFor(e.code) where it matters (core/controls.js).
export const ACTIONS = [
  { id: 'forward', label: 'Forward, gas, throttle', group: 'Move' },
  { id: 'back', label: 'Back, brake', group: 'Move' },
  { id: 'left', label: 'Left, steer, lean', group: 'Move' },
  { id: 'right', label: 'Right, steer, lean', group: 'Move' },
  { id: 'sprint', label: 'Sprint, boost', group: 'Move' },
  { id: 'jump', label: 'Jump, handbrake, jetpack', group: 'Move' },
  { id: 'use', label: 'Gun shop, roof doors', group: 'Actions' },
  { id: 'ride', label: 'Ride, drive, get out', group: 'Actions' },
  { id: 'reload', label: 'Reload', group: 'Actions' },
  { id: 'melee', label: 'Fists and melee weapons', group: 'Actions' },
  { id: 'radio', label: 'Radio on / off', group: 'Actions' },
  { id: 'pause', label: 'Pause', group: 'Actions' },
];
const QWERTY = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space', use: 'KeyE', ride: 'KeyF', reload: 'KeyR', melee: 'KeyQ', radio: 'KeyM', pause: 'KeyP' };
export const PRESETS = { qwerty: QWERTY, azerty: { ...QWERTY, radio: 'Semicolon' } };
// keys that work alongside the binding and can't be changed
export const ALT = { forward: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', sprint: 'ShiftRight' };
// Esc always pauses or backs out, and the number row always picks a weapon
export const isReserved = code => code === 'Escape' || /^(Digit|Numpad)[0-9]$/.test(code);

// What is printed on each key. Letters and digits follow from the code; this covers the rest and the AZERTY moves.
const NAMES = {
  Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'Alt Gr',
  MetaLeft: 'Cmd', MetaRight: 'R-Cmd', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', Backspace: 'Backspace', Escape: 'Esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', IntlBackslash: '\\',
};
const AZERTY_NAMES = { KeyQ: 'A', KeyA: 'Q', KeyW: 'Z', KeyZ: 'W', KeyM: ',', Semicolon: 'M', Comma: ';', Period: ':', Slash: '!', Quote: 'ù', BracketLeft: '^', BracketRight: '$', Backslash: '*', Backquote: '²', Minus: ')', IntlBackslash: '<' };
// `printed` is what the browser says the key reads on this keyboard (navigator.keyboard), when it can tell
export function keyLabel(code, layout = 'qwerty', printed = null) {
  if (!code) return '—';
  if (printed && printed.get(code) && !/^(Shift|Control|Alt|Meta|Arrow)/.test(code) && code !== 'Space') return printed.get(code).toUpperCase();
  if (layout === 'azerty' && AZERTY_NAMES[code]) return AZERTY_NAMES[code];
  if (NAMES[code]) return NAMES[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit([0-9])$/.exec(code); if (m) return m[1];
  m = /^Numpad(.+)$/.exec(code); if (m) return 'Num ' + m[1];
  return code;
}

// Keeps a valid code for every action, falling back to the preset for anything missing or mistyped;
// a key bound twice keeps its first action and the later one goes back to the preset (or stays empty).
export function sanitizeBinds(raw, layout = 'qwerty') {
  const preset = PRESETS[layout] || QWERTY, out = {}, used = new Set();
  for (const { id } of ACTIONS) {
    const v = raw && typeof raw === 'object' ? raw[id] : undefined;
    out[id] = typeof v === 'string' && /^[A-Za-z0-9]{1,24}$/.test(v) && !isReserved(v) && !used.has(v) ? v : null;
    if (out[id]) used.add(out[id]);
  }
  for (const { id } of ACTIONS) if (!out[id] && !used.has(preset[id])) { out[id] = preset[id]; used.add(preset[id]); }
  return out;
}

// Binds `code` to `action`; whatever had that key takes the action's old key, so nothing is left doubled up.
export function rebind(binds, action, code) {
  const next = { ...binds }, prev = next[action];
  for (const id in next) if (id !== action && next[id] === code) next[id] = prev;
  next[action] = code;
  return next;
}
