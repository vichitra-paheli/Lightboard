# Lightboard

AI-native data exploration and visualization platform. Connect databases, ask questions in natural language, get interactive charts, save them as views, compose dashboards, and share with access control.

## Architecture

Lightboard is a TypeScript monorepo built with Turborepo and pnpm workspaces.

```
lightboard/
├── apps/web/              # Next.js 15 (app router) — main application
├── packages/
│   ├── agent/             # Multi-agent orchestration (leader + specialists)
│   ├── connector-sdk/     # Data source adapter interface (JSON rows)
│   ├── connectors/        # Postgres connector
│   ├── db/                # Drizzle schema, auth, migrations
│   ├── telemetry/         # OpenTelemetry SDK + built-in data source
│   └── ui/                # shadcn/ui component library
├── docker/                # Docker Compose for local dev
└── e2e/                   # Playwright E2E tests
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (app router, Turbopack) |
| UI | shadcn/ui + Tailwind CSS v4 (dark-only, design-system tokens) |
| Typography | Space Grotesk · Inter · JetBrains Mono |
| Visualization | Agent-generated HTML in a sandboxed iframe |
| State | Zustand (client), @tanstack/react-query (server) |
| ORM | Drizzle ORM + PostgreSQL |
| Auth | Session-based (Argon2 + oslo) |
| i18n | next-intl |
| Testing | Vitest + Playwright + Testing Library |

## Getting Started

### Prerequisites

- Node.js >= 22
- pnpm 10.x (`corepack enable && corepack prepare pnpm@10.32.1 --activate`)
- Docker (for Postgres + Redis)

### Setup

```bash
# Clone and install
git clone https://github.com/vichitra-paheli/Lightboard.git
cd Lightboard
pnpm install

# Start Postgres and Redis
docker compose up -d

# Copy environment variables
cp .env.example apps/web/.env.local

# Apply database migrations
pnpm --filter @lightboard/db db:migrate

# Seed demo data (optional)
pnpm --filter @lightboard/db db:seed

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Demo Credentials

After running the seed script:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@lightboard.dev | lightboard123 |
| Viewer | viewer@lightboard.dev | lightboard123 |

## Development

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm test         # Unit tests (Vitest)
pnpm test:e2e     # E2E tests (Playwright)
pnpm typecheck    # TypeScript type checking
pnpm lint         # ESLint + Prettier
pnpm format       # Auto-format all files
```

### Per-package commands

```bash
pnpm --filter @lightboard/web dev            # Web app only
pnpm --filter @lightboard/db db:migrate      # Apply pending migrations
pnpm --filter @lightboard/db db:bootstrap    # Backfill tracking for DBs seeded by the old db:push flow
pnpm --filter @lightboard/db db:generate     # Generate migration from schema changes
pnpm --filter @lightboard/db db:seed         # Seed demo data
pnpm --filter @lightboard/db db:studio       # Open Drizzle Studio
```

## Multi-tenancy

Every table has an `org_id` column. PostgreSQL Row Level Security (RLS) policies enforce tenant isolation at the database level. API middleware sets the `app.current_org_id` session variable on every request so route handlers never filter by org manually.

## Deployment Modes

- **Cloud SaaS** — Next.js + managed Postgres + Redis + Claude API
- **On-prem Docker** — Single `docker compose up` with bundled Postgres/Redis
- **Airgapped K8s** — Local LLM (Ollama/vLLM), plugins loaded from `/plugins` as .tar.gz, zero network egress

## Contributing

1. Create a feature branch from `main` (`feat/`, `fix/`, `refactor/`)
2. Follow the code standards in `CLAUDE.md`
3. Ensure CI passes (lint, typecheck, unit tests, E2E tests)
4. Open a PR — squash merge into `main`

## License

Proprietary. All rights reserved.
