// Builds the changelog and version number from the git history of main.
// Every change that landed on main (a merged PR, a squash merge or a direct commit) is one
// entry and bumps the version by one: the 81st change is v1.81. Writes public/changelog.json
// for the title and settings screens, and CHANGELOG.md for people reading the repo.
// Run by .github/workflows/changelog.yml after each push to main; by hand: `npm run changelog`.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MAJOR = 1;
// the commit the workflow makes to store these files; never an entry itself
export const BOT_SUBJECT = /^Changelog: v\d+\.\d+$/;
const FS = '\x1f', RS = '\x1e';
export const LOG_FORMAT = `%h${FS}%cs${FS}%s${FS}%b${RS}`;

// `git log --format=LOG_FORMAT` output, newest first, into [{ sha, date, subject, body }]
export function parseLog(out) {
  return out.split(RS).map(r => r.replace(/^\n+/, '')).filter(Boolean).map(r => {
    const [sha, date, subject, body = ''] = r.split(FS);
    return { sha, date, subject, body };
  });
}

// one commit on main as a changelog line: what changed, and the PR it came from
export function describe({ subject, body }) {
  const merge = subject.match(/^Merge pull request #(\d+) from \S+?\/(\S+)/);
  if (merge) {
    const line = body.split('\n').map(l => l.trim()).find(Boolean);
    return { pr: +merge[1], title: tidy(line || merge[2].replace(/^claude\//, '').replace(/-[a-z0-9]{6}$/, '').replace(/[-_]/g, ' ')) };
  }
  const squash = subject.match(/^(.*\S)\s+\(#(\d+)\)$/);
  if (squash) return { pr: +squash[2], title: tidy(squash[1]) };
  return { pr: null, title: tidy(subject) };
}
const tidy = s => { s = s.trim().replace(/\.$/, ''); return s.charAt(0).toUpperCase() + s.slice(1); };

export function buildChangelog(commits) {
  const kept = commits.filter(c => !BOT_SUBJECT.test(c.subject));
  const entries = kept.map((c, i) => ({ v: `${MAJOR}.${kept.length - i}`, date: c.date, sha: c.sha, ...describe(c) }));
  return { version: entries[0]?.v ?? `${MAJOR}.0`, date: entries[0]?.date ?? null, entries };
}

export function toMarkdown({ entries }, repo = 'https://github.com/atlesque/mbp-scrum-city') {
  const lines = ['# Changelog', '', 'Written from the commits on main by `scripts/changelog.mjs`; every change merged into main is one version. Do not edit by hand.'];
  let day = null;
  for (const e of entries) {
    if (e.date !== day) { day = e.date; lines.push('', `## ${day}`, ''); }
    lines.push(`- **v${e.v}** ${e.title}${e.pr ? ` ([#${e.pr}](${repo}/pull/${e.pr}))` : ''}`);
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  // a shallow clone would restart the count at its cut-off
  if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim() === 'true') throw new Error('shallow clone: run `git fetch --unshallow` first');
  const log = execFileSync('git', ['log', '--first-parent', `--format=${LOG_FORMAT}`, process.argv[2] || 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  const cl = buildChangelog(parseLog(log));
  writeFileSync(`${root}public/changelog.json`, JSON.stringify(cl, null, 1) + '\n');
  writeFileSync(`${root}CHANGELOG.md`, toMarkdown(cl));
  console.log(`v${cl.version}, ${cl.entries.length} changes`);
}
