# Phase 1 QA Test Plan

## Environment Setup

### Prerequisites

- Node.js >= 22
- pnpm 10.x
- Docker Desktop (for Postgres + Redis)
- Chrome or Chromium browser

### 1. Clone and install

```bash
git clone https://github.com/vichitra-paheli/Lightboard.git
cd Lightboard
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on port 5432 (user: `lightboard_admin`, password: `lightboard_admin_password`, database: `lightboard`)
- **Redis 7** on port 6379

### 3. Configure environment

```bash
cp .env.example apps/web/.env.local
```

Edit `apps/web/.env.local` and ensure:
```
DATABASE_URL=postgresql://lightboard_admin:lightboard_admin_password@localhost:5432/lightboard
DATABASE_APP_URL=postgresql://lightboard_admin:lightboard_admin_password@localhost:5432/lightboard
REDIS_URL=redis://localhost:6379
ENCRYPTION_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
AUTH_SECRET=dev-secret-change-in-production
```

### 4. Create telemetry schema and push database tables

```bash
docker exec lightboard-postgres psql -U lightboard_admin -d lightboard -c "CREATE SCHEMA IF NOT EXISTS telemetry;"
pnpm --filter @lightboard/db db:push
```

### 5. Seed demo data (optional)

```bash
cp .env.example packages/db/.env
pnpm --filter @lightboard/db db:seed
```

Creates:
- Demo org "Lightboard Demo"
- Admin user: `admin@lightboard.dev` / `lightboard123`
- Viewer user: `viewer@lightboard.dev` / `lightboard123`

### 6. Start the dev server

```bash
pnpm dev
```

Open http://localhost:3000 in your browser.

### 7. Run automated tests

```bash
pnpm test          # 203 unit tests across 10 packages
pnpm typecheck     # TypeScript type checking across 11 packages
pnpm lint          # ESLint + Prettier

# E2E tests (requires Postgres + Redis running)
cd apps/web && npx playwright test
```

---

## Features to Verify

### 1. Authentication (D2)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1.1 | Register new account | Go to `/register`, fill org name, name, email, password (8+ chars), click "Create account" | Redirected to `/`, dashboard visible with sidebar |
| 1.2 | Register validation — short password | Register with password < 8 chars | Error message shown, stays on register page |
| 1.3 | Register validation — duplicate email | Register with an already-used email | "Email already in use" error shown |
| 1.4 | Login with valid credentials | Go to `/login`, enter registered email + password, click "Log in" | Redirected to `/`, dashboard visible |
| 1.5 | Login with wrong password | Enter valid email, wrong password | "Invalid email or password" error shown |
| 1.6 | Logout | Click "Log out" in sidebar bottom | Redirected to `/login` |
| 1.7 | Session persistence | Login, close browser tab, open http://localhost:3000 again | Dashboard loads (not redirected to login) |
| 1.8 | Route protection | Without logging in, navigate to `/`, `/explore`, `/data-sources`, `/views`, `/settings` | All redirect to `/login` |
| 1.9 | API protection | `curl http://localhost:3000/api/auth/me` without cookie | Returns 401 JSON |
| 1.10 | Auth page redirect | While logged in, navigate to `/login` or `/register` | Redirected to `/` |

### 2. App Shell & Navigation (D1)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.1 | Sidebar navigation | Click each nav item: Home, Explore, Data Sources, Views, Settings | URL changes, active item highlighted, content area updates |
| 2.2 | Sidebar persistence | Navigate between pages | Sidebar remains visible, no layout shift or reload |
| 2.3 | Page transitions | Click between nav items | Smooth fade transition (no flash of white/blank) |
| 2.4 | Dark mode | System set to dark mode | All pages render with dark backgrounds, light text, visible borders |
| 2.5 | Light mode | System set to light mode | All pages render with light backgrounds, dark text |
| 2.6 | Responsive text | All pages | No hardcoded English visible outside of i18n strings |

### 3. Data Source Management (D11)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 3.1 | Empty state | Navigate to Data Sources with no sources configured | Shows "No data sources configured yet." with "Add data source" button |
| 3.2 | Add data source — form | Click "Add data source" | Form appears with Name, Type dropdown, Host, Port, Database, User, Password fields |
| 3.3 | Add data source — save | Fill form with valid Postgres details, click Save | Returns to list, new source visible with gray status dot |
| 3.4 | Data source persistence | Add a source, navigate to Home, navigate back to Data Sources | Source still visible in list |
| 3.5 | Test connection | Fill form, click "Test connection" | Shows success/failure message |
| 3.6 | Delete data source | Click Delete on a source, then Confirm | Source removed from list |
| 3.7 | Delete confirmation — cancel | Click Delete, then Cancel | Source remains, delete buttons return to normal |
| 3.8 | Schema browser | Click Schema on a configured source | Tree view of tables (may be empty if source not actually reachable) |
| 3.9 | Multiple sources | Add 2+ sources | All visible in list with correct names and types |

### 4. Explore Page (D10)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.1 | Layout | Navigate to Explore | Split panel: chat left, empty view right. Data source selector at top |
| 4.2 | Send message | Type a question, press Cmd+Enter or click Send | User message appears as right-aligned bubble |
| 4.3 | Agent response | Send any message | Agent response appears as left-aligned bubble (placeholder response if no API key) |
| 4.4 | New conversation | Click "New conversation" | Chat history cleared |
| 4.5 | Send button disabled during response | Send a message | Send button disabled while agent responds |
| 4.6 | Data source selector | If sources configured, select one from dropdown | Dropdown shows available sources |
| 4.7 | Without API key | Send message without `ANTHROPIC_API_KEY` set | Response explains API key is needed, shows the user's message |

### 5. View Spec Renderer (D9)

