# Lightboard — Phase 2: Persistence and Sharing

**Duration**: Weeks 7–12  
**Goal**: Users can save views, build multi-panel layouts with template variables, share with teammates, and use the visual query builder as a non-AI alternative.

**Prerequisites**: All Phase 1 exit criteria must be met.  
**Team**: Same 4–5 engineers, roles may shift based on Phase 1 learnings.

---

## Code guidance reminder

All Phase 1 code standards carry forward. In addition, Phase 2 introduces these specific patterns:

### View state management

- Views are stored as JSON documents in Postgres (`views` table, `spec` column as JSONB).
- Every save creates a new row with an incremented `version` number. Old versions are retained for history.
- The client-side view state uses Zustand with a `viewStore` that mirrors the server spec. Local changes are tracked as a dirty flag. Saving syncs to the server.
- URL state syncs template variable values via `nuqs`. The URL format is: `/view/:id?var-region=EMEA&var-quarter=Q3&from=now-7d&to=now`.
- Never store derived data (query results, chart render state) in the view spec. The spec is a recipe; the results are ephemeral.

### Layout state management

- A layout is a separate entity from views. The `layouts` table stores: id, org_id, name, panel_configs (JSONB array of `{ view_id, grid_position, overrides }`), shared_variables, shared_time_range.
- Panel configs reference view IDs, not embedded view specs. This means the same view can appear in multiple layouts.
- Grid position follows `react-grid-layout`'s format: `{ x, y, w, h, minW, minH }`.
- All panels in a layout share the same template variables and time range by default. Per-panel overrides are optional.

### Optimistic updates

- When a user saves a view, renames a layout, or reorders panels: update the local state immediately, show the result, and sync to the server in the background via `react-query` mutation.
- If the server rejects the mutation (validation error, permission denied), revert the local state and show an error toast.
- Use `react-query`'s `onMutate` / `onError` / `onSettled` pattern for all mutations.

### Cache invalidation

- When a view is saved, invalidate its `react-query` cache entry. Other views are unaffected.
- When a data source schema changes (detected via polling or explicit refresh), invalidate all schema caches for that source and show a toast suggesting the user refresh affected views.
- When team membership changes, invalidate permission-dependent queries (view lists, data source lists).

---

## Sprint 4–5 (weeks 7–10)

### Deliverable 13: Save and load views

**Owner**: Fullstack 1  
**Estimate**: 6–7 days  

Database additions:
- `views` table schema (extends Phase 1 stub):
  - `id` (uuid, primary key)
  - `org_id` (uuid, FK → organizations, RLS-enabled)
  - `created_by` (uuid, FK → users)
  - `name` (text, not null)
  - `description` (text, nullable)
  - `spec` (jsonb, not null) — the ViewSpec JSON
  - `version` (integer, not null, default 1)
  - `parent_version` (integer, nullable) — for version history
  - `visibility` (enum: 'private', 'team', 'org', 'public')
  - `locked_variables` (text[], default '{}') — variables that recipients cannot change
  - `tags` (text[], default '{}')
  - `created_at`, `updated_at` (timestamptz)
- Index on `(org_id, created_by)`, `(org_id, visibility)`, `(org_id, tags)`.

API endpoints:
- `POST /api/views` — create a new view (from the Explore page "Save" action)
- `GET /api/views` — list views for the current org (with filtering by tags, visibility, created_by)
- `GET /api/views/:id` — get a specific view (latest version)
- `GET /api/views/:id/versions` — list version history
- `GET /api/views/:id/versions/:version` — get a specific version
- `PUT /api/views/:id` — update view (creates new version)
- `DELETE /api/views/:id` — soft delete (set `deleted_at`)

UI changes:
- "Save view" button in the Explore page that captures the current view spec, prompts for a name, and persists.
- "Views" page: searchable, filterable list of saved views with cards showing name, chart type icon, last modified, creator.
- Click a view → opens it in full-screen view mode with controls and chart.
- "Edit" button → opens in Explore with the view spec loaded, enabling modification via AI or manual controls.
- Version history panel (slide-out sheet): shows versions with timestamps, allows reverting.

### Deliverable 14: Template variables system

**Owner**: Frontend  
**Estimate**: 10–12 days  

This is the most complex frontend deliverable. Take time to get the architecture right.

Variable types:
- **Query-driven**: Values populated by executing a query (e.g., `SELECT DISTINCT region FROM orders`). Refresh on load and when upstream variables change.
- **Custom list**: Static array of `{ label, value }` defined by the view creator.
- **Interval**: Time bucketing options (`1m`, `5m`, `15m`, `1h`, `6h`, `1d`). Used in aggregation queries.
- **Free text**: User-typed string input. Useful for search/filter terms.
- **Date range**: From/to date picker. Can serve as the global time range or a custom range variable.

