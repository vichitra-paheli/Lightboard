import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import {
  getDataSourceConnection,
  executeQueryIR,
  DataSourceError,
} from '@/lib/data-source-service';

/**
 * POST /api/data-sources/[id]/query — Execute a QueryIR against a data source.
 * Returns JSON results with columns, rows, row count, and execution time.
 *
 * Enforces read-only transactions, statement timeouts, and default row limits.
 */
export const POST = withAuth(async (req, { db, orgId }) => {
  const segments = req.nextUrl.pathname.split('/');
  const queryIdx = segments.indexOf('query');
  const id = segments[queryIdx - 1];
  if (!id) {
    return NextResponse.json({ error: 'Data source ID is required' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const queryIR = body.queryIR;
  if (!queryIR || typeof queryIR !== 'object') {
    return NextResponse.json({ error: 'queryIR is required' }, { status: 400 });
  }

  try {
    const connection = await getDataSourceConnection(db, orgId, id);
    const result = await executeQueryIR(connection, queryIR as Record<string, unknown>);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DataSourceError) {
      const statusMap: Record<string, number> = {
        not_found: 404,
        config: 500,
        validation: 400,
        connection: 502,
        auth: 401,
        timeout: 504,
        query: 400,
      };
      return NextResponse.json(
        { error: err.message, type: err.type },
        { status: statusMap[err.type] ?? 500 },
      );
    }

    return NextResponse.json(
      { error: `Query execution failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
});
