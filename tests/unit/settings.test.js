import { beforeEach, describe, expect, it } from 'vitest';
import { on } from '../../public/js/core/events.js';
import { DEFAULTS, DENSITY, DRAW_DISTANCE, RENDER_SCALE, SETTINGS, SETTINGS_KEY, loadSettings, resetSettings, sanitize, setSetting, settings } from '../../public/js/core/settings.js';

const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

describe('settings', () => {
  beforeEach(() => { delete store[SETTINGS_KEY]; Object.assign(settings, DEFAULTS); });

  it('has a valid default and a unique id for every row', () => {
    expect(new Set(SETTINGS.map(s => s.id)).size).toBe(SETTINGS.length);
    expect(sanitize(DEFAULTS)).toEqual(DEFAULTS);
    for (const s of SETTINGS) expect(['sound', 'graphics', 'gameplay']).toContain(s.tab);
  });
  it('gives every choice a meaning', () => {
    const maps = { quality: RENDER_SCALE, drawDistance: DRAW_DISTANCE, density: DENSITY };
    for (const [id, map] of Object.entries(maps)) for (const [v] of SETTINGS.find(s => s.id === id).options) expect(map[v]).toBeTypeOf('number');
  });
  it('falls back to the default for junk, and clamps numbers', () => {
    expect(sanitize(null)).toEqual(DEFAULTS);
    const d = sanitize({ sound: 'yes', sfxVolume: 7, musicVolume: -1, fov: NaN, quality: 'potato', units: 'mph', invertY: true });
    expect(d).toEqual({ ...DEFAULTS, sfxVolume: 1, musicVolume: 0, units: 'mph', invertY: true });
  });
  it('saves each change and loads it back after a reload', () => {
    const seen = []; const off = on('settings:changed', e => seen.push(e));
    setSetting('musicVolume', 0.4); setSetting('sound', false); setSetting('musicVolume', 0.4);
    off();
    expect(seen).toEqual([{ id: 'musicVolume', value: 0.4 }, { id: 'sound', value: false }]);
    Object.assign(settings, DEFAULTS);
    loadSettings();
    expect(settings.musicVolume).toBe(0.4); expect(settings.sound).toBe(false);
  });
  it('survives a corrupt store and resets to defaults', () => {
    store[SETTINGS_KEY] = '{not json';
    expect(loadSettings()).toEqual(DEFAULTS);
    setSetting('fov', 85); resetSettings();
    expect(settings).toEqual(DEFAULTS); expect(JSON.parse(store[SETTINGS_KEY])).toEqual(DEFAULTS);
  });
});
