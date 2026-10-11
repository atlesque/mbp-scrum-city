import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOG_FORMAT, buildChangelog, describe as line, parseLog, toMarkdown } from '../../scripts/changelog.mjs';
import { changelogHtml, fmtDate, versionLabel } from '../../public/js/ui/version.js';

const FS = '\x1f', RS = '\x1e';
const log = [
  ['c3', '2026-10-11', 'Changelog: v1.3', ''],
  ['b2', '2026-10-11', 'Merge pull request #107 from atlesque/claude/sfw-club-interior-ppvez0', 'Add the Velvet Flamingo, an SFW club.\n\nMore detail'],
  ['a1', '2026-10-10', 'Losing the sixth star drops back to five (#105)', '* Losing the sixth star\nCo-Authored-By: x'],
  ['90', '2026-10-01', 'add the first city', ''],
].map(c => c.join(FS) + RS).join('\n');

describe('changelog from git history', () => {
  it('reads the log format it asks git for', () => {
    expect(LOG_FORMAT.split(FS)).toHaveLength(4);
    expect(parseLog(log).map(c => c.sha)).toEqual(['c3', 'b2', 'a1', '90']);
  });
  it('takes the title from a merge body, a squash subject or a plain commit', () => {
    const [, merge, squash, plain] = parseLog(log);
    expect(line(merge)).toEqual({ pr: 107, title: 'Add the Velvet Flamingo, an SFW club' });
    expect(line(squash)).toEqual({ pr: 105, title: 'Losing the sixth star drops back to five' });
    expect(line(plain)).toEqual({ pr: null, title: 'Add the first city' });
    expect(line({ subject: 'Merge pull request #9 from atlesque/claude/bike-knock-abc123', body: '' }).title).toBe('Bike knock');
  });
  it('counts one version per change on main, newest first, leaving out its own commit', () => {
    const cl = buildChangelog(parseLog(log));
    expect(cl.version).toBe('1.3');
    expect(cl.date).toBe('2026-10-11');
    expect(cl.entries.map(e => e.v)).toEqual(['1.3', '1.2', '1.1']);
    expect(buildChangelog([]).version).toBe('1.0');
    expect(toMarkdown(cl)).toContain('- **v1.3** Add the Velvet Flamingo, an SFW club ([#107](https://github.com/atlesque/mbp-scrum-city/pull/107))');
  });
  it('ships a changelog.json the game can read', () => {
    const cl = JSON.parse(readFileSync(new URL('../../public/changelog.json', import.meta.url), 'utf8'));
    expect(cl.version).toBe(cl.entries[0].v);
    for (const e of cl.entries) expect(e.title).toBeTruthy();
  });
});

describe('version text in the game', () => {
  const cl = { version: '1.3', date: '2026-10-11', entries: [{ v: '1.3', date: '2026-10-11', title: 'Club <b>', pr: 107 }, { v: '1.2', date: '2026-10-10', title: 'Stars', pr: null }] };
  it('shows the version and its day', () => {
    expect(fmtDate('2026-01-05')).toBe('5 Jan 2026');
    expect(fmtDate(null)).toBe('');
    expect(versionLabel(cl)).toBe('v1.3 · 11 Oct 2026');
    expect(versionLabel({ version: null })).toBe('');
  });
  it('lists the changes by day, escaped, with PR links', () => {
    const html = changelogHtml(cl);
    expect(html.match(/<h3>/g)).toHaveLength(2);
    expect(html).toContain('Club &lt;b&gt;');
    expect(html).toContain('/pull/107');
    expect(changelogHtml({ entries: [] })).toContain('No changelog');
  });
});
