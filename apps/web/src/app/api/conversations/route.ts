import { conversations } from '@lightboard/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

/** Default cap on conversations returned in one page; sidebar consumes <50 entries. */
const DEFAULT_LIMIT = 50;
/** Hard ceiling so a malformed query can't pull the whole table. */
const MAX_LIMIT = 200;

/**
 * GET /api/conversations?sourceId=<uuid>&limit=50
 *
 * Lists conversations for the current org, optionally filtered to a single
 * data source. RLS handles tenant isolation; the org filter is implicit. The
 * sidebar always passes `sourceId` when one is selected; the no-source path
 * returns every accessible conversation for the eventual "All conversations"
 * navigation surface.
 */
export const GET = withAuth(async (req, { db, orgId }) => {
  const url = new URL(req.url);
  const sourceId = url.searchParams.get('sourceId');
  const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const where = sourceId
    ? and(eq(conversations.orgId, orgId), eq(conversations.dataSourceId, sourceId))
    : eq(conversations.orgId, orgId);

  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      dataSourceId: conversations.dataSourceId,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);

  return NextResponse.json({ conversations: rows });
});
