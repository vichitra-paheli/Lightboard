# CLAUDE.md — Lightboard

## What is this?

Lightboard is an AI-native data exploration and visualization platform. Users connect databases, ask questions in natural language, get interactive charts with controls, save them as views, compose views into layouts (dashboards), and share with access gating. Think "Grafana rebuilt for the AI era" — no AGPL, no Go, pure TypeScript.

## Quick orientation

```
lightboard/
├── apps/web/              # Next.js 15 app (app router)
├── packages/
│   ├── connector-sdk/     # TypeScript interface for data sources
│   ├── connectors/        # Postgres, MySQL, ClickHouse, REST, CSV, Prometheus, ES
│   ├── query-ir/          # Query intermediate representation (the lingua franca)
│   ├── compute/           # DuckDB (native + WASM) + Arrow pipeline
│   ├── viz-core/          # visx chart components + panel adapter protocol
│   ├── agent/             # AI agent (Claude API) + tool definitions
│   ├── ui/                # shadcn/ui components (copied, not installed)
│   ├── telemetry/         # OpenTelemetry SDK + built-in data source
│   ├── mcp-server/        # MCP server for programmatic UI operations
│   └── db/                # Drizzle ORM schema + migrations
├── plugins/               # Local plugin tarballs (.tar.gz)
├── docker/                # Dockerfiles + compose
├── helm/                  # K8s Helm charts
└── e2e/                   # Playwright E2E tests
```

## Key abstractions

**QueryIR** — Every query flows through this JSON intermediate representation. The agent produces it, the visual query builder produces it, template variables interpolate into it, and each connector translates it to native syntax (SQL, PromQL, etc). Defined in `packages/query-ir/`.

**ViewSpec** — The agent's primary output. A declarative JSON doc describing: query (as QueryIR), chart type + config, interactive controls bound to template variables. The `<ViewRenderer>` component takes a ViewSpec and renders a live, interactive panel.

**PanelPlugin** — The adapter interface for visualization components. Any React component becomes a Lightboard panel by exporting: `id`, `configSchema` (JSON Schema), `dataShape`, and `Component` (React.FC). The host injects data, config, dimensions, and theme.

**Connector** — The adapter interface for data sources. Methods: `connect`, `introspect`, `query`, `stream`, `healthCheck`, `capabilities`. Each connector is an npm package or local tarball.

## Tech stack — no substitutions without PR justification

| Concern | Use this | Not this |
|---------|----------|----------|
| Framework | Next.js 15 (app router) | Pages router, Remix, Vite |
| UI components | shadcn/ui (copied into packages/ui/) | MUI, Ant Design, Chakra |
| Visualization | visx + d3-scale + d3-shape | Recharts, Nivo, Chart.js |
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
| Compute | DuckDB (native + WASM) + Apache Arrow | Raw JS array processing |

## Non-negotiable code rules

1. **No inline styles.** Use Tailwind classes + shadcn/ui theme. Charts read colors from `useChartTheme()`, never hardcoded hex.
2. **No hardcoded strings.** Every user-facing string goes through `next-intl`. Use `useTranslations('namespace')`.
3. **JSDoc on every export.** Functions, components, types, interfaces — all get a JSDoc comment.
4. **No code duplication.** Copy-paste > 3 lines → extract to `packages/` or `lib/`.
5. **Components < 150 lines.** Business logic in custom hooks, not in JSX.
6. **Apache Arrow IPC for data transfer**, not JSON. Between server↔client, DuckDB↔Node, workers↔main thread.
7. **react-query for all server state.** staleTime: 5min for metadata, 1min for query results. Never `useEffect` + `fetch`.
8. **Optimistic updates** for all mutations. Show result immediately, reconcile in background.
9. **Every table has `org_id`.** Postgres RLS enforces tenant isolation. Route handlers never filter by org_id manually.
10. **Every feature ships with tests.** Unit (Vitest), component (Testing Library), E2E (Playwright). PRs without tests are rejected.
11. **Feature branches only.** `feat/`, `fix/`, `refactor/` off `main`. Squash merge. CI must pass.

## Performance rules

- App shell renders instantly (cached/static). Only content areas show loading skeletons.
- Prefetch on hover. Virtualize all long lists.
- Queries push computation to the data source (Tier 1). Cross-source work goes through DuckDB (Tier 2, C++ speed). TypeScript never touches raw data processing.
- SVG for <5K points, Canvas for 5-50K, LTTB downsampling + deck.gl WebGL for 50K+.
- HTTP compression (Brotli) on all API responses. Schema cache in Redis (10min TTL).

## Multi-tenancy

Shared database, shared schema. Every row has `org_id`. Postgres RLS policies filter on `app.current_org_id` session variable set by API middleware. DuckDB uses ephemeral per-request instances. Rate limiting is per-org via Redis token bucket. Data source credentials encrypted with per-org key derivation.

## Deployment modes

- **Cloud SaaS**: Next.js + managed Postgres + Redis + S3 + Claude API
- **On-prem Docker**: Single `docker run` with embedded Postgres/Redis
- **Airgapped K8s**: Local LLM (Ollama/vLLM) or AI disabled, plugins loaded from `/plugins` directory as .tar.gz files, zero network egress

## MCP server

Runs at `/mcp` from day one. Exposes tools for all UI operations so any agent can operate Lightboard programmatically. Also used for E2E testing via tool sequences.

Core tools: `list_data_sources`, `get_schema`, `execute_query`, `create_view`, `modify_view`, `change_visualization`, `set_variable`, `click_row`, `export_view`, `get_current_state`.

## Project docs (read in order for full context)

1. `00-project-overview.md` — Architecture, tech stack, repo structure, key concepts
2. `01-phase-1.md` — Phase 1 plan: foundation (weeks 1-6), all code standards, deliverables with schemas
3. `02-phase-2.md` — Phase 2 plan: persistence + sharing (weeks 7-12), variable system, layouts, RBAC
4. `lightboard-project-doc.docx` — Full project document with all phases, risk register, tech stack table

## Commands

```bash
# Local dev
docker compose up                    # Start full stack (app + Postgres + Redis + seed data)
pnpm dev                             # Start Next.js dev server
pnpm test                            # Run all unit + component tests
pnpm test:e2e                        # Run Playwright E2E tests against Docker stack
pnpm lint                            # ESLint + Prettier + tsc --noEmit
pnpm build                           # Production build

# Per-package
pnpm --filter @lightboard/query-ir test
pnpm --filter @lightboard/viz-core storybook

# Docker
docker build -t lightboard .         # Production image (multi-stage, rootless)
docker compose -f docker-compose.prod.yml up  # Production single-node

# Plugins (airgap)
lightboard plugin pack <name>        # Create .tar.gz on connected machine
# Copy to /plugins directory, restart or POST /api/admin/plugins/reload
```