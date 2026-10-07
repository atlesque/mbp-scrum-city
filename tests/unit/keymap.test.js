import { beforeEach, describe, expect, it } from 'vitest';
import { ACTIONS, PRESETS, isReserved, keyLabel, rebind, sanitizeBinds } from '../../public/js/core/keymap.js';
import { DEFAULTS, SETTINGS_KEY, loadSettings, sanitize, setSetting, settings } from '../../public/js/core/settings.js';
import { actionFor, held, kb, kbMove } from '../../public/js/core/controls.js';
import { keys } from '../../public/js/core/state.js';

const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

describe('key map', () => {
  beforeEach(() => { delete store[SETTINGS_KEY]; Object.assign(settings, DEFAULTS); for (const k in keys) keys[k] = false; });

  it('gives every action a distinct key in each preset', () => {
    for (const p of Object.values(PRESETS)) {
      expect(Object.keys(p).sort()).toEqual(ACTIONS.map(a => a.id).sort());
      expect(new Set(Object.values(p)).size).toBe(ACTIONS.length);
      for (const code of Object.values(p)) expect(isReserved(code)).toBe(false);
    }
  });
  it('names keys as printed on each layout', () => {
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyM'].map(c => keyLabel(c))).toEqual(['W', 'A', 'S', 'D', 'Q', 'M']);
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'Semicolon'].map(c => keyLabel(c, 'azerty'))).toEqual(['Z', 'Q', 'S', 'D', 'A', 'M']);
    expect(keyLabel('Space', 'azerty')).toBe('Space');
  });
  it('the AZERTY preset reads ZQSD, A for melee and M for the radio', () => {
    setSetting('layout', 'azerty');
    expect(settings.binds).toEqual(PRESETS.azerty);
    expect(kbMove()).toBe('ZQSD'); expect(kb('melee')).toBe('A'); expect(kb('radio')).toBe('M');
    expect(actionFor('Semicolon')).toBe('radio'); expect(actionFor('KeyM')).toBe(null);
    setSetting('layout', 'qwerty');
    expect(kbMove()).toBe('WASD'); expect(kb('radio')).toBe('M');
  });
  it('rebinding swaps with whatever had the key, and is saved', () => {
    setSetting('binds', rebind(settings.binds, 'jump', 'KeyF'));
    expect(settings.binds.jump).toBe('KeyF'); expect(settings.binds.ride).toBe('Space');
    keys.KeyF = true; expect(held('jump')).toBe(true); expect(held('ride')).toBe(false);
    Object.assign(settings, DEFAULTS); loadSettings();
    expect(settings.binds.jump).toBe('KeyF'); expect(actionFor('Space')).toBe('ride');
  });
  it('arrow keys still drive whatever the bindings', () => {
    setSetting('binds', rebind(settings.binds, 'forward', 'KeyI'));
    keys.ArrowUp = true; expect(held('forward')).toBe(true);
    keys.ArrowUp = false; keys.KeyW = true; expect(held('forward')).toBe(false);
  });
  it('repairs junk, doubles and reserved keys from the preset', () => {
    expect(sanitizeBinds(null)).toEqual(PRESETS.qwerty);
    expect(sanitizeBinds('nope', 'azerty')).toEqual(PRESETS.azerty);
    const b = sanitizeBinds({ forward: 'KeyE', use: 'KeyE', reload: 'Digit3', pause: 'Escape', jump: 42, melee: '<script>' });
    expect(b.forward).toBe('KeyE'); expect(b.use).toBe(null); // E is taken and the preset key for use is E
    expect(b.reload).toBe('KeyR'); expect(b.pause).toBe('KeyP'); expect(b.jump).toBe('Space'); expect(b.melee).toBe('KeyQ');
    expect(sanitize({ layout: 'azerty' }).binds).toEqual(PRESETS.azerty);
  });
});
