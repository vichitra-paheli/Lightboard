import type { AgentEvent } from '../agent';
import { buildQueryPrompt } from '../prompt/query-prompt';
import type { LLMProvider, ToolCallResult } from '../provider/types';
import { queryTools } from '../tools/query-tools';
import { ToolRouter, type ToolContext } from '../tools/router';

import type {
  AgentTask,
  SubAgent,
  SubAgentResult,
  ToolCallRecord,
} from './types';

/** Configuration for creating a QueryAgent. */
export interface QueryAgentConfig {
  /** LLM provider for the query agent's own conversation. */
  provider: LLMProvider;
  /** Tool context connecting to data source services. */
  toolContext: ToolContext;
  /** Maximum tool call rounds before stopping (default: 5). */
  maxRounds?: number;
}

/**
 * Query Agent specialist — handles schema exploration and data retrieval.
 *
 * Runs its own LLM conversation with a focused system prompt containing
 * schema details and QueryIR specification. Has access to get_schema,
 * execute_query, and run_sql tools only.
 *
 * Returns structured SubAgentResult with query results data.
 */
export class QueryAgent implements SubAgent {
  readonly id: string;
  readonly role = 'query' as const;

  private provider: LLMProvider;
  private toolRouter: ToolRouter;
  private maxRounds: number;

  constructor(config: QueryAgentConfig) {
    this.id = `query-agent-${Date.now()}`;
    this.provider = config.provider;
    this.toolRouter = new ToolRouter(config.toolContext, queryTools);
    this.maxRounds = config.maxRounds ?? 5;
  }

  /**
   * Execute a query task. Yields AgentEvents for transparency logging,
   * then returns a structured SubAgentResult via the final 'done' event.
   *
   * The leader collects tool_start/tool_end events but does NOT forward
   * text events to the user — only the leader streams to the user.
   */
  async *chat(task: AgentTask): AsyncGenerator<AgentEvent> {
    const toolCallLog: ToolCallRecord[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let resultData: Record<string, unknown> = {};
    let lastError: string | undefined;

    // Build focused system prompt with schema context
    const dataSources = (task.context.dataSources ?? []) as Array<{
      id: string;
      name: string;
      type: string;
      cachedSchema?: { tables: { name: string; schema: string; columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[] }[] } | null;
    }>;

    const systemPrompt = buildQueryPrompt({ dataSources });

    // Start with the task instruction as a user message
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; toolCalls?: ToolCallResult[]; toolResults?: Array<{ toolCallId: string; content: string; isError?: boolean }> }> = [
      { role: 'user', content: task.instruction },
    ];

    for (let round = 0; round < this.maxRounds; round++) {
      const toolCalls: ToolCallResult[] = [];
      const toolInputBuffers = new Map<string, string>();
      let textContent = '';
      let hasToolCalls = false;

      const stream = this.provider.chat(messages, queryTools, {
        system: systemPrompt,
      });

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
            const existing = toolInputBuffers.get(event.id) ?? '';
            toolInputBuffers.set(event.id, existing + event.input);
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

      // Store assistant message
      messages.push({
        role: 'assistant',
        content: textContent,
        toolCalls: hasToolCalls ? toolCalls : undefined,
      });

      // If no tool calls, the agent is done reasoning
      if (!hasToolCalls) {
        resultData = { text: textContent };
        break;
      }

      // Execute tool calls
      const toolResults: Array<{ toolCallId: string; content: string; isError?: boolean }> = [];
      for (const tc of toolCalls) {
        const startTime = Date.now();
        const result = await this.toolRouter.execute(tc.name, tc.input);
        const durationMs = Date.now() - startTime;

        toolCallLog.push({
          name: tc.name,
          input: tc.input,
          result: result.content,
          isError: result.isError,
          durationMs,
        });

        toolResults.push({
          toolCallId: tc.id,
          content: result.content,
          isError: result.isError,
        });

        if (result.isError) {
          lastError = result.content;
        } else {
          lastError = undefined;
          // Capture the last successful query result as the output
          try {
            resultData = JSON.parse(result.content) as Record<string, unknown>;
          } catch {
            resultData = { raw: result.content };
          }
        }

        yield { type: 'tool_end', name: tc.name, result: result.content, isError: result.isError };
      }

      // Feed tool results back for next round
      messages.push({
        role: 'user',
        content: '',
        toolResults,
      });
    }

    // Build the final SubAgentResult and attach it to the done event
    const agentResult: SubAgentResult = {
      agentId: this.id,
      role: this.role,
      success: !lastError,
      data: resultData,
      toolCalls: toolCallLog,
      tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
      error: lastError,
    };

    yield {
      type: 'done',
      stopReason: lastError ? 'error' : 'end_turn',
      ...(agentResult as unknown as Record<string, never>),
    };
  }

  /**
   * Run a query task and return the structured result directly.
   * Convenience method that consumes the async generator internally.
   */
  async run(task: AgentTask): Promise<SubAgentResult> {
    const toolCallLog: ToolCallRecord[] = [];
    let resultData: Record<string, unknown> = {};
    let lastError: string | undefined;

    for await (const event of this.chat(task)) {
      if (event.type === 'tool_end') {
        // toolCallLog is already populated via chat()
      }
      if (event.type === 'done') {
        // Extract the SubAgentResult we attached to the done event
        const doneWithResult = event as unknown as Record<string, unknown>;
        if (doneWithResult.agentId) {
          return doneWithResult as unknown as SubAgentResult;
        }
      }
    }

    return {
      agentId: this.id,
      role: this.role,
      success: !lastError,
      data: resultData,
      toolCalls: toolCallLog,
      tokenUsage: { input: 0, output: 0 },
      error: lastError,
    };
  }
}
