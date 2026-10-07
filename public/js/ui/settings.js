import { Sound } from '../core/audio.js';
import { detectLayout, labelOf, paintKeys } from '../core/controls.js';
import { on } from '../core/events.js';
import { ACTIONS, ALT, PRESETS, isReserved, rebind } from '../core/keymap.js';
import { DRAW_DISTANCE, RENDER_SCALE, SETTINGS, SETTINGS_KEY, loadSettings, resetSettings, setSetting, settings } from '../core/settings.js';
import { $ } from '../core/util.js';
import { renderer, scene } from '../render/scene.js';

// ================= SETTINGS SCREEN =================
// Opens from the pause menu and the title screen. Its rows come from SETTINGS in core/settings.js;
// the Controls tab picks a keyboard preset and rebinds each action in core/keymap.js.
const TABS = [['sound', 'Sound'], ['graphics', 'Graphics'], ['gameplay', 'Gameplay'], ['controls', 'Controls']];
// what stays put whatever the bindings
export const FIXED = [['Mouse', 'Look and aim'], ['Left click', 'Shoot, punch or swing'], ['Right click', 'Zoom aim, or the sniper scope'], ['Mouse wheel', 'Cycle weapons'], ['1 – 9', 'Pick a gun, grenades, molotovs'], ['Esc', 'Pause, or back out of a menu']];

let tab = 'sound', from = null, capturing = null, note = '';
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
  $('setBody').innerHTML = tab === 'controls' ? controlsHtml() : SETTINGS.filter(s => s.tab === tab).map(rowHtml).join('');
  $('setReset').textContent = tab === 'controls' ? 'Reset keys' : 'Reset to defaults';
}
function controlsHtml() {
  const bindRow = a => `<div class="ctl"><button class="bind" data-bind="${a.id}" aria-label="${esc(a.label)}: ${esc(labelOf(settings.binds[a.id]))}. Change key"${capturing === a.id ? ' aria-pressed="true"' : ''}>${capturing === a.id ? 'Press a key' : esc(labelOf(settings.binds[a.id]))}</button>`
    + `<span>${esc(a.label)}${ALT[a.id] ? ` <small>or ${esc(labelOf(ALT[a.id]))}</small>` : ''}</span></div>`;
  const groups = [...new Set(ACTIONS.map(a => a.group))];
  return rowHtml(SETTINGS.find(s => s.id === 'layout'))
    + `<div class="set-controls">${groups.map(g => `<div><h3>${g}</h3>${ACTIONS.filter(a => a.group === g).map(bindRow).join('')}</div>`).join('')}`
    + `<div><h3>Fixed</h3>${FIXED.map(([k, what]) => `<div class="ctl"><kbd>${esc(k)}</kbd><span>${esc(what)}</span></div>`).join('')}</div></div>`
    + `<p class="small" id="bindNote" aria-live="polite">${esc(note || 'Click a key to change it, then press the new one. Esc cancels.')}</p>`;
}
// While a key is being changed, the next key press is the new binding and goes nowhere else.
function stopCapture() { capturing = null; note = ''; render(); }
window.addEventListener('keydown', e => {
  if (!capturing || !settingsOpen()) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const action = capturing;
  if (e.code === 'Escape') return stopCapture();
  if (isReserved(e.code)) { note = `${labelOf(e.code)} is kept for picking weapons and pausing. Try another key.`; $('bindNote').textContent = note; return; }
  const was = Object.keys(settings.binds).find(id => id !== action && settings.binds[id] === e.code);
  note = was ? `${labelOf(e.code)} was on “${ACTIONS.find(a => a.id === was).label}”, which now uses ${labelOf(settings.binds[action])}.` : '';
  capturing = null;
  setSetting('binds', rebind(settings.binds, action, e.code));
  render(); $('setBody').querySelector(`[data-bind="${action}"]`)?.focus();
}, true);

$('setTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); $('setTabs').querySelector(`[data-tab="${tab}"]`).focus(); } });
$('setBody').addEventListener('click', e => {
  const k = e.target.closest('button[data-bind]');
  if (k) { capturing = capturing === k.dataset.bind ? null : k.dataset.bind; note = ''; render(); $('setBody').querySelector(`[data-bind="${k.dataset.bind}"]`).focus(); return; }
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
$('setReset').addEventListener('click', () => {
  if (tab === 'controls') { capturing = null; note = ''; setSetting('binds', PRESETS[settings.layout]); } else resetSettings();
  render();
});
$('setBack').addEventListener('click', () => closeSettings());
on('settings:changed', ({ id }) => {
  apply(id);
  // ranges update themselves while dragging; redraw the buttons
  if (!$('settings').hidden && SETTINGS.find(s => s.id === id).type !== 'range' && !capturing) {
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
  capturing = null; note = '';
  $('settings').hidden = true; $(from).hidden = false;
  setTimeout(() => $(from === 'pause' ? 'pauseSettingsBtn' : 'titleSettingsBtn').focus(), 20);
}
$('pauseSettingsBtn').addEventListener('click', () => openSettings('pause'));
$('titleSettingsBtn').addEventListener('click', () => openSettings('title'));

let firstVisit = true;
try { firstVisit = !(localStorage.getItem(SETTINGS_KEY) || '').includes('"layout"'); } catch (e) {}
loadSettings(); apply(); paintKeys();
detectLayout(firstVisit, layout => setSetting('layout', layout));
