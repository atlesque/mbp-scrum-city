import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.js'], setupFiles: ['tests/unit/setup.js'], environment: 'node' },
});
