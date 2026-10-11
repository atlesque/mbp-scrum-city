import { kb } from '../core/controls.js';
import { save } from '../core/save.js';
import { G } from '../core/state.js';
import { toast } from './hud.js';
import { changelog, loadChangelog } from './version.js';

// ================= NEW DEPLOY CHECK =================
// index.html loads the game from /v/<version>/js/main.js (rewritten to /js/ by public/_redirects),
// so a fresh page load always gets the newest code. A tab that stays open across a deploy still
// runs the old code: this looks at changelog.json now and then and, when main has moved on,
// offers a reload (title screen, pause menu, one toast while playing). A hidden tab sitting on
// the title screen reloads by itself, since nothing there can be lost.
const EVERY = 5 * 60 * 1000;

// the version this tab is running: the one index.html loaded the code for, else the first changelog read
export const running = () => (typeof window !== 'undefined' && window.__build) || changelog.version;
export const isUpdate = (now, latest) => !!(now && latest && now !== latest);

let latest = null, told = false;
export const updateReady = () => isUpdate(running(), latest);

export function reloadNow() { save(); location.reload(); }

function show() {
  for (const el of document.querySelectorAll('.update-note')) { el.hidden = false; el.querySelector('b').textContent = `v${latest}`; }
  if (G.state === 'title' && document.hidden) return reloadNow();
  if (G.state === 'play' && !told) { told = true; toast(`<em>v${latest}</em> is out. Pause (<em>${kb('pause')}</em>) and press <em>Reload</em> to get it. Your progress is saved.`, 7); }
}

async function check() {
  try {
    const r = await fetch('changelog.json', { cache: 'no-store' });
    const c = r.ok ? await r.json() : null;
    if (c && c.version) latest = c.version;
  } catch (e) { return; }
  if (updateReady()) show();
}

if (typeof document !== 'undefined') {
  for (const b of document.querySelectorAll('.update-note button')) b.addEventListener('click', reloadNow);
  loadChangelog.then(() => {
    setInterval(check, EVERY);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); else if (updateReady()) show(); });
  });
}
