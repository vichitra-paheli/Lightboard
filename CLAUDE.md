# CLAUDE.md — Lightboard

## What is this?

Lightboard is an AI-native data exploration and visualization platform. Users connect databases, ask questions in natural language, get interactive charts with controls, save them as views, compose views into layouts (dashboards), and share with access gating. Think "Grafana rebuilt for the AI era" — no AGPL, no Go, pure TypeScript.

## Quick orientation

```
lightboard/
├── apps/web/              # Next.js 15 app (app router)
├── packages/
│   ├── connector-sdk/     # TypeScript interface for data sources
│   ├── connectors/        # Postgres connector (others planned)
│   ├── query-ir/          # Query intermediate representation (used by connectors, not by agent)
│   ├── viz-core/          # visx chart components (legacy — agent now generates HTML)
│   ├── agent/             # Multi-agent orchestration (leader + query/view/insights agents + scratchpad)
│   ├── ui/                # shadcn/ui components (copied, not installed)
│   ├── telemetry/         # OpenTelemetry SDK + built-in data source
│   └── db/                # Drizzle ORM schema + migrations
├── plugins/               # Local plugin tarballs (.tar.gz)
├── docker/                # Dockerfiles + compose
├── helm/                  # K8s Helm charts
└── e2e/                   # Playwright E2E tests
```

## Key abstractions

**QueryIR** — A JSON intermediate representation for queries. Used by connectors to translate structured queries to native syntax. The agent no longer produces QueryIR — it writes raw SQL directly via `run_sql`. Defined in `packages/query-ir/`.

**HtmlView** — The agent's primary visualization output. A complete, self-contained HTML document rendered in a sandboxed iframe. Contains embedded data, Chart.js charts or SVG, and inline styles. Created via `create_view` tool with `{ title, description, sql, html }`.

**ViewSpec (legacy)** — The previous visualization format: a declarative JSON doc with QueryIR + chart config + controls. The `<ViewRenderer>` component still supports this for backward compatibility, but new views use HtmlView.

**PanelPlugin (legacy)** — The adapter interface for visx visualization components. Deprecated — new visualizations use agent-generated HTML instead.

**Connector** — The adapter interface for data sources. Methods: `connect`, `introspect`, `query`, `stream`, `healthCheck`, `capabilities`. Each connector is an npm package or local tarball.

## Multi-agent architecture (Phase 1.5)

The agent package (`packages/agent/`) uses a multi-agent orchestration pattern:

```
packages/agent/src/
├── agent.ts                    # Agent class (multiAgent flag switches to LeaderAgent)
├── agents/
│   ├── types.ts                # SubAgent, AgentTask, SubAgentResult interfaces
│   ├── leader.ts               # LeaderAgent — orchestrates conversation + delegates
│   ├── query-agent.ts          # Query specialist (schema, raw SQL)
│   ├── view-agent.ts           # View specialist (HTML visualization generation)
│   └── insights-agent.ts       # Insights specialist (stats via DuckDB)
├── scratchpad/
│   ├── scratchpad.ts           # SessionScratchpad — per-session in-memory data store
│   └── manager.ts              # ScratchpadManager — session lifecycle + cleanup
├── prompt/                     # Per-agent system prompts (focused context)
├── tools/                      # Per-agent tool definitions + router
├── conversation/               # ConversationManager (used by leader only)
└── provider/                   # LLM providers (Claude, OpenAI-compatible)
```

**Leader** calls sub-agents as tools (`delegate_query`, `delegate_view`, `delegate_insights`). Sub-agents are headless — they return structured `SubAgentResult`, only the leader streams to the user. The session scratchpad allows agents to save intermediate query results as named in-memory tables for multi-step analysis.

## Tech stack — no substitutions without PR justification

| Concern | Use this | Not this |
|---------|----------|----------|
| Framework | Next.js 15 (app router) | Pages router, Remix, Vite |
| UI components | shadcn/ui (copied into packages/ui/) | MUI, Ant Design, Chakra |
| Visualization | Agent-generated HTML (Chart.js/SVG in iframe) | Recharts, Nivo |
| Visualization (legacy) | visx + d3-scale + d3-shape | — |
| Data tables | @tanstack/react-table | ag-grid, react-data-grid |
| Server state | @tanstack/react-query | SWR, Apollo |
| Client state | Zustand | Redux, Jotai, MobX |
| URL state | nuqs | manual searchParams |
| Forms | react-hook-form + zod | Formik, final-form |
| Layout grid | react-grid-layout | CSS grid (for drag/drop) |
| ORM | Drizzle ORM | Prisma, TypeORM, Knex |
| Auth | Lucia | NextAuth (unless OAuth needed) |
| i18n | next-intl | react-i18next, FormatJS |
| Icons | lucide-react | heroicons, react-icons |
| Testing | Vitest + Playwright + Testing Library | Jest, Cypress |
| Data transfer | JSON rows for agent queries, Arrow IPC for connector interface | Raw JS array processing |

## Non-negotiable code rules

