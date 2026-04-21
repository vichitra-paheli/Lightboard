import type { AgentDataSource, AgentEvent } from '../agent';
import { ConversationManager } from '../conversation/manager';
import { classifyTool, formatEnd, formatStart } from '../events/tool-event-formatter';
import { buildLeaderPrompt } from '../prompt/leader-prompt';
import type { LLMProvider, Message, ToolCallResult } from '../provider/types';
import { ScratchpadManager } from '../scratchpad/manager';
import { leaderTools } from '../tools/leader-tools';
import { queryTools } from '../tools/query-tools';
import { insightsTools } from '../tools/insights-tools';
import { viewTools } from '../tools/view-tools';
import { ToolRouter, type ToolContext } from '../tools/router';

import { InsightsAgent } from './insights-agent';
import { QueryAgent } from './query-agent';
import { TaskPool, type TaskHandle } from './task-pool';
import type { AgentTask, SubAgentResult, SubAgentRole } from './types';
import { ViewAgent } from './view-agent';

/**
 * Per-role provider map — leader + each sub-agent gets its own
 * {@link LLMProvider} instance. This lets an org route cheaper/faster models
 * to bulk work (query introspection, summarization) while keeping a stronger
 * model on the leader.
 */
export type LeaderProviderMap = {
  leader: LLMProvider;
  query: LLMProvider;
  view: LLMProvider;
  insights: LLMProvider;
};

/**
 * Per-role output-token ceiling. Keyed by role name, each value is the
 * `maxTokens` that role's LLM call will pass in `ChatOptions.maxTokens`. When
 * a role is missing from this map, the provider's stored default is used.
 */
export type LeaderMaxTokensMap = Partial<{
  leader: number;
  query: number;
  view: number;
  insights: number;
}>;

/** Configuration for creating a LeaderAgent. */
export interface LeaderAgentConfig {
  /**
   * Single LLM provider used for the leader and every sub-agent.
   * Kept for back-compat with callers that don't yet route per-role;
   * supersede by passing {@link LeaderAgentConfig.providers}.
   */
  provider?: LLMProvider;
  /**
   * Per-role provider map. When set, this wins over {@link LeaderAgentConfig.provider}
   * and each sub-agent is built against the matching instance.
   */
  providers?: LeaderProviderMap;
  /** Tool context for creating sub-agent ToolRouters. */
  toolContext: ToolContext;
  /** Available data sources. */
  dataSources: AgentDataSource[];
  /** Scratchpad manager for intermediate data storage. */
  scratchpadManager?: ScratchpadManager;
  /** Maximum tool call rounds for the leader (default: 10). */
  maxToolRounds?: number;
  /** Maximum tool call rounds for sub-agents (default: 5). */
  subAgentMaxRounds?: number;
  /** Grace timeout (ms) for draining in-flight tasks at turn end. */
  drainTimeoutMs?: number;
  /**
   * Per-role output-token ceilings. Threaded into each agent's LLM call so
   * the user-configured `model_configs.max_tokens` is honored explicitly
   * instead of relying on the provider's stored default.
   */
  maxTokensPerRole?: LeaderMaxTokensMap;
}

/** Maximum number of sample rows to include in summaries sent to the LLM. */
const MAX_SAMPLE_ROWS = 5;
/** Default grace period for draining background tasks before ending a turn. */
const DEFAULT_DRAIN_TIMEOUT_MS = 60_000;

/**
 * Builds a compact data summary from query results.
 * The LLM receives this instead of raw data — keeps context small.
 */
function buildDataSummary(data: Record<string, unknown>): Record<string, unknown> {
  const rows = (data.rows ?? data.result ?? []) as Record<string, unknown>[];
  const rowCount = rows.length;
  const sampleRows = rows.slice(0, MAX_SAMPLE_ROWS);
  const columns = rowCount > 0
    ? Object.entries(sampleRows[0]!).map(([name, value]) => ({
        name,
        type: typeof value,
      }))
    : [];

  return { columns, rowCount, sampleRows };
}

