import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import {
  getDataSourceConnection,
  introspectSchema,
  DataSourceError,
} from '@/lib/data-source-service';

/** GET /api/data-sources/[id]/schema — Introspect the data source schema. */
export const GET = withAuth(async (req, { db, orgId }) => {
  const segments = req.nextUrl.pathname.split('/');
  const schemaIdx = segments.indexOf('schema');
  const id = segments[schemaIdx - 1];
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
