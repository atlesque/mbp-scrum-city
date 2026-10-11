import { describe, expect, it } from 'vitest';
import { MAP_BOUNDS, MAX_ZOOM_X, clampView, fitZoom, openView, panBy, reachedWaypoint, toScreen, toWorld, zoomAt } from '../../public/js/world/mapview.js';
import { ACTIONS, PRESETS, sanitizeBinds } from '../../public/js/core/keymap.js';

const W = 1280, H = 720;
const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('world map view', () => {
  it('fits the whole city on screen at the widest zoom', () => {
    const v = clampView({ cx: 0, cz: 0, zoom: 0.01 }, W, H);
    close(v.zoom, fitZoom(W, H));
    const [x0, y0] = toScreen(v, W, H, MAP_BOUNDS.x0, MAP_BOUNDS.z0), [x1, y1] = toScreen(v, W, H, MAP_BOUNDS.x1, MAP_BOUNDS.z1);
    expect(x0).toBeGreaterThanOrEqual(-1e-6); expect(y0).toBeGreaterThanOrEqual(-1e-6);
    expect(x1).toBeLessThanOrEqual(W + 1e-6); expect(y1).toBeLessThanOrEqual(H + 1e-6);
  });
  it('zooms in no further than MAX_ZOOM_X past the whole city', () => {
    close(clampView({ cx: 0, cz: 0, zoom: 1e3 }, W, H).zoom, fitZoom(W, H) * MAX_ZOOM_X);
  });
  it('turns screen points back into the same world points', () => {
    const v = { cx: 30, cz: -40, zoom: 3.2 };
    const [sx, sy] = toScreen(v, W, H, 12.5, 80), [x, z] = toWorld(v, W, H, sx, sy);
    close(x, 12.5); close(z, 80);
  });
  it('keeps the spot under the cursor in place while zooming', () => {
    const v = openView(0, 0, W, H), before = toWorld(v, W, H, 300, 200), after = toWorld(zoomAt(v, W, H, 300, 200, 1.5), W, H, 300, 200);
    close(before[0], after[0]); close(before[1], after[1]);
  });
  it('opens around the player, but never scrolled off the map', () => {
    const mid = openView(-25, 7, W, H);
    expect(mid.zoom).toBeGreaterThan(fitZoom(W, H));
    const v = { ...mid, zoom: fitZoom(W, H) * 4 }, near = clampView({ ...v, cx: -25, cz: 7 }, W, H);
    close(near.cx, -25); close(near.cz, 7);
    const corner = openView(-500, 500, W, H), [lx] = toWorld(corner, W, H, 0, 0), [, bz] = toWorld(corner, W, H, 0, H);
    close(lx, MAP_BOUNDS.x0); close(bz, MAP_BOUNDS.z1);
  });
  it('drags the map with the mouse', () => {
    const v = { cx: 0, cz: 0, zoom: fitZoom(W, H) * 3 }, p = panBy(v, W, H, 60, -30);
    close(p.cx, -60 / v.zoom); close(p.cz, 30 / v.zoom);
  });
  it('counts a waypoint as reached only up close', () => {
    expect(reachedWaypoint(null, 0, 0)).toBe(false);
    expect(reachedWaypoint({ x: 0, z: 0 }, 5, 5)).toBe(true);
    expect(reachedWaypoint({ x: 0, z: 0 }, 40, 0)).toBe(false);
  });
  it('has a rebindable key, the M on both layouts', () => {
    expect(ACTIONS.some(a => a.id === 'map')).toBe(true);
    expect(PRESETS.qwerty.map).toBe('KeyM'); expect(PRESETS.azerty.map).toBe('Semicolon'); expect(PRESETS.qwerty.radio).toBe('KeyN');
  });
  it('moves a saved radio off M so M opens the map, but keeps a radio the player put there', () => {
    const old = { ...PRESETS.qwerty, radio: 'KeyM' }; delete old.map;
    expect(sanitizeBinds(old, 'qwerty')).toMatchObject({ radio: 'KeyN', map: 'KeyM' });
    const oldAz = { ...PRESETS.azerty, radio: 'Semicolon' }; delete oldAz.map;
    expect(sanitizeBinds(oldAz, 'azerty')).toMatchObject({ radio: 'KeyN', map: 'Semicolon' });
    expect(sanitizeBinds({ ...PRESETS.qwerty, radio: 'KeyM', map: 'KeyB' }, 'qwerty')).toMatchObject({ radio: 'KeyM', map: 'KeyB' });
  });
});
