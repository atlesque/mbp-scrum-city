import { $ } from '../core/util.js';

// ================= VERSION + CHANGELOG =================
// changelog.json is written from main's commits by scripts/changelog.mjs (see the Changelog
// workflow). The version shows in small text on the title screen and in the settings footer;
// the settings "What's new" tab lists every change.
export const changelog = { version: null, date: null, entries: [] };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const REPO = 'https://github.com/atlesque/mbp-scrum-city';

// '2026-10-11' → '11 Oct 2026', read as a calendar day so no time zone moves it
export function fmtDate(d) {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d || ''); if (!m) return '';
  return `${+m[3]} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[m[2] - 1]} ${m[1]}`;
}
export const versionLabel = (c = changelog) => (c.version ? `v${c.version}${c.date ? ` · ${fmtDate(c.date)}` : ''}` : '');

export function changelogHtml(c = changelog) {
  if (!c.entries.length) return '<p class="small">No changelog in this build.</p>';
  let html = '', day = null;
  for (const e of c.entries) {
    if (e.date !== day) { html += `${day ? '</ul>' : ''}<h3>${esc(fmtDate(e.date))}</h3><ul>`; day = e.date; }
    html += `<li><span class="cl-v">v${esc(e.v)}</span> ${esc(e.title)}${e.pr ? ` <a href="${REPO}/pull/${+e.pr}" target="_blank" rel="noopener">#${+e.pr}</a>` : ''}</li>`;
  }
  return `<div class="changelog">${html}</ul></div>`;
}

function paint() {
  const label = esc(versionLabel());
  $('titleVersion').innerHTML = label ? `${label} · <button class="linkbtn" id="whatsNewBtn">What's new</button>` : '';
  $('setVersion').textContent = versionLabel();
}

export const loadChangelog = typeof document === 'undefined' ? Promise.resolve(changelog) : fetch('changelog.json', { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : null))
  .then(c => { if (c && Array.isArray(c.entries)) Object.assign(changelog, c); paint(); return changelog; })
  .catch(() => changelog);
