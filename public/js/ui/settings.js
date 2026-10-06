import { Sound } from '../core/audio.js';
import { on } from '../core/events.js';
import { DRAW_DISTANCE, RENDER_SCALE, SETTINGS, loadSettings, resetSettings, setSetting, settings } from '../core/settings.js';
import { $ } from '../core/util.js';
import { renderer, scene } from '../render/scene.js';

// ================= SETTINGS SCREEN =================
// Opens from the pause menu and the title screen. Its rows come from SETTINGS in core/settings.js;
// the Controls tab is a read-only list (the keys are fixed).
const TABS = [['sound', 'Sound'], ['graphics', 'Graphics'], ['gameplay', 'Gameplay'], ['controls', 'Controls']];
export const CONTROLS = [
  ['On foot', [['W A S D', 'Move'], ['Mouse', 'Look and aim'], ['Left click', 'Shoot'], ['Right click', 'Zoom aim'], ['Shift', 'Sprint'], ['Space', 'Jump'], ['E', 'Enter a gun shop, take the stairs to a roof'], ['F', 'Ride, drive, pull a driver out']]],
  ['On a bike', [['W / S', 'Throttle / brake'], ['A / D', 'Lean'], ['Shift', 'Boost'], ['Space', 'Rear brake'], ['F', 'Get off']]],
  ['In a car', [['W / S', 'Gas / brake'], ['A / D', 'Steer'], ['Shift', 'Boost'], ['Space', 'Handbrake'], ['F', 'Get out']]],
  ['Anywhere', [['1 – 6', 'Pick a weapon'], ['Mouse wheel', 'Cycle weapons'], ['R', 'Reload'], ['M', 'Radio on / off'], ['Esc / P', 'Pause']]],
];

let tab = 'sound', from = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function apply(id) {
  if (!id || id === 'sound' || id === 'sfxVolume' || id === 'musicVolume') Sound.setMix({ on: settings.sound, sfx: settings.sfxVolume, music: settings.musicVolume });
  if (!id || id === 'quality') { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER_SCALE[settings.quality])); renderer.setSize(innerWidth, innerHeight); }
  if (!id || id === 'drawDistance') { const far = DRAW_DISTANCE[settings.drawDistance]; scene.fog.far = far; scene.fog.near = far * 0.2; }
}

function rowHtml(s) {
  const v = settings[s.id], label = `<span class="set-label" id="lbl-${s.id}">${esc(s.label)}</span>`;
  if (s.type === 'toggle') return `<div class="set-row">${label}<button class="tgl" role="switch" aria-labelledby="lbl-${s.id}" aria-checked="${v}" data-set="${s.id}">${v ? 'On' : 'Off'}</button></div>`;
  if (s.type === 'range') return `<div class="set-row">${label}<div class="set-range"><input type="range" aria-labelledby="lbl-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}" data-set="${s.id}"><output>${esc(s.fmt(v))}</output></div></div>`;
  return `<div class="set-row">${label}<div class="seg" role="radiogroup" aria-labelledby="lbl-${s.id}">${s.options.map(([val, txt]) =>
    `<button role="radio" aria-checked="${val === v}" data-set="${s.id}" data-val="${esc(val)}">${esc(txt)}</button>`).join('')}</div></div>`;
}
function render() {
  $('setTabs').innerHTML = TABS.map(([id, txt]) => `<button role="tab" aria-selected="${id === tab}" data-tab="${id}">${txt}</button>`).join('');
  $('setBody').innerHTML = tab === 'controls'
    ? `<div class="set-controls">${CONTROLS.map(([group, rows]) => `<div><h3>${group}</h3>${rows.map(([k, what]) => `<div class="ctl"><kbd>${esc(k)}</kbd><span>${esc(what)}</span></div>`).join('')}</div>`).join('')}</div><p class="small">Controls are fixed. Click the game to capture the mouse.</p>`
    : SETTINGS.filter(s => s.tab === tab).map(rowHtml).join('');
  $('setReset').hidden = tab === 'controls';
}

$('setTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); $('setTabs').querySelector(`[data-tab="${tab}"]`).focus(); } });
$('setBody').addEventListener('click', e => {
  const b = e.target.closest('button[data-set]'); if (!b) return;
  const s = SETTINGS.find(x => x.id === b.dataset.set);
  setSetting(s.id, s.type === 'toggle' ? !settings[s.id] : b.dataset.val);
});
$('setBody').addEventListener('input', e => {
  const r = e.target; if (r.type !== 'range') return;
  const s = SETTINGS.find(x => x.id === r.dataset.set); setSetting(s.id, +r.value); r.nextElementSibling.textContent = s.fmt(settings[s.id]);
});
// a short blip so the new effects volume can be heard
$('setBody').addEventListener('change', e => { if (e.target.dataset.set === 'sfxVolume') Sound.cash(); });
$('setReset').addEventListener('click', () => { resetSettings(); render(); });
$('setBack').addEventListener('click', () => closeSettings());
on('settings:changed', ({ id }) => {
  apply(id);
  // ranges update themselves while dragging; redraw the buttons
  if (!$('settings').hidden && SETTINGS.find(s => s.id === id).type !== 'range') {
    const f = document.activeElement, sel = f && f.dataset && f.dataset.set ? `[data-set="${f.dataset.set}"]${f.dataset.val ? `[data-val="${f.dataset.val}"]` : ''}` : null;
    render(); if (sel) $('setBody').querySelector(sel)?.focus();
  }
});

export const settingsOpen = () => !$('settings').hidden;
export function openSettings(overlay) {
  from = overlay; $(from).hidden = true; $('settings').hidden = false; render();
  setTimeout(() => $('setTabs').querySelector('[aria-selected="true"]').focus(), 20);
}
export function closeSettings() {
  if (!settingsOpen()) return;
  $('settings').hidden = true; $(from).hidden = false;
  setTimeout(() => $(from === 'pause' ? 'pauseSettingsBtn' : 'titleSettingsBtn').focus(), 20);
}
$('pauseSettingsBtn').addEventListener('click', () => openSettings('pause'));
$('titleSettingsBtn').addEventListener('click', () => openSettings('title'));

loadSettings(); apply();
