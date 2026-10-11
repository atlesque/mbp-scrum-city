// ================= WORLD MAP VIEW =================
// Where the full-screen map (ui/worldmap.js) looks: a centre in world metres and a zoom in screen pixels per metre.
// North is up, so world x runs right and world z runs down, the same way the radar's map image is drawn (world/radar.js).
// Kept free of the page so the pan and zoom rules can be tested on their own.

// the part of the world worth showing: the walled city, the beach and a strip of sea
export const MAP_BOUNDS = { x0: -222, x1: 275, z0: -222, z1: 222 };
export const MAX_ZOOM_X = 5; // how far in past the whole-city view
export const OPEN_ZOOM_X = 1.6; // the zoom the map opens at, around the player

// the zoom that fits the whole of MAP_BOUNDS on a w × h screen
export const fitZoom = (w, h) => Math.min(w / (MAP_BOUNDS.x1 - MAP_BOUNDS.x0), h / (MAP_BOUNDS.z1 - MAP_BOUNDS.z0));

// Keeps the zoom between the whole city and MAX_ZOOM_X times closer, and the view from drifting off the map:
// a side narrower than the screen stays centred, a wider one can't scroll past its edge.
export function clampView(v, w, h) {
  const min = fitZoom(w, h), zoom = Math.min(min * MAX_ZOOM_X, Math.max(min, v.zoom));
  const axis = (c, lo, hi, px) => {
    const half = px / 2 / zoom;
    return hi - lo <= half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c));
  };
  return { cx: axis(v.cx, MAP_BOUNDS.x0, MAP_BOUNDS.x1, w), cz: axis(v.cz, MAP_BOUNDS.z0, MAP_BOUNDS.z1, h), zoom };
}
// the view the map opens with: closer in than the whole city, the player in the middle as far as the edges allow
export const openView = (x, z, w, h) => clampView({ cx: x, cz: z, zoom: fitZoom(w, h) * OPEN_ZOOM_X }, w, h);

export const toScreen = (v, w, h, x, z) => [w / 2 + (x - v.cx) * v.zoom, h / 2 + (z - v.cz) * v.zoom];
export const toWorld = (v, w, h, sx, sy) => [v.cx + (sx - w / 2) / v.zoom, v.cz + (sy - h / 2) / v.zoom];

// zooms by `factor` keeping the spot under the cursor (sx, sy) where it is
export function zoomAt(v, w, h, sx, sy, factor) {
  const [x, z] = toWorld(v, w, h, sx, sy), zoom = clampView({ ...v, zoom: v.zoom * factor }, w, h).zoom;
  return clampView({ cx: x - (sx - w / 2) / zoom, cz: z - (sy - h / 2) / zoom, zoom }, w, h);
}
// drags the map by (dx, dy) screen pixels
export const panBy = (v, w, h, dx, dy) => clampView({ cx: v.cx - dx / v.zoom, cz: v.cz - dy / v.zoom, zoom: v.zoom }, w, h);

// A waypoint counts as reached once the player is this close; the radar then drops it.
export const WAYPOINT_REACHED = 12;
export const reachedWaypoint = (wp, x, z) => !!wp && Math.hypot(wp.x - x, wp.z - z) < WAYPOINT_REACHED;
