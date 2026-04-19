import { dataSources } from '@lightboard/db/schema';
import { eq, and } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

/** Extract the `[id]` segment from `/api/data-sources/[id]`. */
function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

/** DELETE /api/data-sources/[id] — Delete a data source. */
export const DELETE = withAuth(async (req, { db, orgId }) => {
  const id = extractId(req);
  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const deleted = await db
    .delete(dataSources)
    .where(and(eq(dataSources.id, id), eq(dataSources.orgId, orgId)))
    .returning({ id: dataSources.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
});
