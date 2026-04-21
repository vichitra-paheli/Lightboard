import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from './openai-compatible';
import { LLMError } from './types';
import type { StreamEvent, ToolDefinition } from './types';

/**
 * Build a Response whose body streams a sequence of SSE chunks followed by the
 * terminating `data: [DONE]` line. Each entry in `chunks` becomes one
 * `data: <json>\n\n` frame.
 */
function sseResponse(chunks: Array<Record<string, unknown>>, opts: { includeDone?: boolean } = {}): Response {
  const encoder = new TextEncoder();
  const includeDone = opts.includeDone ?? true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      if (includeDone) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** Collect all events from a provider chat call into an array. */
async function collectEvents(
  provider: OpenAICompatibleProvider,
  tools: ToolDefinition[] = [],
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of provider.chat([{ role: 'user', content: 'hi' }], tools)) {
    events.push(event);
  }
  return events;
}

/** Shared tool fixture so every scenario looks the same on the request side. */
const runSqlTool: ToolDefinition = {
  name: 'run_sql',
  description: 'run a SQL query',
  inputSchema: { type: 'object', properties: {} },
};

describe('OpenAICompatibleProvider streaming', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('emits text deltas for a plain text stream with no tool calls', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { choices: [{ index: 0, delta: { content: 'Hello ' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: { content: 'world' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]),
    );

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://mock', model: 'qwen' });
    const events = await collectEvents(provider);

    expect(events).toEqual([
      { type: 'text_delta', text: 'Hello ' },
      { type: 'text_delta', text: 'world' },
      { type: 'message_end', stopReason: 'end_turn' },
    ]);
  });

  it('handles a standard OpenAI tool-call stream (id+name once, then arg deltas)', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_abc',
                    type: 'function',
                    function: { name: 'run_sql', arguments: '{"sq' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, function: { arguments: 'l":"SEL' } }],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, function: { arguments: 'ECT 1"}' } }],
              },
              finish_reason: null,
            },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
      ]),
    );

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://mock', model: 'gpt' });
    const events = await collectEvents(provider, [runSqlTool]);

    const starts = events.filter((e) => e.type === 'tool_call_start');
    const deltas = events.filter((e) => e.type === 'tool_call_delta');
    const ends = events.filter((e) => e.type === 'tool_call_end');

    expect(starts).toHaveLength(1);
    expect(starts[0]).toEqual({ type: 'tool_call_start', id: 'call_abc', name: 'run_sql' });
    // Two delta chunks after the initial id+name chunk.
    expect(deltas).toHaveLength(2);
    expect(deltas.map((d) => (d.type === 'tool_call_delta' ? d.input : ''))).toEqual(['l":"SEL', 'ECT 1"}']);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toEqual({
      type: 'tool_call_end',
      id: 'call_abc',
      name: 'run_sql',
      input: { sql: 'SELECT 1' },
    });
    expect(events.at(-1)).toEqual({ type: 'message_end', stopReason: 'tool_use' });
  });

  it('dedupes Qwen-style duplicate tool_call_start chunks (id+name on every chunk)', async () => {
    // Quirk: some Qwen 3.6 35b builds via Ollama/vLLM re-send id + function.name
    // on every streaming chunk. The provider must emit exactly ONE tool_call_start
    // and fold subsequent argument fragments as deltas.
    fetchMock.mockResolvedValue(
      sseResponse([
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_qwen_1',
                    type: 'function',
                    function: { name: 'run_sql', arguments: '{"sq' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_qwen_1',
                    type: 'function',
                    function: { name: 'run_sql', arguments: 'l":"SEL' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_qwen_1',
                    type: 'function',
                    function: { name: 'run_sql', arguments: 'ECT 42"}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
      ]),
    );

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://mock', model: 'qwen' });
    const events = await collectEvents(provider, [runSqlTool]);

    const starts = events.filter((e) => e.type === 'tool_call_start');
    const deltas = events.filter((e) => e.type === 'tool_call_delta');
    const ends = events.filter((e) => e.type === 'tool_call_end');

    // Exactly one start despite three chunks carrying id+name.
    expect(starts).toHaveLength(1);
    expect(starts[0]).toEqual({ type: 'tool_call_start', id: 'call_qwen_1', name: 'run_sql' });
    // Two deltas — one per subsequent argument fragment.
    expect(deltas).toHaveLength(2);
    expect(deltas.map((d) => (d.type === 'tool_call_delta' ? d.input : ''))).toEqual(['l":"SEL', 'ECT 42"}']);
    // End carries the assembled arguments parsed into an object.
    expect(ends).toHaveLength(1);
    expect(ends[0]).toEqual({
      type: 'tool_call_end',
      id: 'call_qwen_1',
      name: 'run_sql',
      input: { sql: 'SELECT 42' },
    });
  });

  it('drops a pure duplicate tool_call chunk with no new argument fragment', async () => {
    // Belt-and-suspenders: if a Qwen chunk re-announces id+name but carries no
    // new argument bytes, nothing should be emitted for it.
    fetchMock.mockResolvedValue(
      sseResponse([
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_x',
                    type: 'function',
                    function: { name: 'run_sql', arguments: '{"sql":"SELECT 1"}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_x', type: 'function', function: { name: 'run_sql' } },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
      ]),
    );

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://mock', model: 'qwen' });
    const events = await collectEvents(provider, [runSqlTool]);

    expect(events.filter((e) => e.type === 'tool_call_start')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'tool_call_delta')).toHaveLength(0);
    const ends = events.filter((e) => e.type === 'tool_call_end');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toEqual({
      type: 'tool_call_end',
      id: 'call_x',
      name: 'run_sql',
      input: { sql: 'SELECT 1' },
    });
  });

  it('keeps multi-tool-call indexes separate when interleaved', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_a',
                    type: 'function',
                    function: { name: 'run_sql', arguments: '{"sql"' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 1,
                    id: 'call_b',
                    type: 'function',
                    function: { name: 'run_sql', arguments: '{"sql"' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, function: { arguments: ':"A"}' } }],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 1, function: { arguments: ':"B"}' } }],
              },
              finish_reason: null,
            },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
      ]),
    );

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://mock', model: 'qwen' });
    const events = await collectEvents(provider, [runSqlTool]);

    const starts = events.filter((e) => e.type === 'tool_call_start');
    expect(starts).toHaveLength(2);
    expect(starts.map((s) => (s.type === 'tool_call_start' ? s.id : ''))).toEqual(['call_a', 'call_b']);

    const deltasByCall = new Map<string, string[]>();
    for (const e of events) {
      if (e.type === 'tool_call_delta') {
        const existing = deltasByCall.get(e.id) ?? [];
        existing.push(e.input);
        deltasByCall.set(e.id, existing);
      }
    }
    expect(deltasByCall.get('call_a')).toEqual([':"A"}']);
    expect(deltasByCall.get('call_b')).toEqual([':"B"}']);

    const ends = events.filter((e) => e.type === 'tool_call_end');
    // Ends are emitted by flushToolCalls at finish — two of them, one per index.
    expect(ends).toHaveLength(2);
    const endsById = new Map(ends.map((e) => (e.type === 'tool_call_end' ? [e.id, e.input] : ['', {}])));
    expect(endsById.get('call_a')).toEqual({ sql: 'A' });
    expect(endsById.get('call_b')).toEqual({ sql: 'B' });
  });

  it('throws LLMError with reason=output_tokens_exceeded on finish_reason=length', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] },
      ]),
    );

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://mock', model: 'qwen', maxTokens: 128 });

    await expect(async () => {
      for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], [])) {
        // drain
      }
    }).rejects.toMatchObject({
      name: 'LLMError',
      reason: 'output_tokens_exceeded',
    });
  });

  it('surfaces non-2xx responses as retryable LLMError on 5xx', async () => {
    fetchMock.mockResolvedValue(
      new Response('upstream down', { status: 502, statusText: 'Bad Gateway' }),
    );

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://mock', model: 'qwen' });

    await expect(async () => {
      for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], [])) {
        // drain
      }
    }).rejects.toBeInstanceOf(LLMError);
  });
});