/** Outcome of running a single sub-agent task end-to-end. */
interface SubAgentRunOutcome {
  /** The structured sub-agent result (success/failure, data, explanation). */
  result: SubAgentResult;
  /** Scratchpad table name if the query agent saved rows, else undefined. */
  scratchpadTable?: string;
}

/**
 * Leader Agent — the multi-agent conversation orchestrator.
 *
 * Manages conversation with the user, delegates to specialist sub-agents
 * (query, view, insights) via tool use. Data stays server-side — the LLM
 * only sees compact summaries. Query results are auto-saved to the scratchpad.
 *
 * Sub-agents can be invoked in two modes:
 *   - `dispatch_*` (preferred): non-blocking. Returns a task id; caller awaits
 *     results via `await_tasks`. Multiple tasks run in parallel.
 *   - `delegate_*` (legacy): synchronous. Blocks the leader until the sub-agent
 *     finishes.
 */
export class LeaderAgent {
  /**
   * Per-role provider map. The leader uses `providers.leader`; each sub-agent
   * is constructed against its matching entry. When only the legacy `provider`
   * field is supplied, the map is filled with the same instance for every role.
   */
  private providers: LeaderProviderMap;
  private toolContext: ToolContext;
  private dataSources: AgentDataSource[];
  private scratchpadManager: ScratchpadManager;
  private conversation: ConversationManager;
  private maxToolRounds: number;
  private subAgentMaxRounds: number;
  private drainTimeoutMs: number;
  private maxTokensPerRole: LeaderMaxTokensMap;
  /** Counter for auto-naming scratchpad tables. */
  private queryCounter = 0;
  /** Per-turn task pool for async dispatch. Reset at the start of each chat() call. */
  private taskPool: TaskPool = new TaskPool();
  /** Events emitted by background tasks, flushed at safe yield points. */
  private pendingEvents: AgentEvent[] = [];
  /**
   * Whether `narrate_summary` has already been called successfully this turn.
   * Set by the tool-dispatch branch; consumed by the outer loop to short-
   * circuit the next LLM turn with `stopReason: 'end_turn'` so models that
   * would otherwise keep emitting text / tool-calls after narrating are
   * forced to end cleanly. Reset at the start of every `chat()` call.
   */
  private narrateCalled = false;

  constructor(config: LeaderAgentConfig) {
    if (!config.providers && !config.provider) {
      throw new Error('LeaderAgent requires either `providers` or `provider`');
    }
    this.providers = config.providers ?? {
      leader: config.provider!,
      query: config.provider!,
      view: config.provider!,
      insights: config.provider!,
    };
    this.toolContext = config.toolContext;
    this.dataSources = config.dataSources;
    this.scratchpadManager = config.scratchpadManager ?? new ScratchpadManager();
    this.conversation = new ConversationManager();
    this.maxToolRounds = config.maxToolRounds ?? 10;
    this.subAgentMaxRounds = config.subAgentMaxRounds ?? 5;
    this.drainTimeoutMs = config.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
    this.maxTokensPerRole = config.maxTokensPerRole ?? {};
  }

  /**
   * Provider used by the leader itself (not its sub-agents). Kept as a
   * backwards-compatible accessor for callers that peek at this for tests
   * or observability.
   */
  get provider(): LLMProvider {
    return this.providers.leader;
  }

  /**
   * Swap the tool context for subsequent turns. Used when callers wrap the
   * context per-turn (e.g., with a turn-scoped conversation logger) but keep
   * the LeaderAgent alive across turns via a cache.
   */
  setToolContext(ctx: ToolContext): void {
    this.toolContext = ctx;
  }

