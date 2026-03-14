# Lightboard — Phase 1: Foundation

**Duration**: Weeks 1–6  
**Goal**: A working system where you connect a database, ask a question in natural language, and get an interactive chart. Views are ephemeral (saved in Phase 2).

**Team**: 4–5 engineers (3 frontend/fullstack, 1 backend/infra, 1 AI/agent)

---

## Code guidance

All code written in Phase 1 (and all subsequent phases) must follow these standards. These are non-negotiable and apply to every file, every PR, every feature.

### 1. No inline styles — extensible theming system

- **Never** use `style={{}}` props or inline CSS on React components.
- All styling goes through the shadcn/ui theme system and Tailwind CSS utility classes.
- Define all design tokens (colors, spacing, radii, typography, shadows) in the Tailwind config and CSS custom properties.
- Create a `ThemeProvider` component that reads user/org theme preferences and applies them via CSS variable overrides on the root element.
- Charts (visx) must read theme tokens from a React context (`useTheme()`) rather than hardcoded color values.
- Every color used in visualizations must come from a semantic palette (`chart.series.1`, `chart.series.2`, etc.) defined in the theme, so themes can be swapped without touching chart code.

```typescript
// WRONG
<div style={{ padding: '16px', backgroundColor: '#f5f5f5' }}>

// RIGHT
<div className="p-4 bg-muted">

// WRONG (in visx chart)
<Bar fill="#3b82f6" />

// RIGHT (in visx chart)
const { colors } = useChartTheme();
<Bar fill={colors.series[0]} />
```

### 2. Internationalization from ground up

- Use `next-intl` as the i18n framework.
- **Every** user-facing string must go through the translation system — no hardcoded English strings in components.
- Create a `/messages/en.json` file organized by feature namespace.
- Use the `useTranslations('namespace')` hook in every component that renders text.
- Date, number, and currency formatting must use `Intl` APIs via `next-intl` formatters, never manual string concatenation.
- Only English locale for now, but the infrastructure must be in place so adding a second language requires zero code changes — only a new JSON file.

```typescript
// WRONG
<h1>Data Sources</h1>
<p>No data sources configured yet.</p>

// RIGHT
const t = useTranslations('dataSources');
<h1>{t('title')}</h1>
<p>{t('emptyState')}</p>

// messages/en.json
{
  "dataSources": {
    "title": "Data sources",
    "emptyState": "No data sources configured yet."
  }
}
```

### 3. Clean, commented, maintainable code

- Every exported function, component, type, and interface must have a JSDoc comment explaining its purpose, parameters, and return value.
- Business logic must be separated from UI code. Use custom hooks (`useDataSources()`, `useQueryExecution()`) that encapsulate logic and expose only what the component needs.
- No code duplication. Extract shared logic into utility functions in `packages/` or `lib/`. If you copy-paste more than 3 lines, extract it.
- Follow the single responsibility principle: one component = one job. If a component exceeds ~150 lines, break it into sub-components.
- Use barrel exports (`index.ts`) for clean import paths.
- Constants go in dedicated files, never inline magic numbers or strings.

### 4. Best-in-class extensible libraries

Use these specific libraries for their respective concerns. Do not introduce alternatives without a documented justification in the PR.

| Concern | Library | Why |
|---------|---------|-----|
| Data tables | `@tanstack/react-table` | Headless, fully typed, virtualization-ready, extensible |
| Server state / caching | `@tanstack/react-query` | Stale-while-revalidate, deduplication, background refresh, cache invalidation |
| Client state | `zustand` | Minimal API, TypeScript-native, no boilerplate |
| URL state | `nuqs` | Type-safe URL search params, Next.js app router native |
| Forms | `react-hook-form` + `zod` | Performant (uncontrolled), schema validation |
| Grid layout | `react-grid-layout` | Proven drag/drop grid, responsive |
| Date handling | `date-fns` | Tree-shakeable, no mutation, lightweight |
| Icons | `lucide-react` | Consistent, tree-shakeable, shadcn default |

### 5. Snappy UI — native app feel