These are verified at the package level — the ViewRenderer is integrated into the Explore page but requires the agent to produce ViewSpecs (which requires a Claude API key). Verify via unit tests:

| # | Test Case | Verification |
|---|-----------|-------------|
| 5.1 | ViewSpec validation | `pnpm --filter @lightboard/viz-core test` — 38 tests pass including ViewSpec schema tests |
| 5.2 | Control components exist | Files present: `dropdown-control.tsx`, `date-range-control.tsx`, `text-input-control.tsx`, `toggle-control.tsx`, `control-bar.tsx` |

### 6. Chart Components (D6)

Verify via Storybook:

```bash
pnpm --filter @lightboard/viz-core storybook
```

Open http://localhost:6006 and verify:

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 6.1 | TimeSeriesLine — single series | Open Charts > TimeSeriesLine > SingleSeries | Line chart with time x-axis, single colored line |
| 6.2 | TimeSeriesLine — multi series | Open MultiSeries story | Multiple colored lines with legend |
| 6.3 | TimeSeriesLine — area fill | Open WithAreaFill story | Semi-transparent area below the line |
| 6.4 | TimeSeriesLine — dark theme | Open DarkTheme story | Chart on dark background with light text |
| 6.5 | BarChart — grouped | Open Charts > BarChart > Grouped | Side-by-side bars per category |
| 6.6 | BarChart — stacked | Open Stacked story | Stacked bars per category |
| 6.7 | BarChart — dark theme | Open DarkTheme story | Dark background, light axes |
| 6.8 | StatCard — basic | Open Charts > StatCard > BasicNumber | Large number with label |
| 6.9 | StatCard — sparkline | Open WithSparkline story | Number with mini trend line below |
| 6.10 | StatCard — thresholds | Open WithThresholds story | Number colored based on threshold (green/yellow/red) |
| 6.11 | DataTable — auto columns | Open Charts > DataTable > AutoColumns | Table with auto-detected columns from data |
| 6.12 | DataTable — pagination | Open LargeDataset story | Pagination controls at bottom, page through data |
| 6.13 | DataTable — sorting | Click a column header | Data sorts ascending/descending, arrow indicator shown |

### 7. Backend Packages (D3-D5, D7-D8, D12)

Verify via automated tests — no UI needed:

```bash
pnpm test
```

| # | Package | Tests | What it covers |
|---|---------|-------|---------------|
| 7.1 | `@lightboard/query-ir` | 40 | IR types, Zod validation, hash, variable interpolation, describe |
| 7.2 | `@lightboard/connector-sdk` | 6 | ConnectorRegistry, factory lookup |
| 7.3 | `@lightboard/connector-postgres` | 37 | IR-to-SQL translation (all operators, aggregations, joins, time ranges), Arrow type mapping |
| 7.4 | `@lightboard/compute` | 6 | DuckDB query, cross-source join, aggregation |
| 7.5 | `@lightboard/db` | 8 | Credential encryption roundtrip, Argon2 password hashing |
| 7.6 | `@lightboard/telemetry` | 24 | Spans, metrics, Postgres exporter, TelemetryConnector |
| 7.7 | `@lightboard/agent` | 28 | Tool routing, conversation management, system prompt, agent multi-round loop |
| 7.8 | `@lightboard/mcp-server` | 13 | All 5 MCP tools (success + error), server creation |
| 7.9 | `@lightboard/viz-core` | 38 | Theme, panel registry, auto-viz selector, ViewSpec validation |

### 8. CI Pipeline

| # | Test Case | Verification |
|---|-----------|-------------|
| 8.1 | Lint passes | CI "Lint & Type Check" job green |
| 8.2 | Unit tests pass | CI "Unit Tests" job green |
| 8.3 | Build succeeds | CI "Build" job green |
| 8.4 | E2E tests pass | CI "E2E Tests" job green (with Postgres + Redis services) |

### 9. Docker Compose

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.1 | Start services | `docker compose up -d` | Postgres and Redis containers start, become healthy |
| 9.2 | Postgres accessible | `docker exec lightboard-postgres psql -U lightboard_admin -d lightboard -c "SELECT 1"` | Returns `1` |
| 9.3 | Redis accessible | `docker exec lightboard-redis redis-cli ping` | Returns `PONG` |
| 9.4 | Schema push | `pnpm --filter @lightboard/db db:push` | "Changes applied" message |
| 9.5 | Seed data | `pnpm --filter @lightboard/db db:seed` | Creates demo org and users |

---

## Test Summary

| Category | Test Cases | Method |
|----------|-----------|--------|
| Authentication | 10 | Manual browser + E2E |
| App Shell | 6 | Manual browser |
| Data Sources | 9 | Manual browser |
| Explore Page | 7 | Manual browser |
| View Renderer | 2 | Unit tests |
| Charts | 13 | Storybook |
| Backend Packages | 9 (203 tests) | Automated |
| CI Pipeline | 4 | GitHub Actions |
| Docker | 5 | CLI commands |
| **Total** | **65 test cases** | |

## Known Limitations (Phase 1)

- **Agent requires Claude API key**: The Explore page chat returns a placeholder response without `ANTHROPIC_API_KEY` configured. Full agent loop (schema introspection → query → chart generation) requires a valid key.
- **Views are ephemeral**: Views created by the agent are not persisted to the database (Phase 2 feature).
- **No edit for data sources**: Edit button exists but reuses the Add form without pre-populating existing values.
- **Schema browser**: Shows empty when the target database is not actually reachable from the app server.
- **Single connector type**: Only PostgreSQL connector is implemented. MySQL/ClickHouse connectors are Phase 2+.
- **No CSV/Parquet upload UI**: DuckDB compute engine supports file loading but there's no upload UI yet.
