import { describe, expect, it } from 'vitest';
import type { MessagePart } from '../chat-message';
import {
  createReducer,
  createReducerContext,
  parseSSEJson,
  reduceParts,
  type SSEEventShape,
} from '../sse-reducer';

/**
 * Run a sequence of events through the pure reducer and return the final
 * parts[]. Each test expresses an event sequence as a fixture so the
 * temporal-ordering contract is readable at a glance.
 */
function run(events: SSEEventShape[]): MessagePart[] {
  let parts: MessagePart[] = [];
  let ctx = createReducerContext();
  for (const ev of events) {
    const next = reduceParts(parts, ev, ctx);
    parts = next.parts;
    ctx = next.ctx;
  }
  return parts;
}

describe('reduceParts', () => {
  // Fixture 1 — the load-bearing one. The whole point of PR 5 is that this
  // sequence produces five separate parts. Under the legacy model the two
  // text chunks would have merged into one and the two tool calls would
  // have been siblings in a parallel array.
  it('Fixture 1: text → tool → text → tool → text stays as five ordered parts', () => {
    const parts = run([
      { type: 'text', text: 'First, let me look at the schema.' },
      { type: 'tool_start', name: 'get_schema' },
      { type: 'tool_end', name: 'get_schema', result: '{}', durationMs: 40 },
      { type: 'text', text: 'Now running the query.' },
      { type: 'tool_start', name: 'run_sql' },
      {
        type: 'tool_end',
        name: 'run_sql',
        result: '{"rows":[]}',
        durationMs: 120,
      },
      { type: 'text', text: 'Done.' },
    ]);

    expect(parts.map((p) => p.kind)).toEqual([
      'text',
      'tool_call',
      'text',
      'tool_call',
      'text',
    ]);
    expect((parts[0] as { text: string }).text).toBe(
      'First, let me look at the schema.',
    );
    expect((parts[2] as { text: string }).text).toBe('Now running the query.');
    expect((parts[4] as { text: string }).text).toBe('Done.');
    expect(parts[1]).toMatchObject({
      kind: 'tool_call',
      name: 'get_schema',
      status: 'done',
      durationMs: 40,
    });
    expect(parts[3]).toMatchObject({
      kind: 'tool_call',
      name: 'run_sql',
      status: 'done',
      durationMs: 120,
    });
  });

  it('Fixture 2: multiple consecutive text deltas merge into one part', () => {
    const parts = run([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'there, ' },
      { type: 'text', text: 'friend.' },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      kind: 'text',
      text: 'Hello there, friend.',
    });
  });

  it('Fixture 3: transient status is dropped when text arrives', () => {
    const parts = run([
      { type: 'status', text: 'looking up schema' },
      { type: 'text', text: 'Here we go.' },
    ]);
    // Status should be gone — only the text survives.
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ kind: 'text', text: 'Here we go.' });
  });

  it('Fixture 3b: consecutive status events replace rather than stack', () => {
    const parts = run([
      { type: 'status', text: 'thinking' },
      { type: 'status', text: 'querying' },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      kind: 'status',
      text: 'querying',
      transient: true,
    });
  });

  it('Fixture 4: agent_start stamps nested tool calls with parentAgent', () => {
    const parts = run([
      { type: 'agent_start', agent: 'query', task: 'fetch top batters' },
      { type: 'tool_start', name: 'run_sql', input: { q: 'SELECT 1' } },
      {
        type: 'tool_end',
        name: 'run_sql',
        result: '{"rows":[]}',
        durationMs: 50,
      },
      {
        type: 'agent_end',
        agent: 'query',
        summary: 'Retrieved 10 batters.',
      },
    ]);

    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({
      kind: 'agent_delegation',
      agent: 'query',
      status: 'done',
      summary: 'Retrieved 10 batters.',
      task: 'fetch top batters',
    });
    expect(parts[1]).toMatchObject({
      kind: 'tool_call',
      name: 'run_sql',
      status: 'done',
      parentAgent: 'query',
    });
  });

  it('Fixture 5: abort flips every running tool and delegation to aborted', () => {
    const parts = run([
      { type: 'agent_start', agent: 'query' },
      { type: 'tool_start', name: 'run_sql' },
      { type: 'tool_start', name: 'describe_table' },
      { type: 'abort' },
    ]);

    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatchObject({
      kind: 'agent_delegation',
      status: 'aborted',
    });
    expect(parts[1]).toMatchObject({
      kind: 'tool_call',
      name: 'run_sql',
      status: 'aborted',
    });
    expect(parts[2]).toMatchObject({
      kind: 'tool_call',
      name: 'describe_table',
      status: 'aborted',
    });
  });

  it('Fixture 6: view_created with HtmlView produces a view part with data: null', () => {
    const htmlView = {
      title: 'T',
      description: 'D',
      sql: 'SELECT 1',
      html: '<html/>',
    };
    const parts = run([
      { type: 'view_created', viewSpec: htmlView },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      kind: 'view',
      view: htmlView,
      data: null,
    });
  });

  it('Fixture 7: view_created with a legacy ViewSpec picks up rows from prior run_sql', () => {
    // A ViewSpec is anything without an `html` property. Keep it minimal —
    // the reducer doesn't care about the full spec contents.
    const viewSpec = { query: { source: 'ds1' } } as unknown as {
      query: { source: string };
    };
    const rows = [{ a: 1 }, { a: 2 }];
    const parts = run([
      { type: 'tool_start', name: 'run_sql' },
      {
        type: 'tool_end',
        name: 'run_sql',
        result: JSON.stringify({ rows }),
        durationMs: 25,
      },
      { type: 'view_created', viewSpec: viewSpec as never },
    ]);

    // Parts: [tool_call(done), view]
    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({ kind: 'view', data: rows });
  });

  it('Fixture 8: realistic 20-event stream produces interleaved parts in order', () => {
    // A full turn: schema → text → query → viz → text → suggestions.
    const events: SSEEventShape[] = [
      { type: 'thinking', text: 'Planning…' },
      { type: 'text', text: 'I will first introspect the schema.' },
      { type: 'tool_start', name: 'get_schema' },
      {
        type: 'tool_end',
        name: 'get_schema',
        result: '{"tables":[]}',
        durationMs: 42,
      },
      { type: 'text', text: 'Now checking the ball_by_ball table.' },
      { type: 'tool_start', name: 'describe_table' },
      {
        type: 'tool_end',
        name: 'describe_table',
        result: '{"columns":[]}',
        durationMs: 22,
      },
      { type: 'text', text: 'Running the query for top batters.' },
      { type: 'agent_start', agent: 'query', task: 'top batters' },
      { type: 'tool_start', name: 'run_sql' },
      {
        type: 'tool_end',
        name: 'run_sql',
        result: '{"rows":[{"b":"A"}]}',
        durationMs: 310,
      },
      { type: 'agent_end', agent: 'query', summary: 'Got 10 rows.' },
      { type: 'text', text: 'Building the chart now.' },
      { type: 'tool_start', name: 'create_view' },
      {
        type: 'tool_end',
        name: 'create_view',
        result: '{}',
        durationMs: 80,
      },
      {
        type: 'view_created',
        viewSpec: {
          title: 'Top batters',
          description: '',
          sql: 'SELECT 1',
          html: '<html/>',
        },
      },
      { type: 'text', text: 'Here are the top 10.' },
      { type: 'done' },
    ];

    const parts = run(events);
    const kinds = parts.map((p) => p.kind);
    expect(kinds).toEqual([
      'thinking',
      'text',
      'tool_call', // get_schema
      'text',
      'tool_call', // describe_table
      'text',
      'agent_delegation',
      'tool_call', // run_sql, parented to query agent
      'text',
      'tool_call', // create_view
      'view',
      'text',
    ]);

    // Tool call nested inside the query agent gets stamped.
    const nestedTool = parts[7] as Extract<MessagePart, { kind: 'tool_call' }>;
    expect(nestedTool.parentAgent).toBe('query');
    // Tool calls outside the delegation should not be stamped.
    const getSchema = parts[2] as Extract<MessagePart, { kind: 'tool_call' }>;
    expect(getSchema.parentAgent).toBeUndefined();
    // Delegation closes as `done`.
    expect(parts[6]).toMatchObject({
      kind: 'agent_delegation',
      status: 'done',
    });
  });

  it('text arriving after a tool_call does not merge with the text before the tool', () => {
    // This is the specific merge-prevention contract. Two text events
    // separated by a tool call stay as two text parts.
    const parts = run([
      { type: 'text', text: 'Before' },
      { type: 'tool_start', name: 'run_sql' },
      { type: 'tool_end', name: 'run_sql' },
      { type: 'text', text: 'After' },
    ]);
    const texts = parts.filter((p) => p.kind === 'text') as Extract<
      MessagePart,
      { kind: 'text' }
    >[];
    expect(texts).toHaveLength(2);
    expect(texts[0]?.text).toBe('Before');
    expect(texts[1]?.text).toBe('After');
  });
});

