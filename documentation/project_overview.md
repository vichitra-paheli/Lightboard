# Lightboard — Project Overview

## What is Lightboard?

Lightboard is an AI-native data exploration and visualization platform. Users connect data sources, ask questions in natural language, and receive interactive visualizations with thoughtful controls for further exploration. Views can be saved, composed into multi-panel layouts with template variables, and shared with access gating.

Lightboard is **not** a Grafana fork, **not** a monitoring tool, and **not** a BI platform with ETL. It connects directly to existing data stores and makes exploration effortless.

## Core principles

1. **AI-first interaction**: Users explore data through conversation. The agent understands schemas, generates interactive views, and iterates on follow-ups.
2. **Opinionated visualization**: Charts follow data viz best practices by default. The agent composes full HTML views with editorial framing (figure-number eyebrow, display-sans headline, body subtitle, mono footnotes) — no config hell.
3. **Deploy anywhere**: Cloud SaaS, on-prem Docker, fully airgapped Kubernetes — same codebase, same features (with graceful degradation for AI in airgap mode).
4. **Native app feel on the web**: Snappy UI with aggressive caching, skeleton loaders only for data fetches, instant navigation between views.

## Architecture layers

```
┌─────────────────────────────────────────────────┐
│                   App shell                      │
│  Next.js 15 · Auth · Routing · Plugin mgmt      │
├─────────────────────────────────────────────────┤
│         Multi-agent orchestration                │
│  Leader agent · Query agent · View agent         │
│  Insights agent · Session scratchpad (in-memory) │
├─────────────────────────────────────────────────┤
│              AI provider layer                   │
│  Claude API / Local LLM · Tool use · Streaming   │
├─────────────────────────────────────────────────┤
│              Visualization                       │
│  Agent-generated HTML in sandboxed iframe        │
├─────────────────────────────────────────────────┤
│           Data integration layer                 │
│  Connector SDK · Schema cache                    │
├─────────────────────────────────────────────────┤
│              Infrastructure                      │
│  Postgres · Redis · S3-compat · Docker/K8s       │
└─────────────────────────────────────────────────┘
```

### Multi-agent architecture

Instead of a single monolithic agent, Lightboard uses a chain of specialized LLM-powered agents:

- **Leader Agent**: Manages conversation, routes intent to specialists, handles scratchpad operations, streams responses to user.
- **Query Agent**: Schema exploration and SQL authoring via `run_sql` and `describe_table`. Receives curated schema context, focused on data retrieval.
- **View Agent**: Composes a complete HTML document — charts, layout, inline styles, embedded data — rendered in a sandboxed iframe on the client. Receives data summaries, not raw schemas.
- **Insights Agent**: Statistical observations, anomaly detection, trend analysis.
- **Session Scratchpad**: Per-conversation in-memory store for intermediate JSON rows. Agents save query results by name and reference them across turns for multi-step analysis.

The leader invokes sub-agents as tools (native tool_use). Sub-agents are "headless" — they run their own tool loops internally and return structured results. Only the leader streams text to the user.

## Tech stack

| Concern | Technology | License |
|---------|-----------|---------|
| Runtime | Node.js 22+ | MIT |
| Framework | Next.js 15 (app router) | MIT |
| Language | TypeScript (strict mode) | Apache-2.0 |
| UI components | shadcn/ui + Radix primitives · Tailwind CSS 4 (dark-only, design-system tokens) | MIT |
| Typography | Space Grotesk · Inter · JetBrains Mono (via `next/font/google`) | OFL |
| Visualization | Agent-generated HTML rendered in a sandboxed iframe | — |
| Server state | TanStack Query (react-query) | MIT |
| Client state | Zustand | MIT |
| URL state | nuqs | MIT |
| Layout | react-grid-layout | MIT |
| ORM | Drizzle ORM | Apache-2.0 |
| Database | PostgreSQL | PostgreSQL License |
| Cache | Redis / KeyDB | BSD-3 / BSD-2 |
| Auth | Lucia | MIT |
| i18n | next-intl | MIT |
| Testing | Vitest + Playwright + Testing Library | MIT |
| AI | Claude API (tool use) | Commercial |
| Deployment | Docker + Helm charts | — |

## Multi-tenancy model

Lightboard uses a **shared database, shared schema** multi-tenancy model with PostgreSQL Row Level Security (RLS):