- **Never** show a full-page loader or skeleton for navigation between pages. Use Next.js `loading.tsx` only for data-dependent content areas.
- App shell (sidebar, header, navigation) must render instantly from cache/static. Only the content area shows loading states.
- Use `react-query` with `staleTime` and `gcTime` aggressively. Schema metadata, data source lists, and user preferences should be cached for minutes, not refetched on every navigation.
- Optimistic updates for all user actions (save view, rename, reorder panels). Show the result immediately, reconcile with the server in the background.
- Prefetch data for likely next actions. When the user hovers over a data source, prefetch its schema. When they open a layout, prefetch all panel queries in parallel.
- Virtualize all long lists (data source list, view list, table rows) using `@tanstack/react-virtual` or the built-in virtualization of `@tanstack/react-table`.
- Debounce expensive operations (search, filter text input) at 200ms. Throttle resize observers at 100ms.

### 6. shadcn/ui as the component library

- Use shadcn/ui components for all standard UI elements (buttons, inputs, selects, dialogs, sheets, dropdowns, tooltips, tabs, cards, etc.).
- **Do not** install shadcn as a package dependency. Use the CLI to copy components into `packages/ui/src/components/` and customize from there.
- All shadcn components must be wrapped in a thin abstraction layer so we can swap or extend them later without touching every consumer.
- Follow shadcn's Radix-based composition pattern for all custom components.

### 7. Caching and minimal over-the-wire data

- `react-query` is the single source of truth for all server state. Configure a global `QueryClient` with:
  - `staleTime: 5 * 60 * 1000` (5 minutes) for metadata (schemas, data source lists)
  - `staleTime: 60 * 1000` (1 minute) for query results
  - `gcTime: 30 * 60 * 1000` (30 minutes) for garbage collection
- API responses must include proper `Cache-Control` and `ETag` headers. Use conditional requests (`If-None-Match`) to avoid re-transferring unchanged data.
- Schema introspection results are cached server-side in Redis with a TTL of 10 minutes. The API returns a hash; the client only re-fetches if the hash changes.
- For query results, implement a server-side query result cache keyed by `hash(query_ir + variable_values + time_range)`. Cache hits return instantly. Cache TTL is configurable per data source.
- Use Apache Arrow IPC as the transfer format for query results instead of JSON. Arrow IPC is typically 2-5x smaller and avoids the parse cost of JSON.parse().
- Implement HTTP compression (Brotli preferred, gzip fallback) on all API responses.

### 8. Telemetry from ground up — dogfood as built-in data source

- Integrate OpenTelemetry SDK from day one for traces, metrics, and logs.
- Every API route, database query, connector call, and agent invocation is instrumented with spans.
- Collect structured metrics: query execution time (by connector type), cache hit/miss ratios, agent response time, rendering time (by chart type and data point count), error rates.
- Store telemetry in the same Postgres database (in a dedicated `telemetry` schema) so it's available as a built-in Lightboard data source.
- Create a built-in "Lightboard Telemetry" connector that reads from the telemetry schema. This is the first dogfooding data source — we visualize our own performance in our own tool.
- The telemetry collector must respect the deployment mode: in cloud SaaS, also export to an external OTLP endpoint; in airgapped mode, only write locally.

### 9. Testing from ground up

Every feature must ship with tests. PRs without tests will be rejected.

| Layer | Framework | What to test |
|-------|-----------|-------------|
| Unit | Vitest | Utility functions, IR translators, data transformations, Zustand stores |
| Component | Vitest + Testing Library | React component rendering, user interactions, prop variations |
| Integration | Vitest | API route handlers, connector query execution, auth flows |
| E2E | Playwright | Full user workflows: add data source → ask question → get chart → save view |
| Visual regression | Playwright screenshots | Chart rendering consistency across changes |

- Minimum coverage target: 80% line coverage for `packages/`, 60% for `apps/web/`.
- E2E tests must be runnable against a Docker Compose stack that includes Postgres with seed data.
- Use `msw` (Mock Service Worker) for mocking external APIs (Claude, data sources) in unit/component tests.

### 10. Git workflow — feature branches + review

