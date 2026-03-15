import type { ChatOptions, LLMProvider, Message, StreamEvent, ToolDefinition } from './types';
import { LLMError } from './types';

/** Configuration for OpenAI-compatible providers (Ollama, vLLM, etc.). */
export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  maxTokens?: number;
}

/**
 * OpenAI-compatible LLM provider for on-prem and airgapped deployments.
 * Works with Ollama, vLLM, LiteLLM, or any OpenAI-compatible API.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private defaultMaxTokens: number;

  constructor(config: OpenAICompatibleConfig) {
    let url = config.baseUrl;
    while (url.endsWith('/')) url = url.slice(0, -1);
    if (url.endsWith('/v1')) url = url.slice(0, -3);
    this.baseUrl = url;
    this.apiKey = config.apiKey ?? '';
    this.defaultModel = config.model;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  /** Stream a chat response from an OpenAI-compatible endpoint. */
  async *chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): AsyncIterable<StreamEvent> {
    const openaiMessages = this.convertMessages(messages, options?.system);
    const openaiTools = tools.length > 0
      ? tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }))
      : undefined;

    const body = {
      model: options?.model ?? this.defaultModel,
      messages: openaiMessages,
      tools: openaiTools,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      temperature: options?.temperature,
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new LLMError(
        `OpenAI-compatible API error: ${response.status} ${response.statusText}`,
        'openai-compatible',
        response.status,
        response.status === 429 || response.status >= 500,
      );
    }

    if (!response.body) {
      throw new LLMError('No response body', 'openai-compatible');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          yield { type: 'message_end', stopReason: 'end_turn' };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            yield { type: 'text_delta', text: delta.content };
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                yield {
                  type: 'tool_call_start',
                  id: tc.id ?? `call_${tc.index}`,
                  name: tc.function.name,
                };
              }
              if (tc.function?.arguments) {
                yield {
                  type: 'tool_call_delta',
                  id: tc.id ?? `call_${tc.index}`,
                  input: tc.function.arguments,
                };
              }
            }
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    yield { type: 'message_end', stopReason: 'end_turn' };
  }

  /** Converts our Message format to OpenAI's format. */
  private convertMessages(messages: Message[], system?: string): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];

    if (system) {
      result.push({ role: 'system', content: system });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user' && msg.toolResults) {
        for (const r of msg.toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: r.toolCallId,
            content: r.content,
          });
        }
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        });
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }
}
