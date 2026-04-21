import { ConversationManager } from './conversation/manager';
import { classifyTool, formatEnd, formatStart, type ToolKind } from './events/tool-event-formatter';
import type { LLMProvider, Message, StreamEvent, ToolCallResult } from './provider/types';
import { buildSystemPrompt } from './prompt/system';
import { agentTools } from './tools/definitions';
import { ToolRouter, type ToolContext } from './tools/router';

/** Events emitted by the agent during a conversation turn. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | {
      type: 'tool_start';
      name: string;
      id: string;
      /** Semantic bucket used by the UI to color-code the row. */
      kind?: ToolKind;
      /** Compact single-line label for the editorial trace. */
      label?: string;
      /** When a sub-agent ran this tool, the role of that sub-agent. */
      parentAgent?: string;
    }
  | {
      type: 'tool_end';
      name: string;
      result: string;
      isError: boolean;
      kind?: ToolKind;
      label?: string;
      /** Terminal suffix like `→ 412 rows`. */
      resultSummary?: string;
      /** Wall-clock execution duration, measured around the tool router call. */
      durationMs?: number;
      parentAgent?: string;
    }
  | { type: 'agent_start'; agent: string; task: string }
  | { type: 'agent_end'; agent: string; summary: string }
  | { type: 'thinking'; text: string }
  /** A sub-agent task has been dispatched to run in the background. */
  | { type: 'task_dispatched'; taskId: string; agent: string; instruction: string }
  /** A background task has finished (success or failure). */
  | { type: 'task_complete'; taskId: string; agent: string; summary: string; isError: boolean }
  /** A background task was cooperatively cancelled. */
  | { type: 'task_cancelled'; taskId: string }
  /** Progress ping from a running task — human-friendly status string for the UI. */
  | { type: 'task_progress'; taskId: string; message: string }
  /** Status ping from the leader or a sub-agent not tied to a specific task. */
  | { type: 'status'; scope: string; message: string }
  | { type: 'done'; stopReason: string };

/** Data sources available to the agent. */
export interface AgentDataSource {
  id: string;
  name: string;
  type: string;
  /** Curated schema document — human-written or agent-refined markdown. */
  schemaDoc?: string | null;
  /** Enriched schema context from bootstrap. */
  schemaContext?: Record<string, unknown> | null;
  /** Legacy basic schema (fallback). */
  cachedSchema?: Record<string, unknown> | null;
}

/** Configuration for creating an Agent. */
export interface AgentConfig {
  provider: LLMProvider;
  toolContext: ToolContext;
  dataSources: AgentDataSource[];
  maxToolRounds?: number;
  /** When true, uses the multi-agent LeaderAgent instead of the monolithic agent. */
  multiAgent?: boolean;
  /** Conversation ID for scratchpad association (required when multiAgent=true). */
  conversationId?: string;
}

/**
 * The Lightboard AI agent. Receives natural language questions,
 * uses tool calling to explore data, and produces ViewSpecs.
 *
 * Supports streaming responses and multi-turn tool use with
 * automatic error self-correction.
 */
export class Agent {
  private provider: LLMProvider;
  private toolRouter: ToolRouter;
  private conversation: ConversationManager;
  private dataSources: AgentDataSource[];
  private maxToolRounds: number;

  constructor(config: AgentConfig) {
    this.provider = config.provider;
    this.toolRouter = new ToolRouter(config.toolContext);
    this.conversation = new ConversationManager();
    this.dataSources = config.dataSources;
    this.maxToolRounds = config.maxToolRounds ?? 10;
  }

  /**
   * Process a user message and stream the agent's response.
   * The agent may make multiple tool calls before producing a final response.
   */
  async *chat(
    userMessage: string,
    currentView?: Record<string, unknown> | null,
  ): AsyncIterable<AgentEvent> {
    this.conversation.addMessage({ role: 'user', content: userMessage });

    const systemPrompt = buildSystemPrompt({
      dataSources: this.dataSources as Parameters<typeof buildSystemPrompt>[0]['dataSources'],
      currentView,
    });

    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    for (let round = 0; round < this.maxToolRounds; round++) {
      const toolCalls: ToolCallResult[] = [];
      const toolInputBuffers = new Map<string, string>();
      let textContent = '';
      let hasToolCalls = false;

      // Stream LLM response
      const stream = this.provider.chat(
        this.conversation.getMessages(),
        agentTools,
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
            // Store the tool name for later so we can enrich tool_start once
            // the input has finished streaming.
            toolCalls.push({ id: event.id, name: event.name, input: {} });
            // Emit the start event now (with kind only — label comes once
            // the input is complete at tool_end boundary). A minimally-enriched
            // start lets the UI still color the row while args are streaming.
            yield {
              type: 'tool_start',
              name: event.name,
              id: event.id,
              kind: classifyTool(event.name),
            };
            break;

          case 'tool_call_delta':
            const existing = toolInputBuffers.get(event.id) ?? '';
            toolInputBuffers.set(event.id, existing + event.input);
            break;

          case 'tool_call_end':
            const tc = toolCalls.find((t) => t.id === event.id);
            if (tc) tc.input = event.input;
            break;

          case 'message_end':
            // If no tool calls were made via tool_call_end events,
            // try parsing accumulated input buffers
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

      // Store assistant message
      this.conversation.addMessage({
        role: 'assistant',
        content: textContent,
        toolCalls: hasToolCalls ? toolCalls : undefined,
      });

      // If no tool calls, we're done
      if (!hasToolCalls) {
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }

      // Execute tool calls and feed results back
      const toolResults = [];
      let allFailed = true;
      for (const tc of toolCalls) {
        const { kind, label } = formatStart(tc.name, tc.input);
        const startMs = performance.now();
        const result = await this.toolRouter.execute(tc.name, tc.input);
        const durationMs = Math.max(0, Math.round(performance.now() - startMs));
        const { resultSummary } = formatEnd(tc.name, result.content, result.isError, durationMs);
        toolResults.push({
          toolCallId: tc.id,
          content: result.content,
          isError: result.isError,
        });
        if (!result.isError) allFailed = false;
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
      }

      // Circuit breaker: stop if tools keep failing
      consecutiveFailures = allFailed ? consecutiveFailures + 1 : 0;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        yield { type: 'text', text: '\n\nI was unable to complete this request after multiple attempts. Please check your data source configuration and try again.' };
        yield { type: 'done', stopReason: 'tool_failure' };
        return;
      }

      // Add tool results as user message for next round
      this.conversation.addMessage({
        role: 'user',
        content: '',
        toolResults,
      });
    }

    yield { type: 'done', stopReason: 'max_tool_rounds' };
  }

  /** Load prior conversation history for multi-turn session persistence. */
  loadHistory(messages: Message[]): void {
    for (const msg of messages) {
      this.conversation.addMessage(msg);
    }
  }

  /** Reset the conversation history. */
  reset(): void {
    this.conversation.clear();
  }

  /** Get the conversation history. */
  getHistory(): Message[] {
    return this.conversation.getMessages();
  }
}
