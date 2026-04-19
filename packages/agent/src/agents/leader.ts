import type { AgentDataSource, AgentEvent } from '../agent';
import { ConversationManager } from '../conversation/manager';
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
  /** Counter for auto-naming scratchpad tables. */
  private queryCounter = 0;
  /** Per-turn task pool for async dispatch. Reset at the start of each chat() call. */
  private taskPool: TaskPool = new TaskPool();
  /** Events emitted by background tasks, flushed at safe yield points. */
  private pendingEvents: AgentEvent[] = [];

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
        { system: systemPrompt },
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
            yield { type: 'tool_start', name: event.name, id: event.id };
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
        } else {
          result = { content: `Unknown tool: ${tc.name}`, isError: true };
        }

        toolResults.push({
          toolCallId: tc.id,
          content: result.content,
          isError: result.isError,
        });
        yield { type: 'tool_end', name: tc.name, result: result.content, isError: result.isError };

        // Flush any async events that fired during this tool call.
        yield* this.flushPending();
      }

      this.conversation.addMessage({
        role: 'user',
        content: '',
        toolResults,
      });
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

    if (role === 'query') {
      const sourceId = (input.source_id as string) ?? this.dataSources[0]?.id ?? '';
      const ds = this.dataSources.find((d) => d.id === sourceId);

      const queryRouter = new ToolRouter(this.toolContext, queryTools);
      const agent = new QueryAgent({
        provider: this.providers.query,
        toolRouter: queryRouter,
        maxToolRounds: this.subAgentMaxRounds,
        onStatus,
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
        onStatus,
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
      onStatus,
    });

    const task: AgentTask = {
      id: `task_${Date.now()}`,
      instruction,
      context: { tableName: input.table_name },
    };

    return { result: await agent.run(task) };
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
