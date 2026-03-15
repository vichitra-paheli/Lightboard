import { dataSources } from '@lightboard/db/schema';
import { decryptCredentials } from '@lightboard/db/crypto';
import { eq, and } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import pg from 'pg';

const INTROSPECT_COLUMNS = `
  SELECT
    c.table_schema,
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
  FROM information_schema.columns c
  LEFT JOIN (
    SELECT kcu.table_schema, kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
  ) pk ON c.table_schema = pk.table_schema
    AND c.table_name = pk.table_name
    AND c.column_name = pk.column_name
  WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY c.table_schema, c.table_name, c.ordinal_position
`;

/** GET /api/data-sources/[id]/schema — Introspect the data source schema. */
export const GET = withAuth(async (req, { db, orgId }) => {
  const segments = req.nextUrl.pathname.split('/');
  const schemaIdx = segments.indexOf('schema');
  const id = segments[schemaIdx - 1];
  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  // Get the data source
  const results = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.id, id), eq(dataSources.orgId, orgId)));

  const source = results[0];
  if (!source) {
    return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
  }

  // Decrypt credentials
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 });
  }

  let connection: Record<string, string>;
  try {
    connection = JSON.parse(decryptCredentials(masterKey, orgId, source.credentials));
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt credentials' }, { status: 500 });
  }

  // Connect and introspect
  const pool = new pg.Pool({
    host: connection.host,
    port: parseInt(connection.port ?? '5432', 10),
    database: connection.database,
    user: connection.user,
    password: connection.password,
    connectionTimeoutMillis: 5000,
    max: 1,
  });

  try {
    const columnsResult = await pool.query(INTROSPECT_COLUMNS);

    // Group columns by table
    const tableMap = new Map<string, {
      name: string;
      schema: string;
      columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[];
    }>();

    for (const row of columnsResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, {
          name: row.table_name,
          schema: row.table_schema,
          columns: [],
        });
      }
      tableMap.get(key)!.columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        primaryKey: row.is_primary_key === true || row.is_primary_key === 't',
      });
    }

    return NextResponse.json({ tables: [...tableMap.values()] });
  } catch (err) {
    return NextResponse.json(
      { error: `Introspection failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  } finally {
    await pool.end();
  }
});