  /**
   * Process a user message and stream the leader's response.
   * Delegates to sub-agents as needed, emitting agent_start/agent_end events.
   */
  async *chat(
    userMessage: string,
    conversationId: string,
    currentView?: Record<string, unknown> | null,
  ): AsyncIterable<AgentEvent> {
    this.conversation.addMessage({ role: 'user', content: userMessage });

    // Fresh task pool per user turn — tasks should not survive across turns.
    this.taskPool = new TaskPool();
    this.pendingEvents = [];
    this.narrateCalled = false;

    const scratchpad = this.scratchpadManager.getOrCreate(conversationId);
    const scratchpadTables = scratchpad.listTables().map((t) =>
      `${t.name} (${t.rowCount} rows): ${t.description}`,
    );

    const systemPrompt = buildLeaderPrompt({
      dataSources: this.dataSources,
      scratchpadTables,
    });

    for (let round = 0; round < this.maxToolRounds; round++) {
      const toolCalls: ToolCallResult[] = [];
      const toolInputBuffers = new Map<string, string>();
      let textContent = '';
      let hasToolCalls = false;

      const stream = this.providers.leader.chat(
        this.conversation.getMessages(),
        leaderTools,
        { system: systemPrompt, maxTokens: this.maxTokensPerRole.leader },
      );

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            textContent += event.text;
            yield { type: 'text', text: event.text };
            break;
          case 'tool_call_start':
            hasToolCalls = true;
            toolInputBuffers.set(event.id, '');
            toolCalls.push({ id: event.id, name: event.name, input: {} });
            // Emit start with kind immediately so the UI can color the row
            // while args are still streaming. Label + resultSummary arrive on
            // tool_end once inputs and outputs are final.
            yield {
              type: 'tool_start',
              name: event.name,
              id: event.id,
              kind: classifyTool(event.name),
            };
            break;
          case 'tool_call_delta': {
            const buf = toolInputBuffers.get(event.id) ?? '';
            toolInputBuffers.set(event.id, buf + event.input);
            break;
          }
          case 'tool_call_end': {
            const tc = toolCalls.find((t) => t.id === event.id);
            if (tc) tc.input = event.input;
            break;
          }
          case 'message_end':
            if (hasToolCalls) {
              for (const tc of toolCalls) {
                if (Object.keys(tc.input).length === 0) {
                  const raw = toolInputBuffers.get(tc.id);
                  if (raw) {
                    try { tc.input = JSON.parse(raw); } catch { /* ignore */ }
                  }
                }
              }
            }
            break;
        }
      }

      this.conversation.addMessage({
        role: 'assistant',
        content: textContent,
        toolCalls: hasToolCalls ? toolCalls : undefined,
      });

      // Flush any background-task events that fired during streaming.
      yield* this.flushPending();

      if (!hasToolCalls) {
        // Drain any still-running tasks before ending the turn so nothing
        // leaks past the "done" signal.
        yield* this.drainOutstanding();
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }

      // Execute tool calls (delegation, dispatch, scratchpad)
      const toolResults = [];
      for (const tc of toolCalls) {
        let result: { content: string; isError: boolean };

        const { kind, label } = formatStart(tc.name, tc.input);
        const startMs = performance.now();

        if (tc.name.startsWith('dispatch_')) {
          result = yield* this.handleDispatch(tc, conversationId);
        } else if (tc.name === 'await_tasks') {
          result = yield* this.handleAwaitTasks(tc);
        } else if (tc.name === 'cancel_task') {
          result = yield* this.handleCancelTask(tc);
        } else if (tc.name.startsWith('delegate_')) {
          result = yield* this.handleDelegation(tc, conversationId);
        } else if (tc.name === 'propose_schema_doc') {
          const router = new ToolRouter(this.toolContext);
          result = await router.execute(tc.name, tc.input);
        } else if (tc.name === 'list_scratchpads') {
          const tables = scratchpad.listTables();
          result = { content: JSON.stringify(tables), isError: false };
        } else if (tc.name === 'load_scratchpad') {
          result = await this.handleLoadScratchpad(tc, conversationId);
        } else if (tc.name === 'narrate_summary') {
          result = this.handleNarrateSummary(tc);
          if (!result.isError) {
            this.narrateCalled = true;
          }
        } else {
          result = { content: `Unknown tool: ${tc.name}`, isError: true };
        }

        const durationMs = Math.max(0, Math.round(performance.now() - startMs));
        const { resultSummary } = formatEnd(tc.name, result.content, result.isError, durationMs);

        // Flush any sub-agent tool events queued during this tool's execution
        // BEFORE the parent tool_end lands. That way the trace renders:
        //   delegate_query (running)
        //     → SCHEMA get_schema (done)
        //     → QUERY sql(...) (done)
        //   delegate_query (done)
        // instead of ending the delegate row before its nested children.
        yield* this.flushPending();

        toolResults.push({
          toolCallId: tc.id,
          content: result.content,
          isError: result.isError,
        });
        yield {
          type: 'tool_end',
          name: tc.name,
          result: result.content,
          isError: result.isError,
          kind,
          label,
          durationMs,
          ...(resultSummary !== undefined ? { resultSummary } : {}),
        };

        // Catch anything that landed between the flush above and tool_end
        // (vanishingly rare, but cheap insurance).
        yield* this.flushPending();
      }

