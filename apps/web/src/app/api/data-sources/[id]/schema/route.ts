import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import {
  getDataSourceConnection,
  introspectSchema,
  DataSourceError,
} from '@/lib/data-source-service';
import { dataSources } from '@lightboard/db/schema';
import { eq, and } from 'drizzle-orm';

/** Extracts the data source ID from the URL path. */
function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/');
  const schemaIdx = segments.indexOf('schema');
  return segments[schemaIdx - 1] ?? null;
}

/** GET /api/data-sources/[id]/schema — Introspect the data source schema. */
export const GET = withAuth(async (req, { db, orgId }) => {
  const id = extractId(req);
  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  try {
    const connection = await getDataSourceConnection(db, orgId, id);
    const schema = await introspectSchema(connection);
    return NextResponse.json(schema);
  } catch (err) {
    if (err instanceof DataSourceError) {
      const statusMap: Record<string, number> = {
        not_found: 404,
        config: 500,
        connection: 502,
        auth: 401,
      };
      return NextResponse.json(
        { error: err.message },
        { status: statusMap[err.type] ?? 500 },
      );
    }

    return NextResponse.json(
      { error: `Introspection failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/data-sources/[id]/schema — Set the curated schema document.
 * Body: { schemaDoc: string } — a markdown document describing the schema.
 * This takes priority over auto-generated schema context in agent prompts.
 */
export const PUT = withAuth(async (req, { db, orgId }) => {
  const id = extractId(req);
  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const schemaDoc = body.schemaDoc;
  if (typeof schemaDoc !== 'string') {
    return NextResponse.json({ error: 'schemaDoc (string) is required' }, { status: 400 });
  }

  // Load existing config and merge
  const [source] = await db
    .select({ config: dataSources.config })
    .from(dataSources)
    .where(and(eq(dataSources.id, id), eq(dataSources.orgId, orgId)));

  if (!source) {
    return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
  }

  const existingConfig = (source.config as Record<string, unknown>) ?? {};
  const updatedConfig = { ...existingConfig, schemaDoc };

  await db
    .update(dataSources)
    .set({ config: updatedConfig, updatedAt: new Date() })
    .where(eq(dataSources.id, id));

  return NextResponse.json({ ok: true, schemaDocLength: schemaDoc.length });
});
