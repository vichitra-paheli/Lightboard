import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { resolveAIProvider } from '@/lib/ai-provider';

/**
 * POST /api/agent/chat — Send a message to the AI agent.
 * Uses the org's configured AI provider, falling back to ANTHROPIC_API_KEY env var.
 */
export const POST = withAuth(async (req, { db, orgId }) => {
  const body = await req.json();
  const { message, sourceId } = body as { message?: string; sourceId?: string };

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Resolve AI provider from org settings or env var fallback
  const provider = await resolveAIProvider(db, orgId);
  if (!provider) {
    return NextResponse.json({
      text: 'No AI model configured. Go to Settings to set up your AI provider, ' +
        'or set the ANTHROPIC_API_KEY environment variable.' +
        `\n\nYour message was: "${message}"` +
        (sourceId ? `\nSelected data source: ${sourceId}` : ''),
      toolCalls: [],
      viewSpec: null,
    });
  }

  // TODO: Wire up the real Agent class with the resolved provider
  // For now, acknowledge that a provider is configured
  return NextResponse.json({
    text: `AI provider "${provider.name}" is configured. Full agent wiring coming soon.` +
      `\n\nYour question: "${message}"`,
    toolCalls: [],
    viewSpec: null,
  });
});
