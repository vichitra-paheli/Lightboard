'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';

/**
 * Dynamic-load the devtools so the ~40KB package never reaches the prod
 * bundle. Next's `dynamic()` with `ssr: false` + a render-time guard on
 * `NODE_ENV` gives the bundler a dead-code branch to strip.
 */
const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('@tanstack/react-query-devtools').then((m) => ({
            default: m.ReactQueryDevtools,
          })),
        { ssr: false },
      )
    : () => null;

/**
 * Create the singleton QueryClient for the session. Defaults tuned for
 * Lightboard's settings/explore surfaces:
 *
 * - `staleTime: 60_000` — metadata (configs, data sources) refreshes gently.
 *   Individual queries that are cheaper to keep fresh (`['data-sources']`,
 *   `['ai-configs']`) override to 5 min via `staleTime: 5 * 60 * 1000` at the
 *   call site.
 * - `refetchOnWindowFocus: false` — swapping between tabs shouldn't hammer the
 *   API; the UI is SPA-like and users expect the list they left to still be
 *   on screen.
 * - `refetchOnReconnect: true` (the default) so we recover gracefully from a
 *   flaky connection while a form is open.
 *
 * A fresh client is created per mount via `useState(() => …)` rather than a
 * module-level singleton so Vitest / test harnesses that re-render the
 * provider get isolated caches. Production only mounts this once (at the
 * dashboard layout), so the trade-off is irrelevant there.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** Props for {@link LightboardQueryProvider}. */
export interface LightboardQueryProviderProps {
  children: ReactNode;
}

/**
 * Client-side wrapper that mounts a {@link QueryClientProvider} for the tree
 * below it. Imported from server layouts (dashboard root) so every
 * authenticated page has access to shared server-state caching.
 *
 * Devtools are gated on `process.env.NODE_ENV === 'development'` via the
 * dynamic import above, which Next replaces with a no-op `() => null`
 * component in production builds — the devtools package stays out of the
 * prod bundle entirely.
 */
export function LightboardQueryProvider({ children }: LightboardQueryProviderProps) {
  const [client] = useState(() => makeQueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  );
}
