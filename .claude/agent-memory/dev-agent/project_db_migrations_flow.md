---
name: db_migrations_flow
description: Lightboard's DB schema flow is db:migrate (drizzle-kit migrate) + one-time db:bootstrap for legacy db:push-seeded DBs. db:push is deprecated for real schema changes.
type: project
---

As of PR #98 (fix/db-migrations-drizzle-generate), `pnpm --filter @lightboard/db db:migrate` is the one true way to evolve the schema. `drizzle-kit push` is only for ad-hoc local experimentation.

**Why:** Before PR #98, `packages/db/drizzle/` was hand-written SQL with no `meta/_journal.json`, so `drizzle-kit migrate` never actually worked — the real flow was `db:push` + `psql` RLS by hand. PR #96 (settings v2) then shipped a hand-written `0002_model_configs.sql` that required push to create `model_configs` / `agent_role_assignments` first. Devs who merged PR #96 without running `db:push` hit `relation "model_configs" does not exist`. PR #98 fixes the footing by regenerating migrations via `drizzle-kit generate` so 0000 carries a journal + snapshot.

**How to apply:**
- Schema changes: edit `packages/db/src/schema/*.ts`, then `pnpm --filter @lightboard/db db:generate` to produce the next `NNNN_*.sql` + journal entry, then `pnpm --filter @lightboard/db db:migrate`.
- Existing dev DBs (seeded by the legacy `db:push` flow): run `pnpm --filter @lightboard/db db:bootstrap` once — it introspects the live DB, backfills `drizzle.__drizzle_migrations`, and reconciles push-leaves-behind gaps (missing `telemetry.telemetry_events`, `model_configs`, `agent_role_assignments`) before marking migrations applied. Then `db:migrate`.
- Fresh DBs: just `db:migrate`. Bootstrap is a no-op but safe.
- RLS + backfill migrations stay hand-written as follow-on NNNN files with matching journal + snapshot entries (snapshots can be copies of the previous one with new `id`/`prevId` since RLS doesn't change drizzle's type view).
- The drizzle migrator's "is this applied" check is `lastDbMigration.created_at < migration.folderMillis`. The `when` field in journal entries must be strictly increasing and stable across reruns so bootstrap's inserted tracking rows match.
