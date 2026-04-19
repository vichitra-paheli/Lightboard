import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

/**
 * Bootstraps drizzle-orm's migration tracking table for a database that was
 * originally seeded with `drizzle-kit push` (no journal, no tracking rows).
 *
 * Historical context: before this fix, `packages/db/drizzle/` was a folder of
 * hand-written SQL files with no `meta/_journal.json`. The real schema flow
 * was `drizzle-kit push` + manually running RLS SQL via psql, so the live
 * dev databases were never recorded in `drizzle.__drizzle_migrations`. With
 * the journal now in place, running `db:migrate` against one of those
 * databases would try to re-CREATE TABLE organizations and fail.
 *
 * This script introspects the live DB, decides which of the current
 * migrations are logically already applied (based on the presence of the
 * tables + RLS policies each migration introduces), runs small idempotent
 * catch-up SQL to fill any gaps (e.g. a missing telemetry_events table when
 * the rest of 0000 clearly ran), and then inserts matching rows into
 * `drizzle.__drizzle_migrations` so that a subsequent `pnpm db:migrate`
 * skips the ones we marked and only applies what's truly new.
 *
 * Fresh databases (no tables yet) should skip this script entirely and just
 * run `pnpm db:migrate`. Running this against a fresh DB is safe — it just
 * creates the tracking table and inserts no rows.
 *
 * Idempotent: running twice does nothing. Hashes are computed exactly the
 * same way `drizzle-orm/node-postgres/migrator` computes them (sha256 of
 * the raw migration file content), and `created_at` values match the
 * `when` field in `meta/_journal.json` so the migrator's "is this applied"
 * check (`lastDbMigration.created_at < migration.folderMillis`) works.
 */

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

type MigrationFile = {
  entry: JournalEntry;
  hash: string;
};

const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';

const thisFile = fileURLToPath(import.meta.url);
const pkgRoot = path.resolve(path.dirname(thisFile), '..');
const migrationsDir = path.resolve(pkgRoot, 'drizzle');

/** Reads the journal + each migration's file content and returns hashes. */
function loadMigrations(): MigrationFile[] {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Journal not found at ${journalPath}`);
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
  return journal.entries.map((entry) => {
    const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const hash = crypto.createHash('sha256').update(sql).digest('hex');
    return { entry, hash };
  });
}

/**
 * Returns true if a fully-qualified table exists.
 * Used as a proxy for whether migrations have (partially) been applied.
 */
async function tableExists(
  client: pg.PoolClient,
  schema: string,
  name: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT to_regclass($1) AS oid`,
    [`${schema}.${name}`],
  );
  return result.rows[0]?.oid !== null;
}

/**
 * Returns true if the named RLS policy exists on the named table.
 * Used as a proxy for whether migrations 0001 / 0002 have been applied.
 */
async function policyExists(
  client: pg.PoolClient,
  schema: string,
  table: string,
  policy: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
       FROM pg_policies
      WHERE schemaname = $1
        AND tablename = $2
        AND policyname = $3
      LIMIT 1`,
    [schema, table, policy],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Ensures the drizzle tracking schema + table exist. Safe to run repeatedly. */
async function ensureTrackingTable(client: pg.PoolClient): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`,
  );
}

/**
 * Backfills any pieces of 0000 that past `db:push` runs may have skipped.
 *
 * Three known gaps:
 * 1. The `telemetry` schema is never created by `drizzle-kit push`, so on
 *    dev DBs bootstrapped without the docker-compose init.sql,
 *    `telemetry.telemetry_events` is missing. 0001 would then fail at
 *    `ALTER TABLE telemetry.telemetry_events ENABLE ROW LEVEL SECURITY`.
 * 2. `model_configs` and `agent_role_assignments` are missing on any DB
 *    that was last pushed before PR #96. 0002's RLS + backfill assumes
 *    they exist, so we must create them before marking 0000 applied.
 *
 * Everything here uses IF NOT EXISTS and matches the generated 0000 SQL
 * exactly so it's safe to re-run on a DB that already has all tables.
 *
 * Only runs when 0000 is considered applied (organizations exists).
 * Idempotent.
 */
