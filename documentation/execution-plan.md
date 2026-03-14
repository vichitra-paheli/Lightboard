# Lightboard Phase 1 — Execution Plan

**Duration**: Weeks 1–6 (March 16 – April 24, 2026)
**Team**: 4–5 engineers (3 frontend/fullstack, 1 backend/infra, 1 AI/agent)
**Repo**: [vichitra-paheli/Lightboard](https://github.com/vichitra-paheli/Lightboard)

---

## Dependency Graph

```
D1 (Repo setup) ─────────┬──────────────────────────────────────────────────┐
                          │                                                  │
                          ├── D2 (DB + Auth) ── D7 (Telemetry)              │
                          │                  └── D11 (Data Source UI) ◄──┐  │
                          │                                              │  │
                          ├── D4 (Query IR) ──┬── D3 (Connectors) ──────┤  │
                          │                   │        │                 │  │
                          │                   │   D3.1 ─┬── D3.2 ── D3.4│  │
                          │                   │         └── D3.3        │  │
                          │                   │                         │  │
                          │                   ├── D5 (DuckDB) ──────────┼──┤
                          │                   │                         │  │
                          │                   └── D9 (View Renderer) ◄──┼──┤
                          │                        │                    │  │
                          │                   D9.1 ── D9.2 ── D9.3     │  │
                          │                                             │  │
                          └── D6 (Charts) ──────────────────────────────┘  │
                               │                                           │
                          D6.1 ─┬── D6.2 ─┐                               │
                                ├── D6.3 ─┼── D6.5                         │
                                └── D6.4 ─┘                                │
                                                                           │
                          D8 (Agent) ◄── D3 + D4 + D5                     │
                               │                                           │
                          D8.1 ── D8.2 ── D8.3                            │
                                                                           │
                          D10 (Explore Page) ◄── D8 + D9                  │
                          D12 (MCP Server) ◄── D3 + D5 + D8               │
```

## Issue Cross-Reference Table

| Deliverable | GitHub Issue | Size | Sprint | Milestone | Blocked By |
|-------------|-------------|------|--------|-----------|------------|
| D1: Repository setup and app shell | [#1](https://github.com/vichitra-paheli/Lightboard/issues/1) | S | 1 | Sprint 1-2 | — |
| D2: Database schema and auth | [#2](https://github.com/vichitra-paheli/Lightboard/issues/2) | M | 1 | Sprint 1-2 | D1 |
| D4: Query IR definition | [#3](https://github.com/vichitra-paheli/Lightboard/issues/3) | S | 1 | Sprint 1-2 | D1 |
| D3: Connector SDK + PostgreSQL | [#4](https://github.com/vichitra-paheli/Lightboard/issues/4) | L | 1-2 | Sprint 1-2 | D1, D4 |
| D3.1: Connector SDK interface | [#13](https://github.com/vichitra-paheli/Lightboard/issues/13) | S | 1 | Sprint 1-2 | D1 |
| D3.2: Postgres connection + introspection | [#14](https://github.com/vichitra-paheli/Lightboard/issues/14) | M | 2 | Sprint 1-2 | D3.1 |
| D3.3: Postgres IR-to-SQL translator | [#15](https://github.com/vichitra-paheli/Lightboard/issues/15) | M | 2 | Sprint 1-2 | D3.1, D4 |
| D3.4: Postgres Arrow results + streaming | [#16](https://github.com/vichitra-paheli/Lightboard/issues/16) | S | 2 | Sprint 1-2 | D3.2 |
| D5: DuckDB compute integration | [#5](https://github.com/vichitra-paheli/Lightboard/issues/5) | M | 2 | Sprint 1-2 | D1, D4 |
| D6: Core visx chart components | [#6](https://github.com/vichitra-paheli/Lightboard/issues/6) | L | 2 | Sprint 1-2 | D1 |
| D6.1: Chart theme + panel adapter | [#17](https://github.com/vichitra-paheli/Lightboard/issues/17) | S | 1 | Sprint 1-2 | D1 |
| D6.2: TimeSeriesLine chart | [#18](https://github.com/vichitra-paheli/Lightboard/issues/18) | S | 2 | Sprint 1-2 | D6.1 |
| D6.3: BarChart | [#19](https://github.com/vichitra-paheli/Lightboard/issues/19) | S | 2 | Sprint 1-2 | D6.1 |
| D6.4: StatCard + DataTable | [#20](https://github.com/vichitra-paheli/Lightboard/issues/20) | S | 2 | Sprint 1-2 | D6.1 |
| D6.5: Auto-viz selector | [#21](https://github.com/vichitra-paheli/Lightboard/issues/21) | S | 2 | Sprint 1-2 | D6.2-D6.4 |
| D7: Telemetry foundation | [#7](https://github.com/vichitra-paheli/Lightboard/issues/7) | S | 2 | Sprint 1-2 | D2 |
| D8: AI agent with tool use | [#8](https://github.com/vichitra-paheli/Lightboard/issues/8) | L | 3 | Sprint 3 | D3, D4, D5 |
| D8.1: Agent abstraction + provider | [#22](https://github.com/vichitra-paheli/Lightboard/issues/22) | S | 3 | Sprint 3 | — |
| D8.2: Tool definitions + routing | [#23](https://github.com/vichitra-paheli/Lightboard/issues/23) | S | 3 | Sprint 3 | D8.1 |
| D8.3: System prompt + conversation | [#24](https://github.com/vichitra-paheli/Lightboard/issues/24) | S | 3 | Sprint 3 | D8.2 |
| D9: View spec renderer | [#9](https://github.com/vichitra-paheli/Lightboard/issues/9) | L | 3 | Sprint 3 | D4, D6 |
| D9.1: ViewSpec schema + renderer shell | [#25](https://github.com/vichitra-paheli/Lightboard/issues/25) | S | 3 | Sprint 3 | D4, D6.1 |
| D9.2: Control components | [#26](https://github.com/vichitra-paheli/Lightboard/issues/26) | M | 3 | Sprint 3 | D9.1 |
| D9.3: Variable binding + query re-execution | [#27](https://github.com/vichitra-paheli/Lightboard/issues/27) | S | 3 | Sprint 3 | D9.2 |
| D10: Explore page | [#10](https://github.com/vichitra-paheli/Lightboard/issues/10) | M | 3 | Sprint 3 | D8, D9 |
| D11: Data source management UI | [#11](https://github.com/vichitra-paheli/Lightboard/issues/11) | M | 3 | Sprint 3 | D2, D3 |
| D12: MCP server (Phase 1 subset) | [#12](https://github.com/vichitra-paheli/Lightboard/issues/12) | S | 3 | Sprint 3 | D3, D5, D8 |

## Parallel Work Streams by Week

### Week 1: Foundation (all hands)

| Engineer | Work | Issues |
|----------|------|--------|
| Fullstack 1 | Monorepo setup, Next.js app, CI, app shell | #1 (D1) |
| Fullstack 2 | (blocked on D1) Prepare DB schema design, Docker Compose | — |
| Frontend | (blocked on D1) Prepare chart theme design tokens | — |
| Backend | (blocked on D1) Prepare QueryIR type design, Connector interface design | — |
| AI Engineer | (blocked) Research agent patterns, prompt engineering | — |

> **Goal**: D1 merged by end of day 3–4. Remaining days: everyone starts their deliverables.

### Week 2: Core Packages (parallel streams)

| Engineer | Work | Issues |
|----------|------|--------|
| Fullstack 1 | App shell polish, help with D2 | #1 overflow |
| Fullstack 2 | Database schema, Drizzle ORM, auth, RLS, rate limiting | #2 (D2) |
| Frontend | Chart theme, panel adapter, start chart components | #17 (D6.1), #18, #19, #20 |
| Backend | QueryIR types + validation, Connector SDK interface | #3 (D4), #13 (D3.1) |
| AI Engineer | Agent provider abstraction (no dependencies) | #22 (D8.1) |

### Week 3: Connectors + Charts

| Engineer | Work | Issues |
|----------|------|--------|
| Fullstack 1 | Help with remaining D2 items | #2 overflow |
| Fullstack 2 | Telemetry foundation | #7 (D7) |
| Frontend | Remaining charts, auto-viz selector | #18-#21 (D6.2-D6.5) |
| Backend | Postgres connector (connection, introspection, IR-to-SQL) | #14, #15 (D3.2, D3.3) |
| AI Engineer | Tool definitions + routing | #23 (D8.2) |

### Week 4: Integration + Compute

| Engineer | Work | Issues |
|----------|------|--------|
| Fullstack 1 | Start ViewSpec schema + renderer shell | #25 (D9.1) |
| Fullstack 2 | Telemetry connector, integration testing | #7 overflow |
| Frontend | Chart polish, Storybook stories, visual tests | #6 overflow |
| Backend | Postgres Arrow results, DuckDB compute | #16 (D3.4), #5 (D5) |
| AI Engineer | System prompt + conversation management | #24 (D8.3) |

### Week 5: Agent + View Renderer

| Engineer | Work | Issues |
|----------|------|--------|
| Fullstack 1 | Control components | #26 (D9.2) |
| Fullstack 2 | Data source management UI | #11 (D11) |
| Frontend | Variable binding + query re-execution | #27 (D9.3) |
| Backend | MCP server (Phase 1 tools) | #12 (D12) |
| AI Engineer | Agent integration testing, prompt iteration | #8 overflow |

### Week 6: Integration + Polish

| Engineer | Work | Issues |
|----------|------|--------|
| Fullstack 1 | Explore page | #10 (D10) |
| Fullstack 2 | Data source UI polish, E2E tests | #11 overflow |
| Frontend | Explore page view panel, responsive polish | #10 support |
| Backend | MCP integration tests, Docker production config | #12 overflow |
| AI Engineer | Agent + Explore page integration, 10+ question pattern tests | #10 support |

## Exit Criteria Checklist

All must be true before starting Phase 2:

- [ ] A user can sign up, log in, and be scoped to an org with RLS enforced
- [ ] A user can add a PostgreSQL data source and see its schema
- [ ] A user can open Explore, type a natural language question, and receive an interactive chart with controls
- [ ] The agent correctly generates ViewSpecs for at least 10 common question patterns (time series, grouped bar, top N, etc.)
- [ ] Changing a control (dropdown, date range) re-executes the query and updates the chart
- [ ] A CSV file can be uploaded and queried through DuckDB
- [ ] Telemetry events are being written to Postgres and queryable via the built-in connector
- [ ] All tests pass, minimum 80% coverage on `packages/`
- [ ] The app runs in Docker Compose with a single `docker compose up`
- [ ] The MCP server responds to tool calls and can be used by an external agent
- [ ] CI pipeline (lint, type check, test, build) passes on every PR

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| D1 delays cascade to everything | High | Timebox to 3 days, assign strongest fullstack engineer |
| Arrow IPC adds complexity vs JSON | Medium | Start with JSON internally, add Arrow layer incrementally |
| Agent prompt quality varies | Medium | Invest in test suite of 10+ question patterns early |
| DuckDB Node.js bindings instability | Low | Pin version, have fallback to WASM if native breaks |
| visx learning curve | Low | Start with `@visx/xychart` high-level API, drop to low-level as needed |

## Labels

| Label | Color | Description |
|-------|-------|-------------|
| `type:foundation` | #1D76DB | Core infrastructure and setup |
| `type:package` | #0E8A16 | Package/library development |
| `type:feature` | #5319E7 | User-facing feature |
| `type:ui` | #FBCA04 | UI component work |
| `type:integration` | #D93F0B | Cross-package integration |
| `P0:critical` | #B60205 | Must have — blocks everything |
| `P1:high` | #D93F0B | High priority |
| `P2:normal` | #FBCA04 | Normal priority |
| `size:S` | #C5DEF5 | Small: 1–2 days |
| `size:M` | #BFD4F2 | Medium: 3–5 days |
| `size:L` | #0075CA | Large: 1–2 weeks |
| `phase:1` | #006B75 | Phase 1: Foundation (weeks 1–6) |

## Milestones

| Milestone | Due Date | Deliverables |
|-----------|----------|-------------|
| Sprint 1-2: Core Plumbing | April 10, 2026 | D1–D7 (issues #1–#7, #13–#21) |
| Sprint 3: Agent + First Loop | April 24, 2026 | D8–D12 (issues #8–#12, #22–#27) |