Variable definition schema:
```typescript
interface VariableDefinition {
  /** Unique name within the view (used as $name in queries) */
  name: string;
  /** Display label shown above the control */
  label: string;
  /** Variable type determines the control rendered */
  type: 'query' | 'custom' | 'interval' | 'text' | 'date_range';
  /** For query type: the IR that fetches available values */
  query?: QueryIR;
  /** For custom type: static list of options */
  options?: Array<{ label: string; value: string }>;
  /** For interval type: which intervals to offer */
  intervals?: string[];
  /** Default value */
  defaultValue: unknown;
  /** Can this variable have multiple selected values? */
  multi?: boolean;
  /** Does this variable depend on another variable's value? */
  dependsOn?: string[];
  /** Is this variable locked when sharing? */
  locked?: boolean;
}
```

Implementation details:
- `VariableBar` component: renders a horizontal bar of controls at the top of a view or layout. Each variable renders as the appropriate shadcn/ui component (Select, MultiSelect, Input, DateRangePicker).
- Variable resolution engine: topological sort of variable dependencies, then resolve in order. If variable B depends on variable A, changing A triggers B's query to re-fetch options, then B's value resets to default.
- URL sync: all variable values sync to URL search params as `var-{name}={value}`. Multi-values as `var-{name}=a&var-{name}=b`. Use `nuqs` for type-safe URL param management.
- Query interpolation: before executing any query, the IR goes through `interpolateVariables(ir, currentValues)` which replaces `$variable` references with actual values.
- Global time range: a special variable `__timeRange` with `from` and `to` that binds to the time range picker in the top bar. All queries with a `timeRange` field in their IR use this unless overridden.

Testing:
- Unit tests for variable dependency resolution (cyclic dependency detection, topological sort).
- Unit tests for IR interpolation with all variable types.
- Component tests for each control type with mock options.
- E2E test: create a view with chained variables (org → team → person), verify changing org refreshes team options.

### Deliverable 15: Grid layout system

**Owner**: Frontend  
**Estimate**: 8–10 days  

Database additions:
- `layouts` table:
  - `id` (uuid, primary key)
  - `org_id` (uuid, FK → organizations, RLS-enabled)
  - `created_by` (uuid, FK → users)
  - `name` (text, not null)
  - `description` (text, nullable)
  - `panels` (jsonb, not null) — array of panel configs
  - `variables` (jsonb, not null) — shared variable definitions
  - `time_range` (jsonb) — shared time range config
  - `version` (integer, not null, default 1)
  - `visibility` (enum: 'private', 'team', 'org', 'public')
  - `created_at`, `updated_at` (timestamptz)

Panel config schema:
```typescript
interface PanelConfig {
  /** Reference to a saved view */
  viewId: string;
  /** Grid position (react-grid-layout format) */
  gridPos: { x: number; y: number; w: number; h: number; minW?: number; minH?: number };
  /** Override the view's chart type or config */
  chartOverride?: Partial<ChartConfig>;
  /** Override specific variable values for this panel */
  variableOverrides?: Record<string, unknown>;
  /** Use the layout's shared time range or a custom one */
  useSharedTimeRange?: boolean;
}
```

UI implementation:
- Layout editor mode: toggle between view mode (static) and edit mode (drag/drop).
- In edit mode: panels show drag handles, resize handles, and a toolbar with "Edit view", "Remove panel", "Duplicate panel".
- "Add panel" button: opens a sheet with a list of saved views to add. Can also create a new view inline (opens Explore in a modal).
- Responsive breakpoints: define grid columns for lg (12 cols), md (8 cols), sm (4 cols). `react-grid-layout` handles the breakpoint switching.
- Full-screen panel: click a panel's expand icon to view it full-screen with all controls. Press Esc to return.
- Auto-refresh: configurable interval (off, 10s, 30s, 1m, 5m) that re-executes all panel queries.
- All panels share the layout's variable bar (rendered once at the top). Variable changes re-execute all panels' queries simultaneously.

Performance:
- Panel queries execute in parallel (`Promise.all`), not sequentially.
- Each panel manages its own react-query cache entry. Stale panels show cached data while refreshing.
- Virtualize panels below the fold — only render panels visible in the viewport. Use Intersection Observer to lazy-load.

### Deliverable 16: Additional connectors

**Owner**: Backend  
**Estimate**: 10–12 days  

Build three more connectors following the established Connector SDK pattern:

**MySQL connector** (`packages/connectors/mysql/`):
- Connection via `mysql2` with connection pooling.
- IR-to-SQL translator (MySQL dialect — backtick quoting, LIMIT syntax, date functions).
- Schema introspection via `information_schema`.
- Full SQL pushdown capability.
- Tests: 15+ IR translation cases, integration test against MySQL container.

