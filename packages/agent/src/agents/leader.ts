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
import type { AgentTask, SubAgentResult } from './types';
import { ViewAgent } from './view-agent';

/** Configuration for creating a LeaderAgent. */
export interface LeaderAgentConfig {
  /** LLM provider for the leader and sub-agents. */
  provider: LLMProvider;
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
}

/**
 * Leader Agent — the multi-agent conversation orchestrator.
 *
 * Manages conversation with the user, delegates to specialist sub-agents
 * (query, view, insights) via tool use, and manages the session scratchpad.
 * Only the leader streams text to the user.
 */
export class LeaderAgent {
  private provider: LLMProvider;
  private toolContext: ToolContext;
  private dataSources: AgentDataSource[];
  private scratchpadManager: ScratchpadManager;
  private conversation: ConversationManager;
  private maxToolRounds: number;
  private subAgentMaxRounds: number;

  constructor(config: LeaderAgentConfig) {
    this.provider = config.provider;
    this.toolContext = config.toolContext;
    this.dataSources = config.dataSources;
    this.scratchpadManager = config.scratchpadManager ?? new ScratchpadManager();
    this.conversation = new ConversationManager();
    this.maxToolRounds = config.maxToolRounds ?? 10;
    this.subAgentMaxRounds = config.subAgentMaxRounds ?? 5;
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

    const scratchpad = this.scratchpadManager.getOrCreate(conversationId);
    const scratchpadTables = scratchpad.listTables().map((t) => `${t.name}: ${t.description}`);

    const systemPrompt = buildLeaderPrompt({
      dataSources: this.dataSources,
      scratchpadTables,
    });

    for (let round = 0; round < this.maxToolRounds; round++) {
      const toolCalls: ToolCallResult[] = [];
      const toolInputBuffers = new Map<string, string>();
      let textContent = '';
      let hasToolCalls = false;

      const stream = this.provider.chat(
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

      if (!hasToolCalls) {
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }

      // Execute tool calls (delegation or scratchpad)
      const toolResults = [];
      for (const tc of toolCalls) {
        let result: { content: string; isError: boolean };

        if (tc.name.startsWith('delegate_')) {
          result = yield* this.handleDelegation(tc, conversationId);
        } else if (tc.name.startsWith('save_') || tc.name.startsWith('load_') || tc.name.startsWith('list_') || tc.name.startsWith('query_')) {
          result = await this.handleScratchpad(tc, conversationId);
        } else {
          result = { content: `Unknown tool: ${tc.name}`, isError: true };
        }

        toolResults.push({
          toolCallId: tc.id,
          content: result.content,
          isError: result.isError,
        });
        yield { type: 'tool_end', name: tc.name, result: result.content, isError: result.isError };
      }

      this.conversation.addMessage({
        role: 'user',
        content: '',
        toolResults,
      });
    }

    yield { type: 'done', stopReason: 'max_tool_rounds' };
  }

  /**
   * Handle a delegation tool call by creating and running the appropriate sub-agent.
   * Yields agent_start/agent_end events for UI transparency.
   */
  private async *handleDelegation(
    tc: ToolCallResult,
    conversationId: string,
  ): AsyncGenerator<AgentEvent, { content: string; isError: boolean }> {
    const input = tc.input as { instruction?: string; source_id?: string; data_summary?: Record<string, unknown>; table_name?: string };
    const instruction = input.instruction ?? '';

    try {
      switch (tc.name) {
        case 'delegate_query': {
          yield { type: 'agent_start', agent: 'query', task: instruction };

          const sourceId = input.source_id ?? this.dataSources[0]?.id ?? '';
          const ds = this.dataSources.find((d) => d.id === sourceId);

          const queryRouter = new ToolRouter(this.toolContext, queryTools);
          const agent = new QueryAgent({
            provider: this.provider,
            toolRouter: queryRouter,
            maxToolRounds: this.subAgentMaxRounds,
          });

          const task: AgentTask = {
            id: `task_${Date.now()}`,
            instruction,
            context: {
              dataSources: ds ? [ds] : this.dataSources,
            },
          };

          const agentResult = await agent.run(task);
          const summary = agentResult.success
            ? agentResult.explanation || 'Query completed'
            : `Query failed: ${agentResult.error ?? 'unknown error'}`;

          yield { type: 'agent_end', agent: 'query', summary };

          return {
            content: JSON.stringify(agentResult.data),
            isError: !agentResult.success,
          };
        }

        case 'delegate_view': {
          yield { type: 'agent_start', agent: 'view', task: instruction };

          const viewRouter = new ToolRouter(this.toolContext, viewTools);
          const agent = new ViewAgent({
            provider: this.provider,
            toolRouter: viewRouter,
            maxToolRounds: this.subAgentMaxRounds,
          });

          const task: AgentTask = {
            id: `task_${Date.now()}`,
            instruction,
            context: {
              dataSummary: input.data_summary ?? {},
            },
          };

          const agentResult = await agent.run(task);
          const summary = agentResult.success
            ? agentResult.explanation || 'View created'
            : `View creation failed: ${agentResult.error ?? 'unknown error'}`;

          yield { type: 'agent_end', agent: 'view', summary };

          return {
            content: JSON.stringify(agentResult.data),
            isError: !agentResult.success,
          };
        }

        case 'delegate_insights': {
          yield { type: 'agent_start', agent: 'insights', task: instruction };

          const insightsRouter = new ToolRouter(this.toolContext, insightsTools);
          const agent = new InsightsAgent({
            provider: this.provider,
            toolRouter: insightsRouter,
            maxToolRounds: this.subAgentMaxRounds,
          });

          const task: AgentTask = {
            id: `task_${Date.now()}`,
            instruction,
            context: {
              tableName: input.table_name,
            },
          };

          const agentResult = await agent.run(task);
          const summary = agentResult.success
            ? agentResult.explanation || 'Analysis completed'
            : `Analysis failed: ${agentResult.error ?? 'unknown error'}`;

          yield { type: 'agent_end', agent: 'insights', summary };

          return {
            content: JSON.stringify(agentResult.data),
            isError: !agentResult.success,
          };
        }

        default:
          return { content: `Unknown delegation tool: ${tc.name}`, isError: true };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      yield { type: 'agent_end', agent: tc.name.replace('delegate_', ''), summary: `Error: ${errorMsg}` };
      return { content: `Delegation failed: ${errorMsg}`, isError: true };
    }
  }

  /** Handle scratchpad tool calls (save, load, list, query). */
  private async handleScratchpad(
    tc: ToolCallResult,
    conversationId: string,
  ): Promise<{ content: string; isError: boolean }> {
    const scratchpad = this.scratchpadManager.getOrCreate(conversationId);
    const input = tc.input as Record<string, unknown>;

    try {
      switch (tc.name) {
        case 'save_scratchpad': {
          const tableName = input.table_name as string;
          const rows = input.rows as Record<string, unknown>[];
          const description = input.description as string | undefined;
          const meta = await scratchpad.saveTable(tableName, rows, description);
          return { content: JSON.stringify(meta), isError: false };
        }
        case 'load_scratchpad': {
          const tableName = input.table_name as string;
          const rows = await scratchpad.loadTable(tableName);
          return { content: JSON.stringify({ rows, rowCount: rows.length }), isError: false };
        }
        case 'list_scratchpads': {
          const tables = scratchpad.listTables();
          return { content: JSON.stringify(tables), isError: false };
        }
        case 'query_scratchpad': {
          const sql = input.sql as string;
          const result = await scratchpad.query(sql);
          return { content: JSON.stringify(result), isError: false };
        }
        default:
          return { content: `Unknown scratchpad tool: ${tc.name}`, isError: true };
      }
    } catch (err) {
      return {
        content: `Scratchpad error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
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
  }

  /** Get the conversation history. */
  getHistory(): Message[] {
    return this.conversation.getMessages();
  }
}
