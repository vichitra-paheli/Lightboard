import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest configuration — excludes Playwright E2E tests and registers a jsdom
 * environment for component tests that render React trees via
 * `@testing-library/react`. Node-only unit tests (e.g. `src/lib/*.test.ts`)
 * still run fine under jsdom; if one needs the real Node globals it can set
 * `// @vitest-environment node` at the top of the file.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // Next.js keeps `jsx: "preserve"` in tsconfig so the Next compiler can take
  // over. Tests don't run through Next, so we tell esbuild to use the
  // automatic JSX runtime here — that means test files never need an explicit
  // `import React from 'react'` and match how Next renders at build time.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    css: {
      // Process CSS-module imports as real modules (classes returned as an
      // object) rather than stubbing them out, and keep the scoped names equal
      // to the local identifiers so component tests can query by class name.
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
});
