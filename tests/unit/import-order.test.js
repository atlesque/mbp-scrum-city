import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Every game module reads THREE as a global, so main.js must import three.js before anything else.
// A module imported ahead of it throws "THREE is not defined" and the page shows "Could not load the 3D engine".
describe('main.js import order', () => {
  it('imports three.js first', () => {
    const src = readFileSync(new URL('../../public/js/main.js', import.meta.url), 'utf8');
    const first = src.match(/^import\s.*$/m)[0];
    expect(first).toMatch(/['"]\.\/three\.js['"]/);
  });
});
