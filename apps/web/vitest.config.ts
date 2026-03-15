import { defineConfig } from 'vitest/config';
import path from 'path';

/** Vitest configuration — excludes Playwright E2E tests, uses jsdom for component tests. */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
