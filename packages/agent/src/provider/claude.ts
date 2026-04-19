import Anthropic from '@anthropic-ai/sdk';
import type { ChatOptions, LLMErrorReason, LLMProvider, Message, StreamEvent, ToolDefinition } from './types';
import { LLMError } from './types';
import { DEFAULT_MAX_OUTPUT_TOKENS } from './constants';

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
    this.defaultMaxTokens = config.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
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

    const model = options?.model ?? this.defaultModel;
    const msgSummary = messages.map((m) => `${m.role}:${(m.content as string)?.length ?? 0}c`);
    console.log(`[Claude] Request: model=${model}, msgs=[${msgSummary.join(', ')}], tools=[${tools.map(t => t.name).join(', ')}]`);

    try {
      const stream = this.client.messages.stream({
        model,
        max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
        temperature: options?.temperature,
        system: options?.system,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      });

      // Track active tool call for correlating deltas with content_block_stop
      let activeToolId = '';
      let activeToolName = '';
      let activeToolInput = '';
      // stop_reason arrives on `message_delta`, not `message_stop`; hold it
      // so we can surface it in the final message_end event.
      let finalStopReason = 'end_turn';

      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start':
            if (event.content_block.type === 'tool_use') {
              activeToolId = event.content_block.id;
              activeToolName = event.content_block.name;
              activeToolInput = '';
              yield {
                type: 'tool_call_start' as const,
                id: event.content_block.id,
                name: event.content_block.name,
              };
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              yield { type: 'text_delta' as const, text: event.delta.text };
            } else if (event.delta.type === 'input_json_delta') {
              activeToolInput += event.delta.partial_json;
              yield {
                type: 'tool_call_delta' as const,
                id: activeToolId,
                input: event.delta.partial_json,
              };
            }
            break;

          case 'content_block_stop':
            if (activeToolId) {
              let parsed: Record<string, unknown> = {};
              try {
                parsed = JSON.parse(activeToolInput) as Record<string, unknown>;
              } catch {
                console.error(`[Claude] Failed to parse tool input for ${activeToolName}: ${activeToolInput.slice(0, 200)}`);
              }
              yield {
                type: 'tool_call_end' as const,
                id: activeToolId,
                name: activeToolName,
                input: parsed,
              };
              activeToolId = '';
              activeToolName = '';
              activeToolInput = '';
            }
            break;

          case 'message_delta':
            if (event.delta?.stop_reason) {
              finalStopReason = event.delta.stop_reason;
            }
            break;

          case 'message_stop':
            if (finalStopReason === 'max_tokens') {
              // Surface truncated output as a structured error so callers
              // (chat route, UI) can render an actionable message. The
              // stream has already delivered the (partial) text/tool data,
              // so this fires only after content has been yielded.
              throw new LLMError(
                `Output truncated at max_tokens=${options?.maxTokens ?? this.defaultMaxTokens}. Raise the model's max_tokens setting for this agent role.`,
                'claude',
                undefined,
                false,
                'output_tokens_exceeded',
              );
            }
            yield { type: 'message_end' as const, stopReason: finalStopReason };
            break;
        }
      }
    } catch (err) {
      if (err instanceof LLMError) throw err;
      if (err instanceof Anthropic.APIError) {
        throw new LLMError(
          err.message,
          'claude',
          err.status,
          err.status === 429 || err.status >= 500,
          classifyClaudeError(err),
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

}

/**
 * Map an Anthropic SDK error to a structured {@link LLMErrorReason}. Keeps
 * pattern-matching in one place so the provider class stays readable.
 */
function classifyClaudeError(err: InstanceType<typeof Anthropic.APIError>): LLMErrorReason {
  const msg = (err.message ?? '').toLowerCase();
  if (err.status === 401 || err.status === 403) return 'auth';
  if (err.status === 429) return 'rate_limited';
  if (typeof err.status === 'number' && err.status >= 500) return 'server_error';
  if (msg.includes('max_tokens') || msg.includes('output tokens')) return 'output_tokens_exceeded';
  if (msg.includes('context') && (msg.includes('length') || msg.includes('window'))) {
    return 'context_length_exceeded';
  }
  if (msg.includes('prompt is too long')) return 'context_length_exceeded';
  if (err.status === 400) return 'invalid_request';
  return 'unknown';
}
