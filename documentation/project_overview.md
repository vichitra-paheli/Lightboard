# Lightboard — Project Overview

## What is Lightboard?

Lightboard is an AI-native data exploration and visualization platform. Users connect data sources, ask questions in natural language, and receive interactive visualizations with thoughtful controls for further exploration. Views can be saved, composed into multi-panel layouts with template variables, and shared with access gating.

Lightboard is **not** a Grafana fork, **not** a monitoring tool, and **not** a BI platform with ETL. It connects directly to existing data stores and makes exploration effortless.

## Core principles

1. **AI-first interaction**: Users explore data through conversation. The agent understands schemas, generates interactive views, and iterates on follow-ups.
2. **Opinionated visualization**: Charts follow data viz best practices by default. Auto-selection of chart types, sane defaults, publication-quality output without config hell.
3. **Deploy anywhere**: Cloud SaaS, on-prem Docker, fully airgapped Kubernetes — same codebase, same features (with graceful degradation for AI in airgap mode).
4. **Native app feel on the web**: Snappy UI with aggressive caching, skeleton loaders only for data fetches, instant navigation between views.

## Architecture layers

```
┌─────────────────────────────────────────────────┐
│                   App shell                      │
│  Next.js 15 · Auth · Routing · Plugin mgmt      │
├─────────────────────────────────────────────────┤
│              AI agent layer                      │
│  Claude API / Local LLM · Tool use · View specs  │
├─────────────────────────────────────────────────┤
│            Visualization engine                  │
│  visx · Panel adapter protocol · Canvas fallback │
├─────────────────────────────────────────────────┤
│             Compute engine                       │
│  DuckDB (native + WASM) · Apache Arrow IPC       │
├─────────────────────────────────────────────────┤
│           Data integration layer                 │
│  Connector SDK · Query IR · Schema cache         │
├─────────────────────────────────────────────────┤
│              Infrastructure                      │
│  Postgres · Redis · S3-compat · Docker/K8s       │
└─────────────────────────────────────────────────┘
```

## Tech stack

| Concern | Technology | License |
|---------|-----------|---------|
| Runtime | Node.js 22+ | MIT |
| Framework | Next.js 15 (app router) | MIT |
| Language | TypeScript (strict mode) | Apache-2.0 |
| UI components | shadcn/ui + Radix primitives | MIT |
| Visualization | visx + d3-scale + d3-shape | MIT |
| Data tables | TanStack Table (react-table) | MIT |
| Server state | TanStack Query (react-query) | MIT |
| Client state | Zustand | MIT |
| URL state | nuqs | MIT |
| Layout | react-grid-layout | MIT |
| Compute engine | DuckDB (native + WASM) | MIT |
| Data interchange | Apache Arrow IPC | Apache-2.0 |
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
- DuckDB compute uses ephemeral per-request instances to prevent data leakage between tenants

## Key concepts

### Query IR (Intermediate Representation)
The lingua franca of the system. The AI agent produces it. The visual query builder produces it. Template variables interpolate into it. Each connector translates it to native query syntax (SQL, PromQL, etc).

```typescript
interface QueryIR {
  source: string;              // data source uid
  select: FieldRef[];          // columns to return
  filters: FilterClause[];     // where conditions (AND/OR trees)
  groupBy: FieldRef[];         // group by columns
  aggregations: Aggregation[]; // sum, avg, count, min, max, percentile, distinct_count
  orderBy: OrderClause[];      // sort
  limit?: number;
  timeRange?: TimeRange;       // { from, to, field }
  variables?: Record<string, string>; // template variable references
}
```

### View spec
The agent's primary output. A declarative JSON document describing a complete interactive panel: query, chart type + config, interactive controls bound to template variables, layout hints.

### Panel adapter protocol
The interface for plugging any React component into Lightboard as a visualization panel. Exposes: data (Arrow tables), config (auto-generated from JSON Schema), dimensions, theme tokens, and interaction callbacks.

### Connector SDK
TypeScript interface for data source plugins. Methods: `connect`, `introspect`, `query`, `stream`, `healthCheck`, `capabilities`. Each connector is an npm package or local tarball.

## Performance strategy

1. **Push to source**: 90% of queries execute in the data source. The server is a proxy.
2. **DuckDB for compute**: Cross-source joins, CSV analysis, post-query transforms run in DuckDB (C++ speed via native bindings on server, WASM in browser). 10-100x faster than JavaScript for analytical workloads.
3. **Apache Arrow as wire format**: Zero-copy data transfer between DuckDB, Node.js, browser Web Workers, and the rendering layer.
4. **Tiered rendering**: SVG for <5K points, Canvas for 5-50K, LTTB downsampling + WebGL (deck.gl) for 50K+.

## Repository structure (target)

```
lightboard/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/                # App router pages
│       ├── components/         # React components
│       ├── lib/                # Shared utilities
│       ├── styles/             # Global styles + theme tokens
│       └── i18n/               # Internationalization
├── packages/
│   ├── connector-sdk/          # Connector interface + types
│   ├── connectors/
│   │   ├── postgres/
│   │   ├── mysql/
│   │   ├── clickhouse/
│   │   ├── rest-api/
│   │   ├── csv-parquet/
│   │   ├── prometheus/
│   │   └── elasticsearch/
│   ├── query-ir/               # IR types + validators
│   ├── compute/                # DuckDB integration + Arrow pipeline
│   ├── viz-core/               # visx chart components + panel adapter
│   ├── agent/                  # AI agent + tool definitions
│   ├── ui/                     # Shared UI components (shadcn-based)
│   ├── telemetry/              # Telemetry collection + built-in data source
│   ├── mcp-server/             # MCP server for UI operations
│   └── db/                     # Drizzle schema + migrations
├── plugins/                    # Plugin directory (tarball loading)
├── docker/                     # Dockerfiles + compose
├── helm/                       # Kubernetes Helm charts
├── e2e/                        # Playwright E2E tests
└── docs/                       # Documentation
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