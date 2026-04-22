import { conversationMessages, conversations } from '@lightboard/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

/** Cap on messages returned in the initial payload. */
const MAX_INITIAL_MESSAGES = 100;

/** Extract the `[id]` segment from `/api/conversations/[id]`. */
function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

/**
 * GET /api/conversations/:id
 *
 * Returns the conversation header plus the most recent
 * {@link MAX_INITIAL_MESSAGES} messages ordered by `sequence`. RLS gates
 * access to the conversation row itself; messages inherit the same gate
 * via their own `org_id` column.
 *
 * The leader's `ConversationManager` further trims to its own
 * `DEFAULT_MAX_MESSAGES = 50` window once the history is loaded — this
 * route's cap exists primarily to keep the initial payload small for the
 * UI thread render.
 */
export const GET = withAuth(async (req, { db, orgId }) => {
  const id = extractId(req);
  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const [conversation] = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      dataSourceId: conversations.dataSourceId,
      createdAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)))
    .limit(1);

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const messages = await db
    .select({
      id: conversationMessages.id,
      sequence: conversationMessages.sequence,
      role: conversationMessages.role,
      content: conversationMessages.content,
      toolCalls: conversationMessages.toolCalls,
      toolResults: conversationMessages.toolResults,
      viewSpec: conversationMessages.viewSpec,
      createdAt: conversationMessages.createdAt,
    })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, id),
        eq(conversationMessages.orgId, orgId),
      ),
    )
    .orderBy(asc(conversationMessages.sequence))
    .limit(MAX_INITIAL_MESSAGES + 1);

  const hasMore = messages.length > MAX_INITIAL_MESSAGES;
  const trimmed = hasMore ? messages.slice(0, MAX_INITIAL_MESSAGES) : messages;

  return NextResponse.json({
    conversation,
    messages: trimmed,
    hasMore,
  });
});
