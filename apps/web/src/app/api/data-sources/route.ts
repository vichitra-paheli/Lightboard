import { dataSources } from '@lightboard/db/schema';
import { encryptCredentials } from '@lightboard/db/crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { introspectSchema } from '@/lib/data-source-service';

/** GET /api/data-sources — List all data sources for the current org. */
export const GET = withAuth(async (_req, { db, orgId }) => {
  const results = await db
    .select({
      id: dataSources.id,
      name: dataSources.name,
      type: dataSources.type,
      config: dataSources.config,
      createdAt: dataSources.createdAt,
    })
    .from(dataSources)
    .where(eq(dataSources.orgId, orgId));

  return NextResponse.json({ dataSources: results });
});

/** POST /api/data-sources — Create a new data source. */
export const POST = withAuth(async (req, { db, orgId }) => {
  const body = await req.json();
  const { name, type, connection } = body as {
    name?: string;
    type?: string;
    connection?: Record<string, string>;
  };

  if (!name || !type || !connection) {
    return NextResponse.json({ error: 'Name, type, and connection are required' }, { status: 400 });
  }

  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 });
  }

  const encrypted = encryptCredentials(masterKey, orgId, JSON.stringify(connection));

  // Introspect schema on creation and cache it in config
  let cachedSchema = null;
  try {
    const connConfig = {
      host: connection.host ?? 'localhost',
      port: parseInt(connection.port ?? '5432', 10),
      database: connection.database ?? '',
      user: connection.user ?? '',
      password: connection.password ?? '',
    };
    cachedSchema = await introspectSchema(connConfig);
  } catch {
    // Schema introspection failed — save without cache, can be retried later
  }

  const config = {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    ...(cachedSchema ? { cachedSchema } : {}),
  };

  const [created] = await db
    .insert(dataSources)
    .values({
      orgId,
      name,
      type: type as 'postgres' | 'mysql' | 'clickhouse' | 'rest' | 'csv' | 'prometheus' | 'elasticsearch',
      config,
      credentials: encrypted,
    })
    .returning({
      id: dataSources.id,
      name: dataSources.name,
      type: dataSources.type,
      config: dataSources.config,
      createdAt: dataSources.createdAt,
    });

  return NextResponse.json({ dataSource: created }, { status: 201 });
});