- **Every** feature, bug fix, and refactor gets its own branch off `main`.
- Branch naming: `feat/short-description`, `fix/short-description`, `refactor/short-description`.
- All branches go through a GitHub Pull Request with at least one reviewer approval.
- PR description must include: what changed, why, how to test, and screenshots/recordings for UI changes.
- Squash merge to `main`. Linear commit history.
- CI pipeline runs on every PR: lint (ESLint + Prettier), type check (`tsc --noEmit`), unit tests, build. E2E tests run on merge to `main`.
- Use GitHub Actions for CI. Workflow files live in `.github/workflows/`.
- Protect `main` branch: require PR, require CI pass, require 1 approval.

### 11. MCP server for UI operations

- Build a Model Context Protocol (MCP) server from day one that exposes Lightboard's UI as tools.
- Any agent (Claude, Cursor, or custom) can connect to this MCP server and operate Lightboard like a human would.
- MCP tools to implement in Phase 1:

```
Tools:
  - list_data_sources() → DataSource[]
  - add_data_source(config) → DataSource
  - get_schema(source_id) → SchemaMetadata
  - execute_query(ir: QueryIR) → QueryResult
  - create_view(spec: ViewSpec) → View
  - modify_view(view_id, patch: Partial<ViewSpec>) → View
  - change_visualization(view_id, chart_type, config) → View
  - set_variable(view_id, variable_name, value) → View
  - click_row(view_id, row_index) → InteractionEvent
  - export_view(view_id, format: 'png' | 'csv') → Blob
  - get_current_state() → AppState
```

- The MCP server runs as a separate endpoint (`/mcp`) on the same process.
- E2E tests should be writable as MCP tool sequences, enabling agent-driven testing.
- The MCP server must be documented with tool descriptions that any LLM can understand.

### 12. Docker and Kubernetes deployments

- `Dockerfile` uses multi-stage build: build stage (Node.js + dependencies) → production stage (Node.js slim + built assets).
- `docker-compose.yml` for local development includes: Lightboard app, Postgres, Redis, and a seed data container.
- `docker-compose.prod.yml` for single-node production deployment.
- Helm chart in `/helm/lightboard/` with configurable values for: replica count, resource limits, Postgres connection, Redis connection, AI provider endpoint, plugin directory mount.
- Health check endpoints: `GET /api/health` (liveness), `GET /api/ready` (readiness — checks Postgres + Redis).
- All configuration via environment variables with sensible defaults. No config files to manage.
- Container image must be rootless (non-root user) and pass Trivy security scan.

---

## Sprint 1–2 (weeks 1–4): Core plumbing

### Deliverable 1: Repository setup and app shell

**Owner**: Fullstack 1  
**Estimate**: 3–4 days  

- Initialize monorepo with Turborepo.
- Scaffold Next.js 15 app with app router in `apps/web/`.
- Set up Tailwind CSS + shadcn/ui with theme tokens (CSS custom properties for all design tokens).
- Configure `next-intl` with English locale and namespace structure.
- Set up ESLint, Prettier, TypeScript strict mode, path aliases.
- Create app shell layout: sidebar navigation, top bar, content area. Sidebar and top bar render from static/cached data — never show loaders for chrome.
- Pages (empty shells): Home, Explore, Data Sources, Views, Settings.
- Set up GitHub repo with branch protection rules, PR template, CI workflow (lint + type check + test + build).

### Deliverable 2: Database schema and auth

**Owner**: Fullstack 2  
**Estimate**: 4–5 days  

- Set up Drizzle ORM with PostgreSQL in `packages/db/`.
- Schema tables (all with `org_id` column):
  - `organizations` — id, name, slug, settings (JSONB), created_at
  - `users` — id, org_id, email, name, password_hash, role (admin/editor/viewer), created_at
  - `sessions` — id, user_id, expires_at, token
  - `data_sources` — id, org_id, name, type, config (JSONB), credentials (encrypted JSONB), created_at, updated_at
  - `views` — id, org_id, created_by, name, spec (JSONB), version, created_at, updated_at
  - `telemetry_events` — id, org_id, event_type, payload (JSONB), created_at (in `telemetry` schema)