async function reconcile0000Gaps(client: pg.PoolClient): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "telemetry"`);
  if (!(await tableExists(client, 'telemetry', 'telemetry_events'))) {
    console.log('    reconciling: creating missing telemetry.telemetry_events');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "telemetry"."telemetry_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid,
        "event_type" text NOT NULL,
        "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "telemetry_events_org_type_time_idx"
        ON "telemetry"."telemetry_events" USING btree ("org_id","event_type","created_at")
    `);
  }
  if (!(await tableExists(client, 'public', 'model_configs'))) {
    console.log('    reconciling: creating missing public.model_configs');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "model_configs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "name" text NOT NULL,
        "provider" text NOT NULL,
        "model" text NOT NULL,
        "base_url" text,
        "encrypted_api_key" text NOT NULL,
        "temperature" numeric(3, 2),
        "max_tokens" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query(`
      ALTER TABLE "model_configs"
        DROP CONSTRAINT IF EXISTS "model_configs_org_id_organizations_id_fk"
    `);
    await client.query(`
      ALTER TABLE "model_configs"
        ADD CONSTRAINT "model_configs_org_id_organizations_id_fk"
        FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
        ON DELETE cascade ON UPDATE no action
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "model_configs_org_id_idx"
        ON "model_configs" USING btree ("org_id")
    `);
  }
  if (!(await tableExists(client, 'public', 'agent_role_assignments'))) {
    console.log('    reconciling: creating missing public.agent_role_assignments');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "agent_role_assignments" (
        "org_id" uuid NOT NULL,
        "role" text NOT NULL,
        "model_config_id" uuid NOT NULL,
        CONSTRAINT "agent_role_assignments_org_id_role_pk" PRIMARY KEY("org_id","role")
      )
    `);
    await client.query(`
      ALTER TABLE "agent_role_assignments"
        DROP CONSTRAINT IF EXISTS "agent_role_assignments_org_id_organizations_id_fk"
    `);
    await client.query(`
      ALTER TABLE "agent_role_assignments"
        ADD CONSTRAINT "agent_role_assignments_org_id_organizations_id_fk"
        FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
        ON DELETE cascade ON UPDATE no action
    `);
    await client.query(`
      ALTER TABLE "agent_role_assignments"
        DROP CONSTRAINT IF EXISTS "agent_role_assignments_model_config_id_model_configs_id_fk"
    `);
    await client.query(`
      ALTER TABLE "agent_role_assignments"
        ADD CONSTRAINT "agent_role_assignments_model_config_id_model_configs_id_fk"
        FOREIGN KEY ("model_config_id") REFERENCES "public"."model_configs"("id")
        ON DELETE restrict ON UPDATE no action
    `);
  }
}

/**
 * Inserts a tracking row for a migration if one does not already exist for
 * the given `created_at` timestamp. Idempotent.
 */
async function markApplied(
  client: pg.PoolClient,
  migration: MigrationFile,
): Promise<'inserted' | 'already-present'> {
  const existing = await client.query(
    `SELECT id FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" WHERE created_at = $1 LIMIT 1`,
    [migration.entry.when],
  );
  if ((existing.rowCount ?? 0) > 0) {
    return 'already-present';
  }
  await client.query(
    `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2)`,
    [migration.hash, migration.entry.when],
  );
  return 'inserted';
}

/**
 * Decides whether a migration should be considered already applied on this DB.
 * The check is tag-based rather than positional because the introspection
 * signal is specific to what each migration creates.
 *
 * Note: 0001 (RLS) is only marked applied when a canonical policy exists.
 * Many dev DBs that ran `db:push` never ran the hand-written RLS SQL, so
 * bootstrap correctly lets db:migrate run 0001 for them.
 */
async function shouldMarkApplied(
  client: pg.PoolClient,
  tag: string,
): Promise<boolean> {
  switch (tag) {
    case '0000_initial_schema':
      // The initial schema created organizations among other things;
      // organizations is the cleanest single signal.
      return await tableExists(client, 'public', 'organizations');
    case '0001_enable_rls': {
      // RLS migration's signature is the organizations_tenant_isolation
      // policy. If absent, let db:migrate apply the migration itself.
      return await policyExists(
        client,
        'public',
        'organizations',
        'organizations_tenant_isolation',
      );
    }
    case '0002_model_configs_rls_and_backfill':
      // Mark applied only if BOTH the table exists AND its RLS policy is
      // in place. Otherwise let db:migrate run it — its RLS + backfill
      // block are safe on an empty table.
      if (!(await tableExists(client, 'public', 'model_configs'))) return false;
      return await policyExists(
        client,
        'public',
        'model_configs',
        'model_configs_tenant_isolation',
      );
    default:
      return false;
  }
}

/** Runs bootstrap end-to-end. */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const migrations = loadMigrations();
  console.log(`Loaded ${migrations.length} migrations from ${migrationsDir}`);

  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    await ensureTrackingTable(client);

    let insertedCount = 0;
    let skippedCount = 0;
    let notApplicableCount = 0;

    for (const migration of migrations) {
      const { tag } = migration.entry;
      const applied = await shouldMarkApplied(client, tag);
      if (!applied) {
        console.log(`  [ ] ${tag} — not applied to this DB; db:migrate will run it`);
        notApplicableCount++;
        continue;
      }
      // When marking 0000 as applied, first close any gaps that `db:push`
      // leaves behind so subsequent migrations don't trip over a missing
      // telemetry.telemetry_events.
      if (tag === '0000_initial_schema') {
        await reconcile0000Gaps(client);
      }
      const result = await markApplied(client, migration);
      if (result === 'inserted') {
        console.log(`  [✓] ${tag} — marked as applied (hash ${migration.hash.slice(0, 12)}…)`);
        insertedCount++;
      } else {
        console.log(`  [·] ${tag} — already tracked, leaving as-is`);
        skippedCount++;
      }
    }

    console.log(
      `\nBootstrap complete: ${insertedCount} inserted, ${skippedCount} already tracked, ${notApplicableCount} to apply.`,
    );
    console.log('Next step: pnpm --filter @lightboard/db db:migrate');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
