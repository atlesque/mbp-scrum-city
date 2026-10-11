import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isUpdate } from '../../public/js/ui/update.js';

describe('new deploy check', () => {
  it('offers a reload only when the deployed version differs from the running one', () => {
    expect(isUpdate('1.129', '1.130')).toBe(true);
    expect(isUpdate('1.130', '1.129')).toBe(true); // a rollback is a new deploy too
    expect(isUpdate('1.130', '1.130')).toBe(false);
    expect(isUpdate(null, '1.130')).toBe(false); // never read a version: nothing to compare
    expect(isUpdate('1.130', null)).toBe(false); // changelog.json unreachable
  });
  it('serves the per-deploy module path from public/', () => {
    const rules = readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8');
    expect(rules).toMatch(/^\/v\/:build\/\* \/:splat 200$/m);
    expect(readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8')).toContain('`/v/${window.__build}/js/main.js`');
  });
});
