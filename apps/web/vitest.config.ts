import { defineConfig } from 'vitest/config';

/** Vitest configuration — excludes Playwright E2E tests. */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
