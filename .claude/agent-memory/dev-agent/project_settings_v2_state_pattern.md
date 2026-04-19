---
name: settings_v2_state_pattern
description: PR settings-v2 uses fetch+useState hooks (useLlmData, useDataSources) rather than react-query because the workspace never added @tanstack/react-query. Follow-up PR should port both.
type: project
---

The new settings surface (LLMs + Data Sources) uses plain `fetch` inside a
`useEffect` + `useState` hook (`useLlmData`, `useDataSources`) instead of
react-query, even though CLAUDE.md says "react-query for all server state."

**Why:** `@tanstack/react-query` isn't in `apps/web/package.json` — never
was. Adding it mid-feature would have pulled in `QueryClientProvider`
wiring at the root layout, affected every consumer, and risked breaking
SSR cache boundaries unrelated to this PR.

**How to apply:** Any follow-up PR that wants to swap these hooks for
react-query should (1) add `@tanstack/react-query` to `apps/web`,
(2) wire `<QueryClientProvider>` into the root dashboard layout, and
(3) replace `useLlmData` / `useDataSources` with `useQuery` + `useMutation`
pairs. The file surface is small — the two hooks + their callers in
`components/settings/{llms,data-sources}/`. The `/api/settings/ai/*`
routes already return JSON shapes that map cleanly onto react-query keys
(`['ai-configs']`, `['ai-routing']`).
