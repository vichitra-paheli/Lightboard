# Lightboard — Phase 1.5: Multi-Agent Architecture + UI Overhaul

**Duration**: ~4 weeks
**Goal**: Replace the monolithic single-agent with a multi-agent chain of specialists, add intermediate data storage via DuckDB scratchpads, and overhaul the chat UI with markdown rendering, thinking state, expandable tool calls, and agent delegation indicators.

**Prerequisites**: Phase 1 core complete (auth, data sources, explore UI, single-agent wiring, SSE streaming).
**Branch**: `feat/phase-1.5-multi-agent` (feature branch on existing repo)

---

## Why Phase 1.5?

Phase 1 testing revealed that a single agent trying to reason about schemas, write queries, pick chart types, AND generate insights overloads the context window and produces inconsistent results. The agent often:
- Makes unnecessary `get_schema` calls even when schema is cached
- Generates invalid QueryIR because the prompt tries to cover too many concerns
- Picks wrong chart types because it lacks specialized visualization knowledge
- Cannot perform multi-step analysis (query A, transform, query B, compare)

**The solution**: Specialized agents with focused context windows, coordinated by a leader agent that handles conversation flow and delegates to specialists.

**Updated philosophy**: "AI-native no-fuss data analysis tool with deep UI integration for seamless human-AI workflow."

---

## Architecture

```
User Message
    |
    v
+---------------------------------------------+
|  Leader Agent (LLM-powered)                 |
|  - Conversation management                  |
|  - Intent routing                           |
|  - User-facing streaming responses          |
|  - Scratchpad catalog awareness             |
|  Tools: delegate_query, delegate_view,      |
|         delegate_insights,                  |
|         save_scratchpad, load_scratchpad,    |
|         list_scratchpads, query_scratchpad   |
+------+----------+----------+---------------+
       |          |          |
       v          v          v
+----------+ +----------+ +--------------+
|  Query   | |  View    | |  Insights    |
|  Agent   | |  Agent   | |  Agent       |
|  (LLM)   | |  (LLM)   | |  (LLM)       |
|          | |          | |              |
| Tools:   | | Tools:   | | Tools:       |
| get_     | | create_  | | analyze_data |
| schema,  | | view,    | | (DuckDB      |
| execute_ | | modify_  | |  stats)      |
| query,   | | view     | |              |
| run_sql  | |          | |              |
+----------+ +----------+ +--------------+
       |                         |
       v                         v
+---------------------------------------------+
|  Session Scratchpad (DuckDB per-session)    |
|  - Named intermediate tables                |
|  - Cross-table SQL queries                  |
|  - Explicit save to org-level persistence   |
+---------------------------------------------+
```

### Key design decisions

1. **All sub-agents are LLM-powered** — each gets its own Claude call with a focused system prompt and tool set. This maximizes flexibility for edge cases.

2. **Leader-calls-agents-as-tools pattern** — The leader invokes sub-agents via tool_use (e.g., `delegate_query`). This maps naturally to Claude's native tool calling. Sub-agents are "headless" — they return structured `SubAgentResult` objects, not streamed text.

3. **Only the leader streams to the user** — Sub-agent work is invisible to the user except via delegation indicators and tool call details.

4. **Scratchpad is session-scoped by default** — DuckDB instance per conversation. Users can explicitly save datasets to org-level storage for cross-session access.

5. **Backward compatible** — Existing `Agent` class gets a `multiAgent: boolean` config flag. Default `false` preserves current behavior. Set `true` to use the new LeaderAgent.

### Context management (tokens per agent)

| Agent | Context size | What it receives | What it does NOT receive |
|-------|-------------|-----------------|------------------------|
| Leader | ~800 tokens | Conversation history, scratchpad catalog, current view summary, data source names | Raw schemas, QueryIR spec, chart type catalog |
| Query Agent | ~2000 tokens | Full schema for target data source, QueryIR specification, SQL examples | ViewSpec templates, chart types |
| View Agent | ~1500 tokens | Chart type catalog, ViewSpec examples, control patterns, data summary (columns, types, row count, sample rows) | Raw schema, SQL syntax |
| Insights Agent | ~1000 tokens | Statistical analysis patterns, data summary, user question | Schema, ViewSpec, SQL |

---

## SSE Event Extensions

New events emitted by the leader for UI transparency:

```typescript
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; id: string }
  | { type: 'tool_end'; name: string; result: string; isError: boolean }
  | { type: 'agent_start'; agent: string; task: string }         // NEW
  | { type: 'agent_end'; agent: string; summary: string }         // NEW
  | { type: 'thinking'; text: string }                            // NEW
  | { type: 'done'; stopReason: string };
```

---

## Intermediate Data Scratchpad

### Concept

Playing with data often means creating intermediate datasets. The scratchpad gives agents (and by extension, users) the ability to:
- Save query results as named tables: "Save this as `monthly_revenue`"
- Query across multiple scratchpad tables: "Compare `monthly_revenue` with `monthly_costs`"
- Build multi-step analyses with precision that raw queries can't achieve

### Implementation

- **Engine**: Per-session DuckDB instance (reuses `packages/compute/ComputeEngine`)
- **Lifecycle**: Created lazily on first `save_scratchpad` call. Destroyed when conversation expires (1hr Redis TTL) or user starts new conversation.
- **Limits**: 100MB per session, 10 tables max, 100K rows per table
- **Persistence**: Session-only by default. Explicit "save dataset" command persists to org-level Parquet storage (future extension).

### Scratchpad tools (available to leader)