- Enable Postgres Row Level Security on all tables with `org_id`. Create RLS policies that filter on a session variable (`app.current_org_id`).
- Implement auth with Lucia: email/password registration, login, session management.
- API middleware that: validates session token, extracts org_id, sets Postgres session variable (`SET app.current_org_id = $1`), injects user context into request.
- Rate limiting middleware: Redis token bucket, 100 requests/minute per org for API, 20 requests/minute per org for query execution.
- Docker Compose for local dev: Postgres 16, Redis 7, app with hot reload.

### Deliverable 3: Connector SDK and PostgreSQL connector

**Owner**: Backend  
**Estimate**: 8–10 days  

- Define the Connector interface in `packages/connector-sdk/`:

```typescript
/**
 * Base interface that all data source connectors must implement.
 * Connectors translate the platform's QueryIR into source-native
 * queries and return results as Apache Arrow record batches.
 */
export interface Connector {
  /** Unique connector type identifier (e.g., 'postgres', 'mysql') */
  readonly type: string;

  /** Establish connection and validate credentials */
  connect(config: ConnectorConfig): Promise<void>;

  /** Return schema metadata: tables, columns, types, relationships */
  introspect(): Promise<SchemaMetadata>;

  /** Execute a query IR against this source, return Arrow batches */
  query(ir: QueryIR, options?: QueryOptions): Promise<ArrowResult>;

  /** Streaming variant for large result sets */
  stream(ir: QueryIR, options?: QueryOptions): AsyncIterable<ArrowRecordBatch>;

  /** Validate the connection is alive */
  healthCheck(): Promise<HealthCheckResult>;

  /** Declare what operations this connector supports natively */
  capabilities(): ConnectorCapabilities;

  /** Disconnect and clean up resources */
  disconnect(): Promise<void>;
}
```

- Implement `PostgresConnector` in `packages/connectors/postgres/`:
  - Connection via `pg` with connection pooling (`pg-pool`).
  - Schema introspection: query `information_schema.tables` + `information_schema.columns`, return typed `SchemaMetadata`.
  - IR-to-SQL translator: convert `QueryIR` to parameterized SQL. Support all IR operations (select, filter, group, aggregate, order, limit, time range).
  - Result conversion: use `pg-cursor` for streaming, convert rows to Apache Arrow record batches via `apache-arrow` npm package.
  - Health check: `SELECT 1` with timeout.
  - Capabilities declaration: full SQL pushdown (joins, subqueries, window functions).
- Write unit tests for IR-to-SQL translation (minimum 20 test cases covering all IR operations).
- Write integration tests against a Postgres container with seed data.

### Deliverable 4: Query IR definition

**Owner**: Backend  
**Estimate**: 3–4 days  

- Define all IR types in `packages/query-ir/`:
  - `QueryIR`, `FieldRef`, `FilterClause`, `Aggregation`, `OrderClause`, `TimeRange`
  - Filter operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `like`, `is_null`, `is_not_null`
  - Aggregation functions: `sum`, `avg`, `count`, `count_distinct`, `min`, `max`, `percentile`
  - Boolean combinators: `and`, `or` (nested arbitrarily)
- IR validator: Zod schema that validates an IR document is structurally correct.
- IR utilities: `hash(ir)` for cache keys, `interpolateVariables(ir, vars)` for template variable substitution, `describe(ir)` for human-readable summary.
- 100% test coverage on the IR package.

### Deliverable 5: DuckDB compute integration

**Owner**: Backend  
**Estimate**: 4–5 days  

- Set up DuckDB Node.js bindings (`duckdb-node`) in `packages/compute/`.
- `ComputeEngine` class that:
  - Creates ephemeral DuckDB instances per request (tenant isolation).
  - Registers Arrow tables as virtual DuckDB tables.
  - Executes SQL and returns Arrow record batches.
  - Handles cross-source joins: accept multiple Arrow inputs, register all, run join query.
- CSV/Parquet file loading: accept file upload, register in DuckDB, introspect schema, make queryable.
- Unit tests for: table registration, query execution, cross-source join, CSV loading.

### Deliverable 6: Core visx chart components

**Owner**: Frontend  
**Estimate**: 8–10 days  