describe('createReducer', () => {
  it('abort() flips running parts to aborted and clears the stack', () => {
    const reducer = createReducer();
    let parts: MessagePart[] = [];
    parts = reducer.apply({ type: 'agent_start', agent: 'query' }, parts);
    parts = reducer.apply({ type: 'tool_start', name: 'run_sql' }, parts);
    parts = reducer.abort(parts);

    expect(parts.every((p) => !('status' in p) || p.status !== 'running')).toBe(
      true,
    );
  });

  it('reuses tool start times across apply() calls to derive duration', () => {
    const reducer = createReducer();
    let parts: MessagePart[] = [];
    parts = reducer.apply({ type: 'tool_start', name: 'run_sql' }, parts);
    // Don't provide durationMs — reducer should compute it.
    parts = reducer.apply({ type: 'tool_end', name: 'run_sql' }, parts);
    const tool = parts[0] as Extract<MessagePart, { kind: 'tool_call' }>;
    // Derived duration is a non-negative number. Under fake-fast execution
    // it may be 0, so we only assert the field exists and is >= 0.
    expect(typeof tool.durationMs).toBe('number');
    expect(tool.durationMs!).toBeGreaterThanOrEqual(0);
  });
});

describe('parseSSEJson', () => {
  it('parses well-formed events into typed shapes', () => {
    expect(parseSSEJson('text', '{"text":"hi"}')).toEqual({
      type: 'text',
      text: 'hi',
    });
    expect(parseSSEJson('tool_start', '{"name":"run_sql"}')).toEqual({
      type: 'tool_start',
      name: 'run_sql',
    });
    expect(
      parseSSEJson(
        'tool_end',
        '{"name":"run_sql","result":"{}","durationMs":40}',
      ),
    ).toEqual({
      type: 'tool_end',
      name: 'run_sql',
      result: '{}',
      durationMs: 40,
    });
    expect(parseSSEJson('done', '{}')).toEqual({ type: 'done' });
  });

  it('returns null for malformed JSON and unknown events', () => {
    expect(parseSSEJson('text', 'not json')).toBeNull();
    expect(parseSSEJson('mystery', '{}')).toBeNull();
    // Missing required fields.
    expect(parseSSEJson('text', '{"notText":1}')).toBeNull();
    expect(parseSSEJson('tool_start', '{}')).toBeNull();
  });
});
