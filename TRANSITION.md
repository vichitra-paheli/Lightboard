# Transition Doc: D1 Repository Setup — Continue on Windows

## Current State

**Branch**: `feat/d1-repo-setup-app-shell`
**Status**: D1 implementation is ~90% complete. Code is written, builds pass, but not yet committed or pushed.

### What's Done

1. **Monorepo scaffolding** — Turborepo + pnpm workspaces
2. **Next.js 15 app** (`apps/web/`) with app router, Turbopack dev server
3. **Tailwind CSS v4** with full theme tokens (light + dark, chart series colors)
4. **next-intl** configured with English locale (`messages/en.json`)
5. **App shell** — Sidebar (5 nav items with lucide icons), TopBar, content area
6. **5 page shells** inside `(dashboard)` route group: Home, Explore, Data Sources, Views, Settings
7. **`@lightboard/ui` package** (`packages/ui/`) with `cn()` utility, ready for shadcn components
8. **ESLint** (flat config with next/core-web-vitals + next/typescript)
9. **Prettier** with tailwindcss plugin
10. **GitHub Actions CI** (`.github/workflows/ci.yml`) — lint, typecheck, test, build
11. **PR template** (`.github/pull_request_template.md`)

### Verified

- `pnpm install` — works
- `pnpm --filter @lightboard/web build` — all 5 pages compile as static
- `pnpm --filter @lightboard/web typecheck` — clean, zero errors
- `pnpm dev` — dev server starts on localhost:3000

### NOT Done Yet

- [ ] **Git commit** — all changes are unstaged/untracked
- [ ] **Visual verification** — needs someone to open localhost:3000 and confirm sidebar, nav, pages render
- [ ] **Branch protection rules** on GitHub `main` branch (requires repo admin)
- [ ] **PR creation** to merge `feat/d1-repo-setup-app-shell` → `main`

## Environment Setup on Windows

### Prerequisites

1. **Node.js** ≥ 22 (LTS recommended)
2. **pnpm** 10.x — `corepack enable && corepack prepare pnpm@10.32.1 --activate`
3. **Git** with the repo cloned
4. **GitHub CLI** (`gh`) — authenticated with `gh auth login`

### First Steps

```bash
# Clone and checkout the branch
git clone https://github.com/vichitra-paheli/Lightboard.git
cd Lightboard
git checkout feat/d1-repo-setup-app-shell

# Install dependencies
pnpm install

# Verify build
pnpm --filter @lightboard/web build
pnpm --filter @lightboard/web typecheck

# Start dev server and visually verify
pnpm dev
# Open http://localhost:3000
```

### What to Verify in Browser

1. Sidebar renders on the left with 5 nav links (Home, Explore, Data Sources, Views, Settings)
2. Clicking each link navigates to the correct page with translated text
3. Active nav item is highlighted
4. Top bar shows "Lightboard"
5. Content area shows page-specific placeholder text

### After Verification — Remaining Tasks

1. **Commit all changes** on `feat/d1-repo-setup-app-shell`
2. **Push branch** to origin
3. **Create PR** → `main` with D1 acceptance criteria as checklist
4. **Set branch protection** on `main` via GitHub settings or `gh api`:
   - Require PR reviews (1 approval)
   - Require status checks (CI must pass)
   - No direct pushes

## File Map

```
Root configs:
  package.json              — workspace root, turbo scripts, pnpm build approvals
  pnpm-workspace.yaml       — apps/* + packages/*
  turbo.json                — task pipeline (build, dev, lint, test, typecheck)
  tsconfig.base.json        — shared strict TS config
  .prettierrc               — prettier + tailwind plugin

App:
  apps/web/package.json     — Next.js 15 + deps
  apps/web/next.config.ts   — next-intl plugin, transpilePackages
  apps/web/tsconfig.json    — extends base, JSX, path aliases
  apps/web/postcss.config.mjs
  apps/web/eslint.config.mjs
  apps/web/messages/en.json — all i18n strings
  apps/web/src/
    app/layout.tsx           — root layout with NextIntlClientProvider
    app/(dashboard)/layout.tsx — dashboard layout with AppShell
    app/(dashboard)/page.tsx   — Home
    app/(dashboard)/explore/page.tsx
    app/(dashboard)/data-sources/page.tsx
    app/(dashboard)/views/page.tsx
    app/(dashboard)/settings/page.tsx
    components/layout/app-shell.tsx — Sidebar + TopBar + content
    components/layout/sidebar.tsx  — nav items, active state
    components/layout/top-bar.tsx
    i18n/request.ts          — next-intl server config
    lib/utils.ts             — cn() utility
    styles/globals.css       — Tailwind v4 @theme tokens

UI package:
  packages/ui/package.json
  packages/ui/tsconfig.json
  packages/ui/src/index.ts
  packages/ui/src/utils.ts

CI/CD:
  .github/workflows/ci.yml
  .github/pull_request_template.md
```

## GitHub Project State

All Phase 1 GitHub artifacts are already created on the remote:
- **12 labels** (type, priority, size, phase)
- **2 milestones** (Sprint 1-2, Sprint 3)
- **27 issues** (12 parent + 13 sub-issues, numbered #1–#27)
- D1 is issue #1
