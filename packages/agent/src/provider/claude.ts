import Anthropic from '@anthropic-ai/sdk';
import type { ChatOptions, LLMProvider, Message, StreamEvent, ToolDefinition } from './types';
import { LLMError } from './types';

/** Configuration for the Claude provider. */
export interface ClaudeProviderConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Claude LLM provider using the Anthropic SDK.
 * Streams responses with native tool use support.
 */
export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;

  constructor(config: ClaudeProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.defaultModel = config.model ?? 'claude-sonnet-4-20250514';
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  /** Stream a chat response from Claude with tool use. */
  async *chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): AsyncIterable<StreamEvent> {
    const anthropicMessages = this.convertMessages(messages);
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }));

    try {
      const stream = this.client.messages.stream({
        model: options?.model ?? this.defaultModel,
        max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
        temperature: options?.temperature,
        system: options?.system,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      });

      for await (const event of stream) {
        yield* this.convertStreamEvent(event);
      }
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new LLMError(
          err.message,
          'claude',
          err.status,
          err.status === 429 || err.status >= 500,
        );
      }
      throw err;
    }
  }

  /** Converts our Message format to Anthropic's format. */
  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // System handled separately

      if (msg.role === 'user') {
        if (msg.toolResults && msg.toolResults.length > 0) {
          // Tool results go as user messages with tool_result content blocks
          result.push({
            role: 'user',
            content: msg.toolResults.map((r) => ({
              type: 'tool_result' as const,
              tool_use_id: r.toolCallId,
              content: r.content,
              is_error: r.isError,
            })),
          });
        } else {
          result.push({ role: 'user', content: msg.content });
        }
      } else if (msg.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
        }
        result.push({ role: 'assistant', content });
      }
    }

    return result;
  }

  /** Converts Anthropic stream events to our StreamEvent format. */
  private *convertStreamEvent(event: Anthropic.MessageStreamEvent): Iterable<StreamEvent> {
    switch (event.type) {
      case 'content_block_start':
        if (event.content_block.type === 'tool_use') {
          yield {
            type: 'tool_call_start',
            id: event.content_block.id,
            name: event.content_block.name,
          };
        }
        break;

      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          yield {
            type: 'tool_call_delta',
            id: '', // Anthropic doesn't include id in deltas
            input: event.delta.partial_json,
          };
        }
        break;

      case 'message_stop':
        yield { type: 'message_end', stopReason: 'end_turn' };
        break;
    }
  }
}
