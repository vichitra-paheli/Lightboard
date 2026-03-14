import { ConversationManager } from './conversation/manager';
import type { LLMProvider, Message, StreamEvent, ToolCallResult } from './provider/types';
import { buildSystemPrompt } from './prompt/system';
import { agentTools } from './tools/definitions';
import { ToolRouter, type ToolContext } from './tools/router';

/** Events emitted by the agent during a conversation turn. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; id: string }
  | { type: 'tool_end'; name: string; result: string; isError: boolean }
  | { type: 'done'; stopReason: string };

/** Data sources available to the agent. */
export interface AgentDataSource {
  id: string;
  name: string;
  type: string;
}

/** Configuration for creating an Agent. */
export interface AgentConfig {
  provider: LLMProvider;
  toolContext: ToolContext;
  dataSources: AgentDataSource[];
  maxToolRounds?: number;
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
      dataSources: this.dataSources,
      currentView,
    });

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
            yield { type: 'tool_start', name: event.name, id: event.id };
            // Store the tool name for later
            toolCalls.push({ id: event.id, name: event.name, input: {} });
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
      for (const tc of toolCalls) {
        const result = await this.toolRouter.execute(tc.name, tc.input);
        toolResults.push({
          toolCallId: tc.id,
          content: result.content,
          isError: result.isError,
        });
        yield { type: 'tool_end', name: tc.name, result: result.content, isError: result.isError };
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

  /** Reset the conversation history. */
  reset(): void {
    this.conversation.clear();
  }

  /** Get the conversation history. */
  getHistory(): Message[] {
    return this.conversation.getMessages();
  }
}
