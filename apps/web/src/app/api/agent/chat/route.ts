import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import {
  getDataSourceConnection,
  introspectSchema,
  executeQueryIR,
  DataSourceError,
} from '@/lib/data-source-service';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { redis } from '@/lib/redis';
import { dataSources } from '@lightboard/db/schema';
import { eq } from 'drizzle-orm';
import {
  Agent,
  LLMError,
  type AgentDataSource,
  type AgentEvent,
  type Message,
  type ToolContext,
} from '@lightboard/agent';
import { resolveAIProvider } from '@/lib/ai-provider';

/** Maximum duration for agent processing in milliseconds. */
const AGENT_TIMEOUT_MS = 180_000;

/** Redis TTL for conversation sessions in seconds. */
const CONVERSATION_TTL_SEC = 3600;

/** Rate limit bucket configuration key for agent chat. */
const AGENT_RATE_LIMIT_BUCKET = 'query' as const;

/**
 * POST /api/agent/chat — Send a message to the AI agent.
 * Returns the agent's response, tool calls, and any generated ViewSpec.
 *
 * Supports conversation persistence via Redis-backed sessions.
 * When Accept: text/event-stream is set, streams SSE events.
 */
export const POST = withAuth(async (req, { db, orgId }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message, sourceId, conversationId } = body as {
    message?: string;
    sourceId?: string;
    conversationId?: string;
  };

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Rate limiting
  const rateResult = await checkRateLimit(orgId, AGENT_RATE_LIMIT_BUCKET);
  if (!rateResult.allowed) {
    const response = NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before sending more messages.' },
      { status: 429 },
    );
    addRateLimitHeaders(response.headers, rateResult);
    response.headers.set('Retry-After', String(Math.ceil(rateResult.resetAt - Date.now() / 1000)));
    return response;
  }

  // Resolve AI provider from org settings or env var fallback
  const provider = await resolveAIProvider(db, orgId);
  if (!provider) {
    return NextResponse.json(
      {
        error: 'AI agent is not configured. Set up a model in Settings or set the ANTHROPIC_API_KEY environment variable.',
      },
      { status: 503 },
    );
  }

  // Load org's data sources
  const orgSources = await db
    .select({ id: dataSources.id, name: dataSources.name, type: dataSources.type })
    .from(dataSources)
    .where(eq(dataSources.orgId, orgId));

  const agentDataSources: AgentDataSource[] = orgSources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
  }));

  // Build ToolContext with real data source operations
  const toolContext: ToolContext = {
    getSchema: async (srcId: string) => {
      const connection = await getDataSourceConnection(db, orgId, srcId);
      const schema = await introspectSchema(connection);
      return schema as unknown as Record<string, unknown>;
    },
    executeQuery: async (srcId: string, queryIR: Record<string, unknown>) => {
      const connection = await getDataSourceConnection(db, orgId, srcId);
      const result = await executeQueryIR(connection, queryIR);
      return result as unknown as Record<string, unknown>;
    },
  };

  // Instantiate agent with resolved provider
  const agent = new Agent({
    provider,
    toolContext,
    dataSources: agentDataSources,
  });

  // Load conversation history from Redis if conversationId provided
  if (conversationId) {
    const stored = await loadConversation(orgId, conversationId);
    if (stored) {
      agent.loadHistory(stored);
    }
  }

  // Check if client wants SSE streaming
  const acceptHeader = req.headers.get('Accept') ?? '';
  const wantsStream = acceptHeader.includes('text/event-stream');

  if (wantsStream) {
    return handleStreaming(agent, message, orgId, conversationId, sourceId);
  }

  return handleNonStreaming(agent, message, orgId, conversationId, sourceId);
});

/**
 * Handles non-streaming agent chat — collects all events and returns a single JSON response.
 */
