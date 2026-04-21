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

  it('Fixture 6b: two view_created events for the same logical view replace, not stack', () => {
    // The backend can fire `view_created` more than once per view:
    //   - create_view bubbles up from the view-agent, AND
    //   - delegate_view / await_tasks also re-emit the same viewSpec.
    // The UI must render ONE chart block, with the newest spec winning.
    const firstHtml = {
      title: 'Top batters',
      description: 'draft',
      sql: 'SELECT 1',
      html: '<html>v1</html>',
    };
    const secondHtml = {
      ...firstHtml,
      html: '<html>v2 — tweaked after modify_view</html>',
    };
    const parts = run([
      { type: 'view_created', viewSpec: firstHtml },
      { type: 'view_created', viewSpec: secondHtml },
    ]);

    // Exactly one view part — the second spec replaced the first.
    const views = parts.filter((p) => p.kind === 'view');
    expect(views).toHaveLength(1);
    expect(
      (views[0] as Extract<MessagePart, { kind: 'view' }>).view,
    ).toBe(secondHtml);
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

  // Dispatch + await merge — the editorial log renders ONE row per
  // dispatch_*, no await_tasks row, and the dispatch row picks up the
  // duration + resultSummary from the eventual await resolution.
  describe('dispatch_* + await_tasks merge', () => {
    it('a single dispatch_query + await resolves into one "done" dispatch row with row count', () => {
      const parts = run([
        { type: 'tool_start', name: 'dispatch_query' },
        {
          type: 'tool_end',
          name: 'dispatch_query',
          result: JSON.stringify({
            task_id: 'task_query_1',
            role: 'query',
            status: 'dispatched',
            dispatched_at: 1,
          }),
          durationMs: 0,
        },
        { type: 'tool_start', name: 'await_tasks' },
        {
          type: 'tool_end',
          name: 'await_tasks',
          result: JSON.stringify({
            task_query_1: {
              success: true,
              role: 'query',
              explanation: 'ok',
              data_summary: { rowCount: 412, columns: [], sampleRows: [] },
            },
          }),
          durationMs: 850,
        },
      ]);

      // Exactly one tool_call part (no await_tasks row).
      const toolParts = parts.filter((p) => p.kind === 'tool_call');
      expect(toolParts).toHaveLength(1);
      expect(toolParts[0]).toMatchObject({
        kind: 'tool_call',
        name: 'dispatch_query',
        status: 'done',
        durationMs: 850,
        resultSummary: '→ 412 rows',
        taskId: 'task_query_1',
      });
    });

    it('keeps the dispatch row in running state between dispatch_end and await_end', () => {
      // This is the visual contract: while the task is still off in the
      // background, the user sees a spinner on the dispatch row, NOT a
      // grey-done row with 0ms.
      let parts: MessagePart[] = [];
      let ctx = createReducerContext();
      const steps: SSEEventShape[] = [
        { type: 'tool_start', name: 'dispatch_query' },
        {
          type: 'tool_end',
          name: 'dispatch_query',
          result: JSON.stringify({ task_id: 'task_query_1', role: 'query' }),
          durationMs: 0,
        },
      ];
      for (const ev of steps) {
        const next = reduceParts(parts, ev, ctx);
        parts = next.parts;
        ctx = next.ctx;
      }
      const toolParts = parts.filter((p) => p.kind === 'tool_call');
      expect(toolParts).toHaveLength(1);
      expect(toolParts[0]).toMatchObject({
        kind: 'tool_call',
        name: 'dispatch_query',
        status: 'running',
        taskId: 'task_query_1',
      });
      // No await_tasks row appeared.
      expect(toolParts.every((p) => p.name !== 'await_tasks')).toBe(true);
    });

    it('parallel dispatch_query + dispatch_view merged by a single await resolve each row independently', () => {
      const parts = run([
        { type: 'tool_start', name: 'dispatch_query' },
        {
          type: 'tool_end',
          name: 'dispatch_query',
          result: JSON.stringify({ task_id: 'task_query_1', role: 'query' }),
          durationMs: 0,
        },
        { type: 'tool_start', name: 'dispatch_view' },
        {
          type: 'tool_end',
          name: 'dispatch_view',
          result: JSON.stringify({ task_id: 'task_view_1', role: 'view' }),
          durationMs: 0,
        },
        { type: 'tool_start', name: 'await_tasks' },
        {
          type: 'tool_end',
          name: 'await_tasks',
          result: JSON.stringify({
            task_query_1: {
              success: true,
              role: 'query',
              data_summary: { rowCount: 10, columns: [], sampleRows: [] },
            },
            task_view_1: { success: true, role: 'view' },
          }),
          durationMs: 1200,
        },
      ]);

      const toolParts = parts.filter(
        (p) => p.kind === 'tool_call',
      ) as Extract<MessagePart, { kind: 'tool_call' }>[];
      expect(toolParts).toHaveLength(2);
      expect(toolParts[0]).toMatchObject({
        name: 'dispatch_query',
        status: 'done',
        durationMs: 1200,
        resultSummary: '→ 10 rows',
      });
      expect(toolParts[1]).toMatchObject({
        name: 'dispatch_view',
        status: 'done',
        durationMs: 1200,
        resultSummary: '→ view created',
      });
    });

    it('a failed task inside await marks its dispatch row as error', () => {
      const parts = run([
        { type: 'tool_start', name: 'dispatch_query' },
        {
          type: 'tool_end',
          name: 'dispatch_query',
          result: JSON.stringify({ task_id: 'task_query_1', role: 'query' }),
          durationMs: 0,
        },
        { type: 'tool_start', name: 'await_tasks' },
        {
          type: 'tool_end',
          name: 'await_tasks',
          result: JSON.stringify({
            task_query_1: {
              success: false,
              role: 'query',
              error: 'timeout',
            },
          }),
          durationMs: 30000,
        },
      ]);

      const toolParts = parts.filter((p) => p.kind === 'tool_call');
      expect(toolParts).toHaveLength(1);
      expect(toolParts[0]).toMatchObject({
        kind: 'tool_call',
        name: 'dispatch_query',
        status: 'error',
        durationMs: 30000,
        resultSummary: '→ error',
      });
    });

    it('await with no prior dispatch is a no-op (no parts produced or crashed)', () => {
      const parts = run([
        { type: 'text', text: 'hello' },
        { type: 'tool_start', name: 'await_tasks' },
        {
          type: 'tool_end',
          name: 'await_tasks',
          result: '{}',
          durationMs: 5,
        },
      ]);
      // Text survives, no tool_call rows.
      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ kind: 'text', text: 'hello' });
    });
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

  describe('narrate_ready', () => {
    const sample = JSON.stringify({
      bullets: [
        { rank: 2, headline: 'Second', body: 'mid-pack finding' },
        { rank: 1, headline: 'First', value: '+11.59', body: 'big one' },
        { rank: 3, headline: 'Third', body: 'also-ran' },
      ],
      caveat: 'Sample of 40.',
    });

    it('parses into a typed narrate_ready event with bullets sorted by rank', () => {
      const parsed = parseSSEJson('narrate_ready', sample);
      expect(parsed).not.toBeNull();
      if (parsed?.type !== 'narrate_ready') throw new Error('wrong variant');
      expect(parsed.narration.bullets.map((b) => b.rank)).toEqual([1, 2, 3]);
      expect(parsed.narration.bullets[0]!.value).toBe('+11.59');
      expect(parsed.narration.caveat).toBe('Sample of 40.');
    });

    it('drops payloads where a bullet is missing a required field', () => {
      const bad = JSON.stringify({
        bullets: [
          { rank: 1, body: 'no headline' },
          { rank: 2, headline: 'Second', body: 'ok' },
          { rank: 3, headline: 'Third', body: 'ok' },
        ],
      });
      expect(parseSSEJson('narrate_ready', bad)).toBeNull();
    });

    it('drops payloads where bullets is not an array', () => {
      expect(parseSSEJson('narrate_ready', '{"bullets":42}')).toBeNull();
      expect(parseSSEJson('narrate_ready', '{}')).toBeNull();
    });

    it('omits caveat when the server sent an empty string', () => {
      const payload = JSON.stringify({
        bullets: [
          { rank: 1, headline: 'a', body: 'A' },
          { rank: 2, headline: 'b', body: 'B' },
          { rank: 3, headline: 'c', body: 'C' },
        ],
        caveat: '',
      });
      const parsed = parseSSEJson('narrate_ready', payload);
      expect(parsed?.type).toBe('narrate_ready');
      if (parsed?.type !== 'narrate_ready') throw new Error('wrong variant');
      expect(parsed.narration.caveat).toBeUndefined();
    });

    it('does not mutate parts[] when reduced', () => {
      const before: MessagePart[] = [
        { kind: 'text', text: 'existing text' },
      ];
      const parsed = parseSSEJson('narrate_ready', sample);
      expect(parsed).not.toBeNull();
      const reducer = createReducer();
      const after = reducer.apply(parsed!, before);
      expect(after).toEqual(before);
    });
  });
});