      this.conversation.addMessage({
        role: 'user',
        content: '',
        toolResults,
      });

      // narrate_summary is the leader's terminal tool. If it ran successfully
      // this round we short-circuit — no more LLM turns, no trailing
      // chatter. Any model that would have kept calling tools after
      // narrating is forced to end cleanly with `end_turn`.
      if (this.narrateCalled) {
        yield* this.drainOutstanding();
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }
    }

    yield* this.drainOutstanding();
    yield { type: 'done', stopReason: 'max_tool_rounds' };
  }

  /** Drain any outstanding background tasks and emit task_complete for each. */
  private async *drainOutstanding(): AsyncGenerator<AgentEvent> {
    const runningBefore = this.taskPool.running();
    if (runningBefore.length === 0) return;
    const runningIds = runningBefore.map((h) => h.id);
    await this.taskPool.awaitTasks(runningIds, this.drainTimeoutMs);
    for (const id of runningIds) {
      const handle = this.taskPool.getHandle(id);
      if (!handle) continue;
      if (handle.status === 'done' || handle.status === 'error') {
        yield {
          type: 'task_complete',
          taskId: id,
          agent: handle.role,
          summary: `Task ${id} finished after turn drain`,
          isError: handle.status === 'error',
        };
      }
    }
  }

  /** Emit any events queued by background tasks. */
  private *flushPending(): Generator<AgentEvent> {
    if (this.pendingEvents.length === 0) return;
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const ev of events) yield ev;
  }

  /** Handle a dispatch_* tool call — returns a task handle immediately. */
  private async *handleDispatch(
    tc: ToolCallResult,
    conversationId: string,
  ): AsyncGenerator<AgentEvent, { content: string; isError: boolean }> {
    const role = tc.name.replace('dispatch_', '') as SubAgentRole;
    if (role !== 'query' && role !== 'view' && role !== 'insights') {
      return { content: `Unknown dispatch role: ${role}`, isError: true };
    }

    const input = tc.input as Record<string, unknown>;
    const instruction = (input.instruction as string)
      || this.getLastUserMessage()
      || 'Explore the available data';

    const taskId = this.taskPool.nextId(role);

    const handle = this.taskPool.dispatch({
      id: taskId,
      role,
      instruction,
      run: async (signal) => {
        const onStatus = (message: string): void => {
          this.pendingEvents.push({ type: 'task_progress', taskId, message });
        };
        const outcome = await this.runSubAgentTask(role, input, conversationId, signal, onStatus);
        // When the task settles, queue a final task_progress tick so the UI
        // can update even before the model calls await_tasks.
        this.pendingEvents.push({
          type: 'task_progress',
          taskId,
          message: outcome.result.success
            ? `${role} task finished`
            : `${role} task failed: ${outcome.result.error ?? 'error'}`,
        });
        return outcome.result;
      },
    });

    yield { type: 'task_dispatched', taskId, agent: role, instruction };

    const handleSummary = {
      task_id: handle.id,
      role: handle.role,
      status: 'dispatched',
      dispatched_at: handle.dispatchedAt,
    };
    return { content: JSON.stringify(handleSummary), isError: false };
  }

  /** Handle the await_tasks tool — blocks on the specified task ids. */
  private async *handleAwaitTasks(
    tc: ToolCallResult,
  ): AsyncGenerator<AgentEvent, { content: string; isError: boolean }> {
    const input = tc.input as Record<string, unknown>;
    const ids = Array.isArray(input.task_ids) ? (input.task_ids as string[]) : [];
    const timeout = typeof input.timeout_ms === 'number' ? (input.timeout_ms as number) : undefined;

    if (ids.length === 0) {
      return { content: JSON.stringify({ error: 'task_ids is required' }), isError: true };
    }

    const results = await this.taskPool.awaitTasks(ids, timeout);
    const response: Record<string, Record<string, unknown>> = {};

    for (const [id, result] of results) {
      const handle = this.taskPool.getHandle(id);
      const entry: Record<string, unknown> = {
        success: result.success,
        role: result.role,
        explanation: result.explanation,
      };

      if (result.success && result.data) {
        if (result.role === 'query') {
          // Query results: compact summary for the LLM, scratchpad table in side channel.
          entry.data_summary = buildDataSummary(result.data);
        } else {
          // View and insights: return raw data so callers can surface viewSpec / analysis.
          entry.data = result.data;
        }
      }
      if (result.error) entry.error = result.error;
      if (handle) entry.status = handle.status;

      response[id] = entry;

      yield {
        type: 'task_complete',
        taskId: id,
        agent: result.role,
        summary: result.explanation,
        isError: !result.success,
      };
    }

    return { content: JSON.stringify(response), isError: false };
  }

  /** Handle cancel_task — cooperatively aborts a running task. */
  private async *handleCancelTask(
    tc: ToolCallResult,
  ): AsyncGenerator<AgentEvent, { content: string; isError: boolean }> {
    const input = tc.input as Record<string, unknown>;
    const id = input.task_id as string | undefined;
    if (!id) {
      return { content: JSON.stringify({ error: 'task_id is required' }), isError: true };
    }
    const cancelled = this.taskPool.cancel(id);
    if (cancelled) {
      yield { type: 'task_cancelled', taskId: id };
    }
    return { content: JSON.stringify({ cancelled, task_id: id }), isError: false };
  }

  /**
   * Legacy synchronous delegation path. Kept for backward compatibility
   * with prompts that use the delegate_* tools. New prompts should use
   * dispatch_* + await_tasks for parallelism.
   */
  private async *handleDelegation(
    tc: ToolCallResult,
    conversationId: string,
  ): AsyncGenerator<AgentEvent, { content: string; isError: boolean }> {
    const role = tc.name.replace('delegate_', '') as SubAgentRole;
    if (role !== 'query' && role !== 'view' && role !== 'insights') {
      return { content: `Unknown delegation role: ${role}`, isError: true };
    }

    const input = tc.input as Record<string, unknown>;
    const instruction = (input.instruction as string)
      || this.getLastUserMessage()
      || 'Explore the available data';

    try {
      yield { type: 'agent_start', agent: role, task: instruction };
      const onStatus = (message: string): void => {
        this.pendingEvents.push({ type: 'status', scope: role, message });
      };
      const outcome = await this.runSubAgentTask(role, input, conversationId, undefined, onStatus);
      const summary = outcome.result.success
        ? outcome.result.explanation || `${role} task completed`
        : `${role} task failed: ${outcome.result.error ?? 'unknown error'}`;
      yield { type: 'agent_end', agent: role, summary };

      // Build the tool result payload in the same shape the legacy callers expected.
      if (role === 'query') {
        const dataSummary = outcome.result.success
          ? buildDataSummary(outcome.result.data)
          : { error: outcome.result.error };
        return {
          content: JSON.stringify({
            ...dataSummary,
            ...(outcome.scratchpadTable ? { scratchpadTable: outcome.scratchpadTable } : {}),
            explanation: outcome.result.explanation,
          }),
          isError: !outcome.result.success,
        };
      }

      // view + insights: return the agent's data verbatim.
      return {
        content: JSON.stringify(outcome.result.data),
        isError: !outcome.result.success,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      yield { type: 'agent_end', agent: role, summary: `Error: ${errorMsg}` };
      return { content: `Delegation failed: ${errorMsg}`, isError: true };
    }
  }

  /**
   * Execute a single sub-agent task end-to-end.
   * Shared between the dispatch and delegate code paths.
   */
  private async runSubAgentTask(
    role: SubAgentRole,
    input: Record<string, unknown>,
    conversationId: string,
    _signal?: AbortSignal,
    onStatus?: (message: string) => void,
  ): Promise<SubAgentRunOutcome> {
    const instruction = (input.instruction as string)
      || this.getLastUserMessage()
      || 'Explore the available data';

    // Bubble sub-agent tool events up to the outer stream. Stamps `parentAgent`
    // onto the event so the trace UI renders the row as a nested child of the
    // surrounding dispatch_* / delegate_* call.
    const onEvent = (event: Extract<AgentEvent, { type: 'tool_start' } | { type: 'tool_end' }>): void => {
      this.pendingEvents.push({ ...event, parentAgent: role });
    };

    if (role === 'query') {
      const sourceId = (input.source_id as string) ?? this.dataSources[0]?.id ?? '';
      const ds = this.dataSources.find((d) => d.id === sourceId);

      const queryRouter = new ToolRouter(this.toolContext, queryTools);
      const agent = new QueryAgent({
        provider: this.providers.query,
        toolRouter: queryRouter,
        maxToolRounds: this.subAgentMaxRounds,
        maxTokens: this.maxTokensPerRole.query,
        onStatus,
        onEvent,
      });

      const task: AgentTask = {
        id: `task_${Date.now()}`,
        instruction,
        context: { dataSources: ds ? [ds] : this.dataSources },
      };

      const agentResult = await agent.run(task);

      let tableName: string | undefined;
      if (agentResult.success && agentResult.data) {
        const rows = (agentResult.data.rows ?? []) as Record<string, unknown>[];
        if (rows.length > 0) {
          this.queryCounter++;
          tableName = `query_${this.queryCounter}`;
          try {
            const scratchpad = this.scratchpadManager.getOrCreate(conversationId);
            await scratchpad.saveTable(tableName, rows, instruction.slice(0, 100));
          } catch { /* scratchpad save is best-effort */ }
        }
      }

      return { result: agentResult, scratchpadTable: tableName };
    }

    if (role === 'view') {
      const viewRouter = new ToolRouter(this.toolContext, viewTools);
      const agent = new ViewAgent({
        provider: this.providers.view,
        toolRouter: viewRouter,
        maxToolRounds: this.subAgentMaxRounds,
        maxTokens: this.maxTokensPerRole.view,
        onStatus,
        onEvent,
      });

      let dataSummary = input.data_summary as Record<string, unknown> | undefined;
      if (!dataSummary && input.scratchpad_table) {
        try {
          const scratchpad = this.scratchpadManager.getOrCreate(conversationId);
          const rows = await scratchpad.loadTable(input.scratchpad_table as string);
          dataSummary = buildDataSummary({ rows });
        } catch { /* fallback to empty summary */ }
      }

      const task: AgentTask = {
        id: `task_${Date.now()}`,
        instruction,
        context: { dataSummary: dataSummary ?? {} },
      };

      return { result: await agent.run(task) };
    }

    // role === 'insights'
    const insightsRouter = new ToolRouter(this.toolContext, insightsTools);
    const agent = new InsightsAgent({
      provider: this.providers.insights,
      toolRouter: insightsRouter,
      maxToolRounds: this.subAgentMaxRounds,
      maxTokens: this.maxTokensPerRole.insights,
      onStatus,
      onEvent,
    });

    const task: AgentTask = {
      id: `task_${Date.now()}`,
      instruction,
      context: { tableName: input.table_name },
    };

    return { result: await agent.run(task) };
  }

  /**
   * Validate and echo a `narrate_summary` tool call. Returns a structured
   * JSON payload the SSE route re-emits as a `narrate_ready` event for the
   * UI. Validation is deliberately defensive — local Qwen builds drop
   * minItems / maxItems constraints sometimes, so we check shape here even
   * though the JSON Schema already declares it.
   */
  private handleNarrateSummary(
    tc: ToolCallResult,
  ): { content: string; isError: boolean } {
    const input = (tc.input ?? {}) as Record<string, unknown>;
    const rawBullets = input.bullets;
    if (!Array.isArray(rawBullets)) {
      return {
        content: 'narrate_summary: `bullets` is required and must be an array of 3 objects.',
        isError: true,
      };
    }
    if (rawBullets.length !== 3) {
      return {
        content: `narrate_summary: expected exactly 3 bullets, received ${rawBullets.length}.`,
        isError: true,
      };
    }

    const seenRanks = new Set<number>();
    const cleaned: Array<{
      rank: 1 | 2 | 3;
      headline: string;
      value?: string;
      body: string;
    }> = [];
    for (let i = 0; i < rawBullets.length; i++) {
      const b = rawBullets[i];
      if (!b || typeof b !== 'object') {
        return {
          content: `narrate_summary: bullet ${i} is not an object.`,
          isError: true,
        };
      }
      const obj = b as Record<string, unknown>;
      const rank = obj.rank;
      if (rank !== 1 && rank !== 2 && rank !== 3) {
        return {
          content: `narrate_summary: bullet ${i} has invalid rank "${String(rank)}" (must be 1, 2, or 3).`,
          isError: true,
        };
      }
      if (seenRanks.has(rank)) {
        return {
          content: `narrate_summary: duplicate rank ${rank} — each of 1, 2, 3 must appear exactly once.`,
          isError: true,
        };
      }
      seenRanks.add(rank);

      const headline = typeof obj.headline === 'string' ? obj.headline.trim() : '';
      if (!headline) {
        return {
          content: `narrate_summary: bullet ${i} (rank ${rank}) has empty or missing headline.`,
          isError: true,
        };
      }

      const body = typeof obj.body === 'string' ? obj.body.trim() : '';
      if (!body) {
        return {
          content: `narrate_summary: bullet ${i} (rank ${rank}) has empty or missing body.`,
          isError: true,
        };
      }

      const value = typeof obj.value === 'string' ? obj.value.trim() : undefined;
      cleaned.push({
        rank,
        headline,
        body,
        ...(value ? { value } : {}),
      });
    }

    // Sort by rank so downstream consumers don't have to re-order.
    cleaned.sort((a, b) => a.rank - b.rank);

    const caveat = typeof input.caveat === 'string' ? input.caveat.trim() : '';

    return {
      content: JSON.stringify({
        bullets: cleaned,
        ...(caveat ? { caveat } : {}),
        rendered: true,
      }),
      isError: false,
    };
  }

  /** Handle load_scratchpad — returns summary, not full data. */
  private async handleLoadScratchpad(
    tc: ToolCallResult,
    conversationId: string,
  ): Promise<{ content: string; isError: boolean }> {
    const input = tc.input as Record<string, unknown>;
    const tableName = input.table_name as string;

    if (!tableName) {
      return { content: 'table_name is required', isError: true };
    }

    try {
      const scratchpad = this.scratchpadManager.getOrCreate(conversationId);
      const rows = await scratchpad.loadTable(tableName);
      const summary = buildDataSummary({ rows });
      return { content: JSON.stringify(summary), isError: false };
    } catch (err) {
      return {
        content: `Scratchpad error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }

  /** Get the last user message from conversation history. */
  private getLastUserMessage(): string | undefined {
    const messages = this.conversation.getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user' && messages[i]!.content) {
        return messages[i]!.content;
      }
    }
    return undefined;
  }

  /** Load prior conversation history. */
  loadHistory(messages: Message[]): void {
    for (const msg of messages) {
      this.conversation.addMessage(msg);
    }
  }

  /** Reset the conversation history. */
  reset(): void {
    this.conversation.clear();
    this.queryCounter = 0;
    this.taskPool = new TaskPool();
    this.pendingEvents = [];
  }

  /** Get the conversation history. */
  getHistory(): Message[] {
    return this.conversation.getMessages();
  }

  /** Expose the task pool for testing and observability. */
  getTaskPool(): { running: () => TaskHandle[]; listHandles: () => TaskHandle[] } {
    return {
      running: () => this.taskPool.running(),
      listHandles: () => this.taskPool.listHandles(),
    };
  }

  /**
   * Cancel every running sub-agent task. Called when the SSE client
   * disconnects so we don't leave orphan DB queries / LLM requests
   * burning resources. Returns the number of tasks cancelled.
   */
  cancelAllTasks(): number {
    return this.taskPool.cancelAll();
  }
}