async function handleNonStreaming(
  agent: Agent,
  message: string,
  orgId: string,
  conversationId: string | undefined,
  _sourceId: string | undefined,
): Promise<NextResponse> {
  // Generate or reuse conversation ID
  const sessionId = conversationId ?? `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Process with timeout
    const events = await collectWithTimeout(agent.chat(message), AGENT_TIMEOUT_MS);

    // Extract results
    let text = '';
    const toolCalls: { name: string; status: string }[] = [];
    let viewSpec: Record<string, unknown> | null = null;
    let queryResult: Record<string, unknown> | null = null;

    for (const event of events) {
      switch (event.type) {
        case 'text':
          text += event.text;
          break;
        case 'tool_start':
          toolCalls.push({ name: event.name, status: 'running' });
          break;
        case 'tool_end': {
          const tc = toolCalls.find((t) => t.name === event.name && t.status === 'running');
          if (tc) tc.status = event.isError ? 'error' : 'done';

          // Extract ViewSpec from create_view or modify_view results
          if ((event.name === 'create_view' || event.name === 'modify_view') && !event.isError) {
            try {
              const parsed = JSON.parse(event.result);
              if (parsed.viewSpec) viewSpec = parsed.viewSpec;
            } catch { /* ignore parse errors */ }
          }

          // Extract query results from execute_query
          if (event.name === 'execute_query' && !event.isError) {
            try {
              queryResult = JSON.parse(event.result);
            } catch { /* ignore parse errors */ }
          }
          break;
        }
      }
    }

    // Save conversation to Redis
    const updatedHistory = agent.getHistory();
    await saveConversation(orgId, sessionId, updatedHistory);

    return NextResponse.json({
      conversationId: sessionId,
      text,
      toolCalls,
      viewSpec,
      queryResult,
    });
  } catch (err) {
    if (err instanceof LLMError) {
      if (err.statusCode === 401) {
        return NextResponse.json(
          { error: 'Invalid API key. Check your AI model configuration in Settings.' },
          { status: 401 },
        );
      }
      if (err.statusCode === 429) {
        return NextResponse.json(
          { error: 'AI service is busy, please retry in a moment.' },
          { status: 429 },
        );
      }
      if (err.statusCode && err.statusCode >= 500) {
        return NextResponse.json(
          { error: 'AI service is temporarily unavailable.' },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: `AI provider error: ${err.message}` },
        { status: err.statusCode ?? 500 },
      );
    }

    if (err instanceof DataSourceError) {
      return NextResponse.json(
        { error: err.message, type: err.type },
        { status: 400 },
      );
    }

    if (err instanceof Error && err.message === 'Agent processing timed out') {
      return NextResponse.json(
        { error: 'Agent processing timed out. Try a simpler question.' },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { error: `Agent error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}

/**
 * Handles SSE streaming — emits events as they arrive from the agent.
 */
function handleStreaming(
  agent: Agent,
  message: string,
  orgId: string,
  conversationId: string | undefined,
  _sourceId: string | undefined,
): Response {
  const sessionId = conversationId ?? `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Heartbeat interval
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Agent processing timed out')), AGENT_TIMEOUT_MS);
        });

        const processStream = async () => {
          for await (const event of agent.chat(message)) {
            switch (event.type) {
              case 'text':
                enqueue('text', { text: event.text });
                break;
              case 'tool_start':
                enqueue('tool_start', { name: event.name, id: event.id });
                break;
              case 'tool_end': {
                enqueue('tool_end', {
                  name: event.name,
                  result: event.result,
                  isError: event.isError,
                });

                // Emit view_created for create_view / modify_view tool results
                if ((event.name === 'create_view' || event.name === 'modify_view') && !event.isError) {
                  try {
                    const parsed = JSON.parse(event.result);
                    if (parsed.viewSpec) {
                      enqueue('view_created', { viewSpec: parsed.viewSpec });
                    }
                  } catch { /* ignore */ }
                }
                break;
              }
              case 'done':
                // Save conversation before closing
                const history = agent.getHistory();
                await saveConversation(orgId, sessionId, history);

                enqueue('done', { stopReason: event.stopReason, conversationId: sessionId });
                break;
            }
          }
        };

        await Promise.race([processStream(), timeoutPromise]);
      } catch (err) {
        const errorMessage = err instanceof LLMError
          ? (err.statusCode === 429 ? 'AI service is busy, please retry.' : 'AI service error.')
          : (err instanceof Error ? err.message : String(err));

        enqueue('error', { error: errorMessage });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Collects all events from an async iterable with a timeout.
 * Throws if the timeout is exceeded.
 */
async function collectWithTimeout(
  iterable: AsyncIterable<AgentEvent>,
  timeoutMs: number,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Agent processing timed out')), timeoutMs);
  });

  const collectPromise = async () => {
    for await (const event of iterable) {
      events.push(event);
    }
    return events;
  };

  await Promise.race([collectPromise(), timeoutPromise]);
  return events;
}

/** Redis key for a conversation session. */
function conversationKey(orgId: string, conversationId: string): string {
  return `agent:conv:${orgId}:${conversationId}`;
}

/** Loads conversation history from Redis. */
async function loadConversation(orgId: string, conversationId: string): Promise<Message[] | null> {
  try {
    const raw = await redis.get(conversationKey(orgId, conversationId));
    if (!raw) return null;
    return JSON.parse(raw) as Message[];
  } catch {
    return null;
  }
}

/** Saves conversation history to Redis with TTL. */
async function saveConversation(orgId: string, conversationId: string, messages: Message[]): Promise<void> {
  try {
    await redis.setex(
      conversationKey(orgId, conversationId),
      CONVERSATION_TTL_SEC,
      JSON.stringify(messages),
    );
  } catch {
    // Log at debug level only — don't fail the request
  }
}