| Tool | Description |
|------|-------------|
| `save_scratchpad` | Save rows as a named DuckDB table with description |
| `load_scratchpad` | Load data from a named scratchpad table |
| `list_scratchpads` | List all available scratchpad tables with metadata |
| `query_scratchpad` | Run arbitrary SQL across scratchpad tables |

---

## UI Enhancements

### Markdown rendering
- `react-markdown` + `remark-gfm` + `rehype-highlight` for full GFM support
- Tables, code blocks with syntax highlighting, lists, bold/italic
- HTML sanitization via `rehype-sanitize`

### Thinking state
- Collapsible "Thinking..." section on assistant messages
- Shows agent reasoning when `thinking` events are received
- Collapsed by default, subtle muted styling

### Tool call details
- Each tool call badge is clickable/expandable
- Expanded view: tool name, input JSON, output JSON, duration
- Collapsed view: tool name + status icon (current behavior)

### Agent delegation indicators
- "Querying data...", "Creating visualization...", "Analyzing patterns..."
- Animated indicator (subtle pulse) during sub-agent execution
- Brief summary when sub-agent completes

---

## Deliverables

### D-1.5.1: Sub-agent interfaces + query agent extraction
**Size**: M (3-4 days) | **Depends on**: nothing

Create `SubAgent`, `AgentTask`, `SubAgentResult` interfaces. Extract query tools into `QueryAgent` specialist with its own focused system prompt.

### D-1.5.2: View agent + insights agent
**Size**: M (3-4 days) | **Depends on**: D-1.5.1

Implement `ViewAgent` (chart selection + ViewSpec generation) and `InsightsAgent` (statistical analysis via DuckDB). Each with focused prompts and tool sets.

### D-1.5.3: Session scratchpad (DuckDB intermediate data)
**Size**: M (3-4 days) | **Depends on**: nothing (parallel with D-1.5.1)

`SessionScratchpad` class using DuckDB, `ScratchpadManager` for lifecycle, scratchpad tool definitions. Per-session limits and stale session cleanup.

### D-1.5.4: Leader agent + orchestration
**Size**: L (5-6 days) | **Depends on**: D-1.5.1, D-1.5.2, D-1.5.3

Core deliverable. `LeaderAgent` with delegation tools, orchestration system prompt, new `AgentEvent` types (`agent_start`, `agent_end`, `thinking`). Backward-compatible `multiAgent` flag on `Agent` class.

### D-1.5.5: API route updates + session scratchpad wiring
**Size**: S (2-3 days) | **Depends on**: D-1.5.4

Wire `LeaderAgent` and `ScratchpadManager` into the API route. Emit new SSE events. Handle scratchpad lifecycle.

### D-1.5.6: Chat UI — markdown rendering + thinking state
**Size**: M (3-4 days) | **Depends on**: nothing (parallel with agent work)

Add `react-markdown` + `remark-gfm`, render assistant messages as markdown, add collapsible thinking state display. Extend `ChatMessageData` interface.

### D-1.5.7: Chat UI — tool call details + agent delegation indicators
**Size**: M (3-4 days) | **Depends on**: D-1.5.6

Expandable tool call component, agent delegation status indicator, handle new SSE events in `explore-page-client.tsx`.

### D-1.5.8: Integration tests + E2E
**Size**: M (3-4 days) | **Depends on**: D-1.5.5, D-1.5.7

Leader orchestration tests with mock provider, scratchpad unit tests, E2E tests for the full multi-agent flow.

### D-1.5.9: Documentation updates
**Size**: S (1-2 days) | **Depends on**: D-1.5.4

Update project_overview.md, phase_2.md, CLAUDE.md to reflect multi-agent architecture.

---

## Execution timeline

```
Week 1:  D-1.5.1 (sub-agent interfaces + query agent)
         D-1.5.3 (scratchpad)              <- parallel
         D-1.5.6 (UI: markdown + thinking) <- parallel

Week 2:  D-1.5.2 (view + insights agents)
         D-1.5.7 (UI: tool details + agent indicators) <- parallel

Week 3:  D-1.5.4 (leader agent + orchestration)

Week 4:  D-1.5.5 (API route wiring)
         D-1.5.8 (tests)                   <- parallel
         D-1.5.9 (docs)                    <- parallel
```

## Exit criteria

- [ ] Leader agent delegates to query, view, and insights specialists
- [ ] Each sub-agent has focused context under 2K tokens
- [ ] Multi-step analysis works: query -> save scratchpad -> query scratchpad -> visualize
- [ ] Chat messages render markdown (tables, code blocks, lists)
- [ ] Thinking state shows collapsible reasoning
- [ ] Tool calls expand to show input/output details
- [ ] Agent delegation indicators show which specialist is active
- [ ] Backward compat: `multiAgent: false` uses existing single-agent loop
- [ ] All existing Phase 1 tests continue to pass
- [ ] E2E tests verify full multi-agent flow

## Risk register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Multi-agent adds latency (2-4 serial LLM calls) | High | Sub-agents have lower maxRounds (3-5). Leader can parallelize independent delegations. Consider faster/cheaper model for sub-agents. |
| Higher API cost per user message | Medium | Monitor cost per conversation. Add per-org budget limits. Single-agent fallback remains available. |
| Sub-agent error propagation is confusing | Medium | Leader receives structured errors with context. Leader rephrases errors for user. toolCallLog provides transparency. |
| DuckDB scratchpad memory pressure | Low | Per-session limits (100MB, 10 tables). Cleanup interval destroys stale sessions. |
| Backward compat regression | Low | Feature flag `multiAgent: boolean`. All existing single-agent tests continue to pass. |
