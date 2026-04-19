---
name: settings_v2_state_pattern
description: Superseded by feat/react-query-server-state — settings hooks now use react-query
type: project
---

**Status: resolved by PR feat/react-query-server-state (April 2026).**

The settings v2 surface originally used plain `fetch` inside a
`useEffect` + `useState` hook (`useLlmData`, `useDataSources`) because
`@tanstack/react-query` wasn't in `apps/web/package.json`. The follow-up PR
completed the migration across the whole web app:

1. `@tanstack/react-query` + `@tanstack/react-query-devtools` are in
   `apps/web/package.json` (v5.59.x).
2. `LightboardQueryProvider` wraps `AppShell` in
   `apps/web/src/app/(dashboard)/layout.tsx`. Auth routes (login/register)
   don't get the provider and don't need it — their fetches are single-shot
   POSTs.
3. Shared query keys live in `apps/web/src/lib/query-keys.ts`:
   `['ai-configs']`, `['ai-routing']`, `['data-sources']`,
   `['data-sources', id, 'schema']`, `['auth', 'me']`.
4. `useLlmData` and `useDataSources` now wrap `useQuery` / `useMutation`.
   Mutations (create config, update config, delete config, assign role,
   create data source, delete data source, save schema doc) all run
   optimistic-update -> rollback on error -> invalidate on settle.
5. `UserAvatar` and `UserMessage` share a single `useCurrentUser` hook at
   `apps/web/src/lib/use-current-user.ts` so /api/auth/me only fires once.
6. Devtools gated via dynamic import keyed on NODE_ENV — dev bundle only.

**How to apply:** For any NEW server-state surface, follow the same pattern
— add a query key to `query-keys.ts`, call `useQuery` with
`staleTime: 5 * 60 * 1000` for metadata or `60_000` for volatile data,
and back every mutation with onMutate/onError/onSettled optimistic-update
handlers. The `test-utils/render-with-query.tsx` helper wraps tests in a
throwaway QueryClientProvider.
