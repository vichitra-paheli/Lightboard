import { describe, expect, it } from 'vitest';
import { parseSSE } from './sse-parser';

/** Creates a mock Response with the given body text as a ReadableStream. */
function mockResponse(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream);
}

/** Creates a mock Response that delivers body in multiple chunks. */
function mockChunkedResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]!));
        index++;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream);
}

describe('parseSSE', () => {
  it('parses a single text event', async () => {
    const response = mockResponse('event: text\ndata: {"text":"hello"}\n\n');
    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'text', data: '{"text":"hello"}' });
  });

  it('parses multiple events', async () => {
    const body =
      'event: text\ndata: {"text":"hello"}\n\n' +
      'event: tool_start\ndata: {"name":"get_schema","id":"tc_1"}\n\n' +
      'event: done\ndata: {"stopReason":"end_turn"}\n\n';

    const response = mockResponse(body);
    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(3);
    expect(events[0]!.event).toBe('text');
    expect(events[1]!.event).toBe('tool_start');
    expect(events[2]!.event).toBe('done');
  });

  it('ignores heartbeat comment lines', async () => {
    const body = ': heartbeat\n\nevent: text\ndata: {"text":"hi"}\n\n: heartbeat\n\n';
    const response = mockResponse(body);
    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('text');
  });

  it('handles chunked delivery across event boundaries', async () => {
    const response = mockChunkedResponse([
      'event: text\ndata: {"te',
      'xt":"hello"}\n\nevent: done\n',
      'data: {"stopReason":"end_turn"}\n\n',
    ]);
    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0]!.event).toBe('text');
    expect(JSON.parse(events[0]!.data)).toEqual({ text: 'hello' });
    expect(events[1]!.event).toBe('done');
  });

  it('handles response with no body gracefully', async () => {
    const response = new Response(null);
    const events = [];
    try {
      for await (const event of parseSSE(response)) {
        events.push(event);
      }
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('parses error events', async () => {
    const body = 'event: error\ndata: {"error":"Something went wrong"}\n\n';
    const response = mockResponse(body);
    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('error');
    expect(JSON.parse(events[0]!.data)).toEqual({ error: 'Something went wrong' });
  });
});
