# Lightboard Simplification Plan

## The Problem

Lightboard has scope bloat. The prototype at `D:\cowcorner_model\chat` proved that Claude + raw SQL + full HTML generation produces better results than any abstraction layer. The current codebase has 10 packages and several that add complexity without proven value.

## What the Prototype Proved

1. **Raw SQL beats QueryIR** — Claude writes SQL directly. An intermediate representation adds translation overhead, limits expressiveness (no window functions, CTEs, JSONB operators), and the agent has to learn two query languages.
2. **Full HTML generation beats viz components** — Claude composes multi-panel layouts, dual-encoded charts, scatter plots with annotations. No visx component library would produce these compositions. The viz-core panel adapter protocol is solving a problem that doesn't exist when the AI generates the entire visualization.
3. **DuckDB compute tier is unnecessary** — The agent queries the user's database directly. A local DuckDB engine for cross-source joins is a future feature, not a launch requirement. The scratchpad can use simpler in-memory storage.
4. **Schema context >> query IR validation** — Query quality comes from good schema documentation, not from Zod-validating an IR object.

## What to Keep

| Package | LOC | Why |
|---------|-----|-----|
| **agent** | 5,258 | Core product. Multi-agent orchestration, tool use, conversation management. Port prototype learnings. |
| **db** | 628 | Auth, sessions, data sources, views — essential for multi-tenancy. |
| **connector-sdk** | 292 | Clean interface. Keep but simplify (drop Arrow requirement, return JSON rows). |
| **connectors/postgres** | 979 | Only connector needed for launch. Simplify: drop Arrow conversion, drop QueryIR translator, add raw SQL execution + `describe_table`. |
| **telemetry** | 759 | Data flywheel (Item 4). Keep. |
| **ui** | 195 | shadcn components. Keep. |
| **apps/web** | 4,818 | Frontend. Keep but simplify viz rendering (iframe HTML instead of panel adapter). |

## What to Kill or Defer

| Package | LOC | Why |
|---------|-----|-----|
| **query-ir** | 854 | Agent writes raw SQL. IR adds complexity without value. Remove from agent tools, keep types file only if views need it for persistence. |
| **viz-core** | 1,833 | Prototype proved full HTML generation is superior. Replace panel adapter with iframe rendering. Defer visx charts to later. |
| **compute** | 295 | DuckDB not needed at launch. Scratchpad can be simpler (in-memory JSON or temp Postgres tables). |
| **mcp-server** | 444 | Scaffolded only. Defer entirely. |

**Lines removed: ~3,426** (23% of codebase)
**Dependencies removed: DuckDB, Apache Arrow, visx, d3-scale, d3-shape, @tanstack/react-table**

## Key Architecture Changes

### 1. Agent tools: drop QueryIR, add raw SQL + describe_table

Current tools:
- `get_schema(source_id)` — keep
- `execute_query(source_id, query_ir)` — **replace with `run_sql(source_id, sql)`**
- `run_sql(source_id, sql)` — already exists, make it primary
- `create_view(view_spec)` — keep but ViewSpec.query becomes raw SQL string

Add:
- `describe_table(source_id, table_name)` — returns columns, types, sample values (from prototype)
- `check_query_hints(tables, columns)` — returns known pitfalls (from roadmap Item 5)

### 2. Visualization: iframe HTML instead of panel adapter

Current flow: Agent → ViewSpec → panel adapter → visx component rendering
New flow: Agent → generates full HTML → rendered in iframe (exactly like prototype)

This means:
- ViewAgent's output is an HTML string, not a ViewSpec with chart config
- Frontend renders HTML in a sandboxed iframe
- PNG export via html2canvas on iframe content (proven in prototype)
- The design checklist in the system prompt drives quality

ViewSpec still useful for persistence (saving views to DB), but the `chart` field becomes `{ type: 'html', html: string }` instead of `{ type: 'bar-chart', config: {...} }`.

### 3. Scratchpad: drop DuckDB, use temp Postgres tables or in-memory

Current: DuckDB per-session with Arrow tables
New: Either temp tables in the user's connected Postgres, or simple in-memory Map with JSON rows

The scratchpad's value is letting the agent break complex analysis into steps. It doesn't need a separate query engine.

### 4. Connector: simplify to JSON rows

Current: Returns Apache Arrow IPC buffers
New: Returns `{ columns: string[], rows: Record<string, unknown>[], rowCount: number }`

Arrow is great for performance at scale but adds complexity everywhere (serialization, deserialization, type mapping). JSON rows are simpler, debuggable, and sufficient for the result sizes we're dealing with (500 row LIMIT).

### 5. Schema bootstrap: invest here

Current: `get_schema` returns raw pg_catalog introspection
New: `bootstrap` command that generates a curated schema context document:
- Table descriptions, key columns, types
- Foreign key relationships as join patterns
- Enum/categorical value sampling
- Row counts and date ranges
- Example queries for common patterns

This is the single highest-leverage improvement. The prototype proved that good schema context = 2-round queries, bad context = 14 rounds.

## Implementation Order

### Week 1: Strip and simplify
1. Remove `query-ir` from agent tools (keep types for backward compat)
2. Make `run_sql` the primary query tool
3. Add `describe_table` tool to agent
4. Remove `compute` package dependency from agent
5. Simplify connector to return JSON rows

### Week 2: HTML visualization
1. Add HTML generation mode to ViewAgent
2. Port design system + checklist from prototype into `view-prompt.ts`
3. Replace panel adapter rendering in frontend with iframe
4. Add html2canvas PNG export
5. Add timeline filmstrip

### Week 3: Schema bootstrap
1. Build `bootstrap` CLI command
2. Generates `schema_context.md` from database introspection
3. Agent loads this as system prompt context
4. Add `check_query_hints` tool

### Week 4: Polish
1. SSE status streaming (port from prototype)
2. Remove dead packages (compute, query-ir, viz-core)
3. Update tests
4. Clean up dependencies

## What This Enables

After simplification, Lightboard is:
- **Smaller**: 10 packages → 6, ~3.4K lines removed
- **Simpler**: Agent writes SQL, generates HTML. No IR translation, no component protocol.
- **Better viz**: Full HTML generation produces richer, more creative visualizations than component templates
- **Faster to develop**: Less abstraction = less code to maintain, fewer things to break
- **Same capabilities**: Auth, multi-tenancy, conversation persistence, scratchpad, telemetry all preserved

The deferred items (DuckDB, visx components, MCP server, additional connectors) can be added later as the product matures and specific use cases demand them.
