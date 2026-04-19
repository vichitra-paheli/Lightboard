import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Build a fresh {@link QueryClient} for each test so cached state from a
 * previous test cannot leak into the next one. Disables retries so failed
 * queries surface the error synchronously to Testing Library assertions
 * instead of being retried on the next tick.
 */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // gcTime: Infinity — without it, seeded data via `setQueryData` can be
      // collected before the test's first interaction runs (react-query GCs
      // queries without any observers). Tests pre-seed and then interact, so
      // the GC behavior creates false negatives.
      queries: { retry: false, staleTime: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * Drop-in replacement for Testing Library's `render` that wraps the tree in
 * a throwaway {@link QueryClientProvider}. Returns the normal render result
 * plus the client so tests can pre-seed data via
 * `client.setQueryData(...)` before asserting against the UI.
 */
export function renderWithQuery(
  ui: ReactElement,
  options?: RenderOptions & { client?: QueryClient },
): RenderResult & { client: QueryClient } {
  const client = options?.client ?? makeTestQueryClient();
  const result = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    options,
  );
  return { ...result, client };
}