- Every metadata table has an `org_id` column
- Postgres RLS policies enforce tenant isolation at the database level, not just application code
- API middleware extracts `org_id` from the session token and sets the Postgres session variable before every query
- Data source credentials are encrypted with per-org key derivation
- Rate limiting is per-org via Redis token bucket

## Key concepts

### HtmlView

The agent's primary output. A complete, self-contained HTML document — charts, layout, inline styles, embedded data — rendered in a sandboxed iframe on the client. Persisted to the database for later recall and sharing.

```typescript
interface HtmlView {
  title: string;
  description: string;
  sql: string;    // the SQL that produced the data
  html: string;   // full, self-contained document
}
```

### Connector SDK

TypeScript interface for data source plugins. Methods: `connect`, `introspect`, `querySQL`, `healthCheck`, `capabilities`. The agent executes raw SQL via `querySQL`, which returns JSON rows (`{ columns, rows, rowCount }`). Each connector is an npm package or local tarball.

### Agent tools

The five tools the leader (and specialists) use:

- `get_schema(source_id)` — returns the cached/bootstrapped schema document.
- `describe_table(source_id, table_name)` — columns, types, sample values, enum cardinality.
- `run_sql(source_id, sql)` — executes raw SQL against the source; returns JSON rows (LIMIT-enforced).
- `create_view({ title, description, sql, html })` — persists an `HtmlView`, emits `view_created` over SSE.
- `modify_view(view_id, patch)` — updates an existing HtmlView.

### Message model (`parts[]`)

The Explore chat state lives in `apps/web/src/components/explore/chat-message.tsx`. Each assistant message is an ordered `parts[]` array; each part is one of: `thinking`, `text`, `status`, `tool_call`, `agent_delegation`, `view`, `suggestions`. A pure reducer at `apps/web/src/components/explore/sse-reducer.ts` projects streaming SSE events onto the list, preserving temporal ordering between text and tool calls so the trace renders in the exact sequence the agent produced.

## Performance strategy

1. **Push to source**: Queries execute in the user's data source. The server is a proxy.
2. **LIMIT-enforced result sets**: The agent's `run_sql` tool enforces a row cap so result payloads stay small and visualizations stay snappy.
3. **Iframe isolation**: Generated HTML views render inside sandboxed iframes. View code (embedded scripts, inline styles) can never leak into the page shell or sibling views.

## Repository structure

```
lightboard/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/                # App router pages
│       ├── components/         # React components
│       ├── lib/                # Shared utilities
│       ├── messages/           # i18n catalogs (next-intl)
│       ├── stores/             # Zustand stores
│       └── styles/             # Global styles + design tokens
├── packages/
│   ├── agent/                  # Multi-agent orchestration (leader + query + view + insights)
│   │   ├── agents/             # Sub-agent implementations
│   │   ├── scratchpad/         # Per-session in-memory store
│   │   ├── prompt/             # Per-agent system prompts
│   │   └── tools/              # Per-agent tool definitions + router
│   ├── connector-sdk/          # Connector interface + JSON-row query types
│   ├── connectors/
│   │   └── postgres/           # Postgres connector (additional connectors deferred)
│   ├── db/                     # Drizzle schema + migrations + auth
│   ├── telemetry/              # OpenTelemetry SDK + built-in data source
│   └── ui/                     # Shared UI components (shadcn-based)
├── plugins/                    # Plugin directory (tarball loading)
├── docker/                     # Dockerfiles + compose
├── helm/                       # Kubernetes Helm charts
├── e2e/                        # Playwright E2E tests
└── documentation/              # Documentation
```

## Deployment modes

| Mode | AI | Plugins | Database | Use case |
|------|-----|---------|----------|----------|
| Cloud SaaS | Claude API | npm registry + local | Managed Postgres + Redis | Multi-tenant hosted service |
| On-prem Docker | Claude API or local LLM | Local tarballs + optional registry | Embedded or external Postgres | Single-tenant behind firewall |
| Airgapped K8s | Local LLM or disabled | Local tarballs only | External Postgres | Government, defense, regulated industries |

## What is NOT in scope for MVP

- Alerting (Phase 4 extension)
- ETL / data modeling / semantic layer
- Dashboard-as-code / Git-based provisioning
- Custom domain / white-labeling
- Geographic data residency
- SCIM provisioning / audit logs
- Billing / usage metering integration
