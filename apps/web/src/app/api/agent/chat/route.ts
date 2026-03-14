import { NextResponse, type NextRequest } from 'next/server';

/**
 * POST /api/agent/chat — Send a message to the AI agent.
 * Returns the agent's response, tool calls, and any generated ViewSpec.
 *
 * Phase 1 placeholder: returns a mock response explaining that the agent
 * requires a Claude API key to be configured. The full implementation
 * will be wired when the agent package is integrated with real connectors.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message, sourceId } = body as { message?: string; sourceId?: string };

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Check if Claude API key is configured
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      text: 'The AI agent requires an Anthropic API key to be configured. ' +
        'Set ANTHROPIC_API_KEY in your environment variables to enable the agent. ' +
        `\n\nYour message was: "${message}"` +
        (sourceId ? `\nSelected data source: ${sourceId}` : ''),
      toolCalls: [],
      viewSpec: null,
    });
  }

  // TODO: Wire up the real agent with ClaudeProvider when connectors are integrated
  return NextResponse.json({
    text: `Agent processing is not yet fully wired. Your question: "${message}"`,
    toolCalls: [],
    viewSpec: null,
  });
}
