import type { ChatOptions, LLMErrorReason, LLMProvider, Message, StreamEvent, ToolDefinition } from './types';
import { LLMError } from './types';
import { DEFAULT_MAX_OUTPUT_TOKENS } from './constants';

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
    this.defaultMaxTokens = config.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
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

    const body: Record<string, unknown> = {
      model: options?.model ?? this.defaultModel,
      messages: openaiMessages,
      stream: true,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
    };
    // Only include tools if there are any — some APIs reject empty/null tools arrays
    if (openaiTools && openaiTools.length > 0) {
      body.tools = openaiTools;
    }
    // Only include temperature if explicitly set — avoid sending undefined
    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const msgSummary = (body.messages as Array<{ role: string; content?: unknown }>).map(
      (m) => `${m.role}:${typeof m.content === 'string' ? m.content.slice(0, 80) : String(m.content)}`,
    );
    console.log(`[OpenAICompatibleProvider] Request: model=${body.model}, msgs=[${msgSummary.join(' | ')}], tools=${openaiTools?.length ?? 0}`);

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorBody = await response.text();
        errorDetail = errorBody.slice(0, 500);
        console.error(`[OpenAICompatibleProvider] ${response.status} error:`, errorDetail);
      } catch { /* ignore */ }
      throw new LLMError(
        `OpenAI-compatible API error: ${response.status} ${response.statusText}${errorDetail ? ` — ${errorDetail}` : ''}`,
        'openai-compatible',
        response.status,
        response.status === 429 || response.status >= 500,
        classifyOpenAIError(response.status, errorDetail),
      );
    }

    if (!response.body) {
      throw new LLMError('No response body', 'openai-compatible');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Track tool calls by index (id only appears in the first chunk, subsequent
    // delta chunks only have index). Map index → { id, name, args }.
    const toolCallsByIndex = new Map<number, { id: string; name: string; args: string }>();

    /** Emit tool_call_end for all pending tool calls and clear the map. */
    const flushToolCalls = function* () {
      for (const [, tc] of toolCallsByIndex) {
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = JSON.parse(tc.args);
        } catch { /* leave as empty */ }
        yield { type: 'tool_call_end' as const, id: tc.id, name: tc.name, input: parsedInput };
      }
      toolCallsByIndex.clear();
    };

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
          yield* flushToolCalls();
          yield { type: 'message_end', stopReason: toolCallsByIndex.size > 0 ? 'tool_use' : 'end_turn' };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
          const finishReason = choice?.finish_reason;

          if (delta?.content) {
            yield { type: 'text_delta', text: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              const existing = toolCallsByIndex.get(index);

              if (tc.id && tc.function?.name) {
                // First chunk for this tool call — has id and name
                toolCallsByIndex.set(index, { id: tc.id, name: tc.function.name, args: tc.function.arguments ?? '' });
                yield { type: 'tool_call_start', id: tc.id, name: tc.function.name };
              } else if (tc.function?.arguments && existing) {
                // Subsequent delta chunks — only have index and argument fragment
                existing.args += tc.function.arguments;
                yield { type: 'tool_call_delta', id: existing.id, input: tc.function.arguments };
              }
            }
          }

          if (finishReason === 'tool_calls') {
            yield* flushToolCalls();
            yield { type: 'message_end', stopReason: 'tool_use' };
            return;
          }
          if (finishReason === 'stop') {
            yield* flushToolCalls();
            yield { type: 'message_end', stopReason: 'end_turn' };
            return;
          }
          if (finishReason === 'length') {
            // OpenAI's signal for output-token ceiling hit. Surface as a
            // structured error so the UI can tell the user which knob to
            // turn. Emit any pending tool calls first so nothing is lost.
            yield* flushToolCalls();
            throw new LLMError(
              `Output truncated at max_tokens=${options?.maxTokens ?? this.defaultMaxTokens}. Raise the model's max_tokens setting for this agent role.`,
              'openai-compatible',
              undefined,
              false,
              'output_tokens_exceeded',
            );
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    yield* flushToolCalls();
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

/**
 * Classify an HTTP error from an OpenAI-compatible endpoint into a structured
 * {@link LLMErrorReason}. Pattern-matches the error body because providers
 * differ on status codes for token-limit issues (some use 400, others 413).
 */
function classifyOpenAIError(status: number, body: string): LLMErrorReason {
  const msg = body.toLowerCase();
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  if (msg.includes('max_tokens') || msg.includes('max tokens') || msg.includes('output token')) {
    return 'output_tokens_exceeded';
  }
  if (msg.includes('context') && (msg.includes('length') || msg.includes('window'))) {
    return 'context_length_exceeded';
  }
  if (msg.includes('maximum context') || msg.includes('too many tokens')) {
    return 'context_length_exceeded';
  }
  if (status === 400) return 'invalid_request';
  return 'unknown';
}
