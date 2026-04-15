import { NextResponse } from 'next/server';
import { getAdminDb, withAuth } from '@/lib/auth';
import {
  getDataSourceConnection,
  introspectSchema,
  executeRawSQL,
  DataSourceError,
} from '@/lib/data-source-service';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { redis } from '@/lib/redis';
import { dataSources } from '@lightboard/db/schema';
import { eq } from 'drizzle-orm';
import {
  LeaderAgent,
  ScratchpadManager,
  LLMError,
  type AgentDataSource,
  type AgentEvent,
  type Message,
  type ToolContext,
} from '@lightboard/agent';
import { resolveAIProvider } from '@/lib/ai-provider';

/**
 * Singleton ScratchpadManager for session scratchpad lifecycle.
 * Shared across all requests — each conversation gets its own scratchpad.
 */
const scratchpadManager = new ScratchpadManager({
  cleanupIntervalMs: 5 * 60 * 1000,
  maxSessionAgeMs: 60 * 60 * 1000,
});

/**
 * Cache of LeaderAgent instances by session ID.
 * Leaders persist across turns to maintain conversation state in-memory,
 * avoiding Redis round-trips and keeping the ConversationManager warm.
 * Entries expire after 1 hour of inactivity.
 */
const leaderCache = new Map<string, { leader: LeaderAgent; lastAccess: number }>();

/** Max age for cached leaders before eviction (1 hour). */
const LEADER_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

/** Periodically evict stale leaders. */
const leaderCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of leaderCache) {
    if (now - entry.lastAccess > LEADER_CACHE_MAX_AGE_MS) {
      leaderCache.delete(id);
    }
  }
}, 5 * 60 * 1000);
if (typeof leaderCleanupInterval === 'object' && 'unref' in leaderCleanupInterval) {
  (leaderCleanupInterval as NodeJS.Timeout).unref();
}

/** Maximum duration for agent processing in milliseconds. */
const AGENT_TIMEOUT_MS = 300_000;

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

  const { message, conversationId } = body as {
    message?: string;
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

  // Load org's data sources with cached schemas
  const orgSources = await db
    .select({ id: dataSources.id, name: dataSources.name, type: dataSources.type, config: dataSources.config })
    .from(dataSources)
    .where(eq(dataSources.orgId, orgId));

  const agentDataSources: AgentDataSource[] = orgSources.map((s) => {
    const config = s.config as Record<string, unknown> | null;
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      cachedSchema: (config?.cachedSchema as Record<string, unknown>) ?? null,
    };
  });

  // Build ToolContext with real data source operations
  // Use adminDb instead of the RLS-scoped pool client because the SSE streaming
  // path runs asynchronously after withAuth releases the pool client.
  // getDataSourceConnection already filters by orgId explicitly.
  const adminDb = getAdminDb();
  const toolContext: ToolContext = {
    getSchema: async (srcId: string) => {
      const connection = await getDataSourceConnection(adminDb, orgId, srcId);
      const schema = await introspectSchema(connection);
      return schema as unknown as Record<string, unknown>;
    },
    runSQL: async (srcId: string, sql: string) => {
      const connection = await getDataSourceConnection(adminDb, orgId, srcId);
      const result = await executeRawSQL(connection, sql);
      return result as unknown as Record<string, unknown>;
    },
    describeTable: async (srcId: string, tableName: string) => {
      const connection = await getDataSourceConnection(adminDb, orgId, srcId);
      const schema = await introspectSchema(connection);
      const schemaObj = schema as { tables?: Array<{ name: string; columns: unknown[] }> };
      const table = schemaObj.tables?.find((t) => t.name === tableName);
      if (!table) {
        throw new DataSourceError(`Table "${tableName}" not found`, 'not_found');
      }
      // Get sample rows
      const sampleResult = await executeRawSQL(
        connection,
        `SELECT * FROM "${tableName}" LIMIT 5`,
      );
      return {
        table: tableName,
        columns: table.columns,
        sampleRows: (sampleResult as { rows?: unknown[] }).rows ?? [],
      } as unknown as Record<string, unknown>;
    },
  };

  // Generate or reuse conversation/session ID
  const sessionId = conversationId ?? `conv_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  // Reuse existing LeaderAgent for this session, or create a new one.
  // Leaders persist across turns to keep conversation state in-memory.
  let leader: LeaderAgent;
  const cached = leaderCache.get(sessionId);
  if (cached) {
    leader = cached.leader;
    cached.lastAccess = Date.now();
  } else {
    leader = new LeaderAgent({
      provider,
      toolContext,
      dataSources: agentDataSources,
      scratchpadManager,
    });

    // Load conversation history from Redis for cold-start recovery
    if (conversationId) {
      const stored = await loadConversation(orgId, conversationId);
      if (stored) {
        leader.loadHistory(stored);
      }
    }

    leaderCache.set(sessionId, { leader, lastAccess: Date.now() });
  }

  // Check if client wants SSE streaming
  const acceptHeader = req.headers.get('Accept') ?? '';
  const wantsStream = acceptHeader.includes('text/event-stream');

  if (wantsStream) {
    return handleStreaming(leader, message, orgId, sessionId);
  }

  return handleNonStreaming(leader, message, orgId, sessionId);
});

/**
 * Handles non-streaming agent chat — collects all events and returns a single JSON response.
 */
async function handleNonStreaming(
  leader: LeaderAgent,
  message: string,
  orgId: string,
  sessionId: string,
): Promise<NextResponse> {
  try {
    // Process with timeout
    const events = await collectWithTimeout(leader.chat(message, sessionId), AGENT_TIMEOUT_MS);

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

          // Extract query results from run_sql
          if (event.name === 'run_sql' && !event.isError) {
            try {
              queryResult = JSON.parse(event.result);
            } catch { /* ignore parse errors */ }
          }
          break;
        }
      }
    }

    // Save conversation to Redis
    const updatedHistory = leader.getHistory();
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
  leader: LeaderAgent,
  message: string,
  orgId: string,
  sessionId: string,
): Response {
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
          for await (const event of leader.chat(message, sessionId)) {
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

                // Emit view_created for view-related tool results
                if (!event.isError) {
                  try {
                    const parsed = JSON.parse(event.result);
                    // Direct create_view/modify_view (single-agent path)
                    if ((event.name === 'create_view' || event.name === 'modify_view') && parsed.viewSpec) {
                      enqueue('view_created', { viewSpec: parsed.viewSpec });
                    }
                    // delegate_view (multi-agent path) — ViewSpec is in the sub-agent result
                    if (event.name === 'delegate_view' && parsed.viewSpec) {
                      enqueue('view_created', { viewSpec: parsed.viewSpec });
                    } else if (event.name === 'delegate_view' && parsed.viewId) {
                      enqueue('view_created', { viewSpec: parsed });
                    }
                  } catch { /* ignore parse errors */ }
                }
                break;
              }
              case 'agent_start':
                enqueue('agent_start', { agent: event.agent, task: event.task });
                break;
              case 'agent_end':
                enqueue('agent_end', { agent: event.agent, summary: event.summary });
                break;
              case 'thinking':
                enqueue('thinking', { text: event.text });
                break;
              case 'done': {
                // Save conversation before closing
                const history = leader.getHistory();
                await saveConversation(orgId, sessionId, history);

                enqueue('done', { stopReason: event.stopReason, conversationId: sessionId });
                break;
              }
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