1. **No inline styles.** Use Tailwind classes + shadcn/ui theme. Charts read colors from `useChartTheme()`, never hardcoded hex.
2. **No hardcoded strings.** Every user-facing string goes through `next-intl`. Use `useTranslations('namespace')`.
3. **JSDoc on every export.** Functions, components, types, interfaces — all get a JSDoc comment.
4. **No code duplication.** Copy-paste > 3 lines → extract to `packages/` or `lib/`.
5. **Components < 150 lines.** Business logic in custom hooks, not in JSX.
6. **JSON rows for agent query results.** Arrow IPC remains in the connector interface for backward compatibility, but agent tools return JSON `{ columns, rows, rowCount }`.
7. **react-query for all server state.** staleTime: 5min for metadata, 1min for query results. Never `useEffect` + `fetch`.
8. **Optimistic updates** for all mutations. Show result immediately, reconcile in background.
9. **Every table has `org_id`.** Postgres RLS enforces tenant isolation. Route handlers never filter by org_id manually.
10. **Every feature ships with tests.** Unit (Vitest), component (Testing Library), E2E (Playwright). PRs without tests are rejected.
11. **Feature branches only.** `feat/`, `fix/`, `refactor/` off `main`. Squash merge. CI must pass.

## Performance rules

- App shell renders instantly (cached/static). Only content areas show loading skeletons.
- Prefetch on hover. Virtualize all long lists.
- Queries push computation to the data source. The agent writes raw SQL directly. TypeScript never touches raw data processing.
- SVG for <5K points, Canvas for 5-50K, LTTB downsampling + deck.gl WebGL for 50K+.
- HTTP compression (Brotli) on all API responses. Schema cache in Redis (10min TTL).

## Multi-tenancy

Shared database, shared schema. Every row has `org_id`. Postgres RLS policies filter on `app.current_org_id` session variable set by API middleware. Rate limiting is per-org via Redis token bucket. Data source credentials encrypted with per-org key derivation.

## Deployment modes

- **Cloud SaaS**: Next.js + managed Postgres + Redis + S3 + Claude API
- **On-prem Docker**: Single `docker run` with embedded Postgres/Redis
- **Airgapped K8s**: Local LLM (Ollama/vLLM) or AI disabled, plugins loaded from `/plugins` directory as .tar.gz files, zero network egress

## Agent tools

Core tools available to the agent: `get_schema`, `describe_table`, `run_sql`, `create_view`, `modify_view`. The agent writes raw SQL (no QueryIR) and generates complete HTML visualizations (no panel plugins).

## Project docs (read in order for full context)

1. `documentation/project_overview.md` — Architecture, tech stack, repo structure, key concepts
2. `documentation/phase_1.md` — Phase 1 plan: foundation (weeks 1-6), all code standards, deliverables with schemas
3. `documentation/phase_1.5.md` — Phase 1.5 plan: multi-agent architecture, scratchpad, UI overhaul
4. `documentation/phase_2.md` — Phase 2 plan: persistence + sharing (weeks 7-12), variable system, layouts, RBAC

## Commands

```bash
# Local dev
docker compose up -d                 # Start Postgres + Redis
pnpm dev                             # Start Next.js dev server (Turbopack)
pnpm test                            # Run all unit + component tests
pnpm typecheck                       # TypeScript across all packages
pnpm --filter @lightboard/web lint   # ESLint (catches unused imports, any types)
pnpm build                           # Production build

# Per-package
pnpm --filter @lightboard/agent test -- --run   # Agent tests (82 tests)
pnpm --filter @lightboard/query-ir test
pnpm --filter @lightboard/viz-core storybook

# Docker
docker build -t lightboard .         # Production image (multi-stage, rootless)
docker compose -f docker-compose.prod.yml up  # Production single-node

# Plugins (airgap)
lightboard plugin pack <name>        # Create .tar.gz on connected machine
# Copy to /plugins directory, restart or POST /api/admin/plugins/reload
```

## Running migrations

Schema changes ship as journaled migrations under `packages/db/drizzle/`.
`pnpm --filter @lightboard/db db:migrate` is the one true way to evolve
the schema — `drizzle-kit push` is only for ad-hoc local experimentation
and must not be used for real schema changes.

```bash
# Fresh DB (no tables yet) — just migrate.
pnpm --filter @lightboard/db db:migrate

# Existing dev DB that was last seeded with `drizzle-kit push` (before the
# journal existed): run bootstrap once to backfill drizzle's tracking
# table, then migrate as usual.
pnpm --filter @lightboard/db db:bootstrap
pnpm --filter @lightboard/db db:migrate

# Add a new migration after editing packages/db/src/schema/*.ts:
pnpm --filter @lightboard/db db:generate  # produces next NNNN_*.sql + journal entry
pnpm --filter @lightboard/db db:migrate
```

`db:bootstrap` is idempotent and safe to run even when not needed — it
detects which migrations the live DB has already satisfied, closes any
drizzle-kit-push gaps (missing `telemetry.telemetry_events`, missing
`model_configs` / `agent_role_assignments`), and inserts matching rows
into `drizzle.__drizzle_migrations` so the subsequent `db:migrate` call
skips what's already applied.