- Create `packages/viz-core/` with chart theme context and panel adapter protocol.
- Chart theme: reads from the app's theme context, provides `colors.series[]`, `colors.axis`, `colors.grid`, `colors.text`, `typography`, `spacing`.
- Panel adapter protocol:

```typescript
/**
 * Interface for registering a React component as a Lightboard panel.
 * The host provides data, config, dimensions, and theme.
 * The plugin provides the rendering component and its config schema.
 */
export interface PanelPlugin<TConfig = Record<string, unknown>> {
  /** Unique plugin identifier (e.g., 'lightboard-line-chart') */
  id: string;
  /** Display name for the chart type selector */
  name: string;
  /** JSON Schema that drives the auto-generated config panel */
  configSchema: JSONSchema7;
  /** Declares what data shape this panel expects */
  dataShape: DataShapeDeclaration;
  /** The React component that renders the visualization */
  Component: React.FC<PanelProps<TConfig>>;
}

export interface PanelProps<TConfig = Record<string, unknown>> {
  /** Query result data as Arrow tables or plain arrays */
  data: DataSet;
  /** User-configured options (validated against configSchema) */
  config: TConfig;
  /** Available render dimensions */
  width: number;
  height: number;
  /** Theme tokens for colors, typography, spacing */
  theme: ChartTheme;
  /** Callback for user interactions (click, brush, hover) */
  onInteraction?: (event: PanelInteractionEvent) => void;
}
```

- Implement core chart components (all using visx, all reading from theme context, all responsive via `@visx/responsive`):
  - **TimeSeriesLine**: Line/area chart with time x-axis. Supports multiple series, tooltips, brush for zoom.
  - **BarChart**: Vertical and horizontal bars. Supports grouped, stacked. Categorical x-axis.
  - **StatCard**: Big number with optional sparkline. Color thresholds.
  - **DataTable**: Powered by TanStack Table. Sortable columns, pagination, virtualized rows for large datasets.
- Auto-viz selector: given column types from schema metadata, recommend the best chart type. Rules:
  - 1 time + 1 numeric → TimeSeriesLine
  - 1 categorical + 1 numeric → BarChart (vertical)
  - 1 numeric only → StatCard
  - Multiple columns, no clear pattern → DataTable
- Every chart component must have Storybook stories (or equivalent visual tests) with mock data.

### Deliverable 7: Telemetry foundation

**Owner**: Fullstack 2  
**Estimate**: 2–3 days  

- Set up OpenTelemetry SDK in `packages/telemetry/`.
- Auto-instrument: HTTP requests (Next.js middleware), Postgres queries (Drizzle), Redis operations.
- Custom spans: connector query execution, DuckDB compute, agent LLM calls.
- Metrics: query_duration_ms (histogram, by connector_type), cache_hit_total/cache_miss_total (counter), active_connections (gauge).
- Local exporter: write structured telemetry events to the `telemetry.events` table in Postgres.
- Implement `TelemetryConnector` — a built-in Lightboard connector that queries the telemetry schema. This is the first connector tested with real data.

---

## Sprint 3 (weeks 5–6): Agent + first interaction loop

### Deliverable 8: AI agent with tool use

**Owner**: AI engineer  
**Estimate**: 8–10 days  

- Implement the agent layer in `packages/agent/`.
- Agent receives: user message, conversation history, available data sources with schemas, current view state (if modifying).
- Tool definitions (Claude tool use format):

```typescript
const tools = [
  {
    name: 'get_schema',
    description: 'Get the schema (tables, columns, types) of a connected data source',
    input_schema: { source_id: 'string' }
  },
  {
    name: 'execute_query',
    description: 'Execute a query against a data source and return results',
    input_schema: { query_ir: QueryIRSchema }
  },
  {
    name: 'create_view',
    description: 'Create an interactive view with a chart and controls',
    input_schema: { view_spec: ViewSpecSchema }
  },
  {
    name: 'modify_view',
    description: 'Modify an existing view (change chart type, add filter, etc)',
    input_schema: { view_id: 'string', patch: PartialViewSpecSchema }
  }
];
```