**REST/JSON API connector** (`packages/connectors/rest-api/`):
- Configurable: base URL, auth (none, API key header, Bearer token, basic auth), response JSONPath mapping.
- Schema is user-defined (manually specify field names and types, or auto-detect from a sample response).
- IR translation: maps filters to query params or request body fields. Limited pushdown — most computation happens in DuckDB post-fetch.
- Pagination support: offset/limit, cursor-based, link-header. Configurable per source.
- Caching: response cache with configurable TTL (since REST APIs are often slow).

**CSV/Parquet file connector** (`packages/connectors/csv-parquet/`):
- File upload via multipart form. Store in local filesystem (Docker volume) or S3-compatible storage.
- On upload: load into DuckDB, introspect schema automatically, create a persistent DuckDB table.
- Full SQL capability via DuckDB — this connector delegates everything to the compute engine.
- Support: CSV, TSV, Parquet, JSON lines, Excel (.xlsx via DuckDB's `spatial` extension).
- Max file size: configurable, default 500MB.

### Deliverable 17: Additional chart types

**Owner**: Frontend  
**Estimate**: 8–10 days  

Add five more chart components to `packages/viz-core/`, all following the panel adapter protocol:

- **ScatterPlot**: Two numeric axes. Size and color encoding for third/fourth dimensions. Tooltip on hover. Brush for selection. For >10K points, switch to canvas rendering automatically.
- **PieDonut**: Pie or donut chart. Legend with values. Click segment to filter. Max 12 segments, remainder grouped as "Other".
- **Heatmap**: Two categorical axes + color intensity for value. Color scale with legend. Tooltip on hover.
- **Histogram**: Single numeric field, auto-binned. Configurable bin count. Overlay normal distribution curve option.
- **HorizontalBar**: Bar chart rotated 90°. Useful for ranked lists (top 10 categories). Truncate long labels with ellipsis.

Update the auto-viz selector with new rules:
- 2 numeric columns → ScatterPlot
- 1 numeric column, no grouping → Histogram
- 1 categorical + 1 numeric, >8 categories → HorizontalBar
- 2 categorical + 1 numeric → Heatmap
- 1 categorical + 1 numeric, proportionality context → PieDonut

### Deliverable 18: Agent improvements

**Owner**: AI engineer  
**Estimate**: 8–10 days  

- **View modification**: Agent can modify an existing view in response to follow-up requests. "Now filter to Q3 only" → agent patches the filter clause. "Switch to a line chart" → agent changes the chart type. "Add a dropdown for department" → agent adds a control spec.
- **Multi-step exploration**: Agent can chain multiple tool calls in a single turn. "Compare revenue between regions, and show me the top 5 products in each" → agent creates a bar chart for revenue by region, then a follow-up table filtered by each region.
- **Explanation mode**: When the agent creates a view, it includes a brief explanation of what query it ran and why it chose that chart type. Displayed in the chat as a collapsible "How I built this" section.
- **Error recovery**: If a query fails (invalid column, permission denied, timeout), the agent analyzes the error, modifies the query, and retries. Maximum 3 retries before showing the error to the user.
- **Prompt tuning**: Dedicated effort to improve quality across 30+ common question patterns. Build a test suite of (question, expected_view_spec) pairs and measure accuracy.

### Deliverable 19: Visual query builder

**Owner**: Fullstack 2  
**Estimate**: 8–10 days  

A non-AI alternative for constructing queries visually. This is critical for users who prefer direct control or for airgapped deployments without an LLM.

UI components:
- **Source selector**: dropdown of connected data sources.
- **Table selector**: after choosing a source, dropdown of available tables.
- **Field selector**: multi-select checkboxes for columns to include. Shows column name, type icon, and sample values.
- **Filter builder**: add filter rows. Each row: field (dropdown) → operator (dropdown, filtered by field type) → value (input, with autocomplete for categorical fields). AND/OR toggle between rows.
- **Group by**: drag fields from the field selector into a "Group by" zone.
- **Aggregation**: for each numeric field in the select, choose an aggregation function (sum, avg, count, etc.).
- **Sort**: order by dropdown + asc/desc toggle.
- **Limit**: numeric input.
- **Time range**: date range picker that binds to a time column.

The visual query builder produces a `QueryIR` — the same IR that the agent produces. This means:
- The auto-viz selector works identically.
- The view spec is identical regardless of whether the AI or the visual builder created it.
- Users can start with the AI, switch to the visual builder to tweak, and back.

---

## Sprint 6 (weeks 11–12)

### Deliverable 20: Sharing system

**Owner**: Fullstack 1  
**Estimate**: 8–10 days  

**Link sharing**:
- "Share" button on every view and layout.
- Generates a URL with the current variable state embedded: `/view/:id?var-region=EMEA&var-quarter=Q3`.
- Creator can set visibility: private (only them), team (their teams), org (everyone in the org), public (anyone with the link).
- Creator can lock specific variables (recipients see them as read-only labels, not interactive controls).
- Public links work without authentication. Queries execute with a restricted service account that has read-only access to the specific data source.

**Embed**:
- Generate an iframe embed code: `<iframe src="https://app.lightboard.io/embed/:id?token=...">`.
- Embed token is a JWT with: view_id, org_id, allowed_variables (for security), expiry.
- Embedded views render without the app shell (no sidebar, no header). Just the chart + controls.

**Permissions checks**:
- Every API call that reads a view checks: does the requesting user have access? (org membership + visibility level + team membership).
- Every query execution checks: does the requesting user (or the view's visibility level) have permission to query this data source?
- Row-level security via variable injection: if the user's profile has `region: 'EMEA'`, and the view has a `$region` variable, the system can optionally force `$region = 'EMEA'` for that user regardless of what the URL says.

### Deliverable 21: Teams and RBAC

**Owner**: Backend  
**Estimate**: 8–10 days  

Database additions:
- `teams` table: id, org_id, name, created_at
- `team_members` table: team_id, user_id, role (admin, member)
- `data_source_permissions` table: data_source_id, grantee_type (user/team/org), grantee_id, permission (query/admin)
- `view_permissions` table: view_id, grantee_type, grantee_id, permission (view/edit/admin)

API endpoints:
- CRUD for teams and team membership.
- Assign data source permissions to users/teams.
- Permission check middleware that evaluates access before every query and view operation.

UI:
- Settings > Teams page: create teams, add/remove members, assign roles.
- Data source settings: "Permissions" tab showing who can query this source.
- View sharing dialog: shows current permissions, allows adding team/user access.

### Deliverable 22: OAuth integration

**Owner**: Fullstack 2  
**Estimate**: 4–5 days  

- Add Google OAuth and GitHub OAuth via Lucia's OAuth adapters.
- Login page: email/password form + "Sign in with Google" + "Sign in with GitHub" buttons.
- Account linking: if a user signs in with OAuth and an account with that email already exists, prompt to link accounts.
- Auto-create org: first-time OAuth users get a new org created automatically.

### Deliverable 23: Export system

**Owner**: Frontend  
**Estimate**: 4–5 days  

- **CSV export**: download the current query result as a CSV file. Uses the cached query result (no re-execution). Triggered from a "Download" menu on any panel.
- **PNG export**: capture the current chart as a PNG image. Use `html-to-image` library to screenshot the panel DOM. Include the title and current variable values in the image.
- **PDF export** (layouts only): render each panel as a PNG, compose into a multi-page PDF using `jsPDF`. Include layout title, variable values, and timestamp.
- All exports include metadata (source, query description, time range, variable values) as a footer or separate sheet.

### Deliverable 24: MCP server expansion

**Owner**: Backend  
**Estimate**: 3–4 days  

Expand the MCP server with Phase 2 tools:

```
New tools:
  - save_view(name, spec) → View
  - list_views(filters?) → View[]
  - open_view(view_id) → ViewState
  - create_layout(name, panels) → Layout
  - add_panel_to_layout(layout_id, view_id, position) → Layout
  - change_visualization(view_id, chart_type, config) → View
  - set_variable(name, value) → void
  - click_row(view_id, row_index) → InteractionEvent
  - set_time_range(from, to) → void
  - export_view(view_id, format) → { url: string }
  - share_view(view_id, visibility, locked_vars?) → { share_url: string }
```

- Update E2E tests to use MCP tool sequences for full workflows.
- Document all tools with input/output schemas and examples.

---

## Phase 2 exit criteria

All of the following must be true before starting Phase 3:

- [ ] Views can be saved, loaded, versioned, and reverted.
- [ ] Template variables work: query-driven, custom list, interval, text, date range. Chaining works.
- [ ] Variable values sync to URL and can be shared via link.
- [ ] Multi-panel layouts with drag/drop work. All panels share variables and time range.
- [ ] MySQL, REST/JSON API, and CSV/Parquet connectors are functional and tested.
- [ ] All 10 chart types render correctly with the auto-viz selector choosing appropriately.
- [ ] The visual query builder produces valid QueryIR and can be used without the AI agent.
- [ ] Link sharing works with public/private/team/org visibility levels.
- [ ] Locked variables work: recipients see them as read-only.
- [ ] Teams exist and data source permissions are enforced.
- [ ] OAuth (Google + GitHub) login works.
- [ ] CSV and PNG export work from any panel.
- [ ] The MCP server supports all Phase 2 tools and is tested via E2E.
- [ ] All tests pass, minimum 80% coverage on packages/, 60% on apps/web/.
- [ ] The full stack runs in Docker Compose with seed data that demonstrates all features.
- [ ] Performance: < 200ms from query result to chart render for datasets under 10K rows.