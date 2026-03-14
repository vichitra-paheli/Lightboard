import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/**
 * Creates a Drizzle database instance from a connection string.
 * Use `DATABASE_URL` for admin operations (migrations, cross-org queries).
 * Use `DATABASE_APP_URL` for application queries (RLS enforced).
 */
export function createDb(connectionString: string): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/**
 * Sets the Postgres session variable for RLS tenant isolation.
 * Must be called on every request before running org-scoped queries.
 */
export async function setOrgContext(client: pg.PoolClient, orgId: string): Promise<void> {
  await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
}

/**
 * Executes a callback with RLS org context set on a dedicated pool client.
 * The client is automatically released back to the pool after the callback.
 */
export async function withOrgContext<T>(
  pool: pg.Pool,
  orgId: string,
  callback: (db: Database, client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await setOrgContext(client, orgId);
    const db = drizzle(client, { schema });
    return await callback(db, client);
  } finally {
    client.release();
  }
}