- System prompt engineering: teach the agent to introspect schemas before querying, to generate view specs with thoughtful controls (dropdown filters for categorical columns, date range pickers for time columns), and to handle follow-up modifications.
- Agent abstraction layer: interface that works with Claude API but can be swapped to any OpenAI-compatible endpoint (for on-prem/airgap). The abstraction normalizes tool calling across providers.
- Streaming responses: agent text streams to the UI in real-time. Tool calls are shown as progress steps.
- Error handling: if a query fails, the agent sees the error and self-corrects (retry with modified query).
- Tests: mock Claude API responses, test tool call routing, test view spec generation for 10+ common question types.

### Deliverable 9: View spec renderer

**Owner**: Frontend  
**Estimate**: 8–10 days  

- `<ViewRenderer>` component that takes a `ViewSpec` JSON and renders:
  - The chart (using the panel adapter to select the right component)
  - Interactive controls above the chart (dropdowns, date pickers, multi-selects)
  - Controls are bound to template variables in the query IR
  - Changing a control re-executes the query with the new variable value (via react-query mutation)
- ViewSpec schema:

```typescript
interface ViewSpec {
  query: QueryIR;
  chart: {
    type: string;        // panel plugin id
    config: Record<string, unknown>; // chart-specific config
  };
  controls: ControlSpec[];
  title?: string;
  description?: string;
}

interface ControlSpec {
  type: 'dropdown' | 'multi_select' | 'date_range' | 'text_input' | 'toggle';
  label: string;
  variable: string;       // template variable name
  source?: QueryIR;       // query to populate options (for dropdown/multi_select)
  defaultValue?: unknown;
}
```

- Control components: built with shadcn/ui Select, DatePicker, Input, Switch.
- Loading state: show skeleton for the chart area while query executes. Controls render immediately (options load async).
- Error state: display error message with the failing query for debugging.

### Deliverable 10: Explore page

**Owner**: Fullstack 1  
**Estimate**: 4–5 days  

- Chat-based interface in the left panel, live view rendering in the right panel.
- Chat UI: message input, conversation history, agent responses with tool call progress indicators.
- When the agent creates or modifies a view, the right panel renders it live.
- Data source selector at the top (dropdown of configured sources).
- "New conversation" button that clears history and view.
- Keyboard shortcuts: Cmd+Enter to send, Cmd+K to focus data source selector.

### Deliverable 11: Data source management UI

**Owner**: Fullstack 2  
**Estimate**: 4–5 days  

- Settings > Data Sources page.
- List of configured data sources with health status indicators (green/red dot).
- "Add data source" flow: select type → fill connection form (auto-generated from connector's config schema) → test connection → save.
- Edit and delete existing data sources.
- Schema browser: after connecting, show tables and columns in a tree view.
- Forms built with react-hook-form + zod validation.

### Deliverable 12: MCP server (Phase 1 subset)

**Owner**: Backend  
**Estimate**: 3–4 days  

- MCP server endpoint at `/mcp` using the MCP TypeScript SDK.
- Phase 1 tools: `list_data_sources`, `get_schema`, `execute_query`, `create_view`, `get_current_state`.
- Each tool is documented with descriptions that enable any LLM to use it.
- Integration test: Playwright test that connects to the MCP server and executes a tool sequence (list sources → get schema → execute query → create view).

---

## Phase 1 exit criteria

All of the following must be true before starting Phase 2:

- [ ] A user can sign up, log in, and be scoped to an org with RLS enforced.
- [ ] A user can add a PostgreSQL data source and see its schema.
- [ ] A user can open Explore, type a natural language question, and receive an interactive chart with controls.
- [ ] The agent correctly generates view specs for at least 10 common question patterns (time series, grouped bar, top N, etc.).
- [ ] Changing a control (dropdown, date range) re-executes the query and updates the chart.
- [ ] A CSV file can be uploaded and queried through DuckDB.
- [ ] Telemetry events are being written to Postgres and queryable via the built-in connector.
- [ ] All tests pass, minimum 80% coverage on packages/.
- [ ] The app runs in Docker Compose with a single `docker compose up`.
- [ ] The MCP server responds to tool calls and can be used by an external agent.
- [ ] CI pipeline (lint, type check, test, build) passes on every PR.