/** A message in the conversation. */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallResult[];
  toolResults?: ToolResult[];
}

/** A tool call made by the assistant. */
export interface ToolCallResult {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Result returned from executing a tool. */
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

/** Tool definition passed to the LLM. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Streaming events emitted by the LLM provider. */
export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; input: string }
  | { type: 'tool_call_end'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'message_end'; stopReason: string };

/** Options for LLM chat requests. */
export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

/** Normalized error from any LLM provider. */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Abstract interface for LLM providers.
 * Normalizes Claude and OpenAI-compatible APIs into a single streaming interface.
 */
export interface LLMProvider {
  /** Provider name (e.g. 'claude', 'openai'). */
  readonly name: string;

  /** Send a chat request with tools and stream the response. */
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): AsyncIterable<StreamEvent>;
}
