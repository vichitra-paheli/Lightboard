/**
 * Parsed SSE event with event type and data payload.
 */
export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Parses a Server-Sent Events stream from a fetch Response.
 * Yields individual SSE events as they arrive from the stream.
 *
 * Handles chunked delivery where event boundaries may span multiple chunks.
 * Ignores comment lines (starting with `:`) used for heartbeats.
 */
export async function* parseSSE(response: Response): AsyncIterable<SSEEvent> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete events (separated by double newlines)
      const parts = buffer.split('\n\n');
      // Keep the last part as it may be incomplete
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const event = parseEventBlock(part);
        if (event) {
          yield event;
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const event = parseEventBlock(buffer);
      if (event) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parses a single SSE event block into an SSEEvent object.
 * Returns null for comment-only blocks or empty blocks.
 */
function parseEventBlock(block: string): SSEEvent | null {
  let eventType = 'message';
  let data = '';

  for (const line of block.split('\n')) {
    // Skip comments (heartbeat lines)
    if (line.startsWith(':')) continue;

    if (line.startsWith('event: ')) {
      eventType = line.slice(7);
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    } else if (line === 'data:') {
      data = '';
    }
  }

  if (!data && eventType === 'message') return null;

  return { event: eventType, data };
}
