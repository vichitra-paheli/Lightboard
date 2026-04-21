import { describe, expect, it, vi } from 'vitest';

import type { AgentEvent } from '../agent';
import type { LLMProvider, StreamEvent } from '../provider/types';
import type { ToolContext } from '../tools/router';
import { ScratchpadManager } from '../scratchpad/manager';

import { LeaderAgent } from './leader';

/**
 * Creates a mock provider that yields predefined event sequences.
 * Each call to chat() returns the next sequence in the array.
 */
function mockProvider(eventSequences: StreamEvent[][]): LLMProvider {
  let callIndex = 0;
  return {
    name: 'mock',
    async *chat() {
      const events = eventSequences[callIndex] ?? [
        { type: 'message_end' as const, stopReason: 'end_turn' },
      ];
      callIndex++;
      for (const event of events) {
        yield event;
      }
    },
  };
}

/** Creates a mock tool context. */
function mockToolContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({
      tables: [{ name: 'orders', columns: [{ name: 'id', type: 'integer' }] }],
    }),
    runSQL: vi.fn().mockResolvedValue({
      rows: [{ region: 'North', total: 5000 }],
      rowCount: 1,
    }),
    analyzeData: vi.fn().mockResolvedValue({
      rows: [{ avg_sales: 5000, stddev: 1200 }],
      rowCount: 1,
    }),
  };
}

/** Collect all events from a leader chat call. */
async function collectEvents(
  leader: LeaderAgent,
  message: string,
  conversationId = 'test-conv',
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of leader.chat(message, conversationId)) {
    events.push(event);
  }
  return events;
}

describe('LeaderAgent', () => {
  it('streams text response without delegations', async () => {
    const leader = new LeaderAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'Hello! How can I help?' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [{ id: 'pg-main', name: 'Main DB', type: 'postgres' }],
    });

    const events = await collectEvents(leader, 'Hi');

    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(1);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('delegates to QueryAgent and emits agent_start/agent_end', async () => {
    // Leader calls delegate_query, then sub-agent internally calls run_sql
    const leader = new LeaderAgent({
      provider: mockProvider([
        // Round 1: Leader calls delegate_query
        [
          { type: 'text_delta', text: 'Let me query that for you.' },
          { type: 'tool_call_start', id: 'tc_1', name: 'delegate_query' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'delegate_query',
            input: {
              instruction: 'Get total sales by region',
              source_id: 'pg-main',
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Sub-agent's internal LLM call (QueryAgent uses same provider)
        [
          { type: 'tool_call_start', id: 'sub_1', name: 'run_sql' },
          {
            type: 'tool_call_end',
            id: 'sub_1',
            name: 'run_sql',
            input: {
              source_id: 'pg-main',
              query_ir: { source: 'pg-main', table: 'orders', select: [{ field: 'region' }], aggregations: [], groupBy: [], orderBy: [], joins: [] },
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Sub-agent finishes
        [
          { type: 'text_delta', text: 'Query done.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
        // Round 2: Leader summarizes
        [
          { type: 'text_delta', text: 'Here are the results.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [
        {
          id: 'pg-main',
          name: 'Main DB',
          type: 'postgres',
          cachedSchema: {
            tables: [{ name: 'orders', schema: 'public', columns: [{ name: 'region', type: 'varchar', nullable: false, primaryKey: false }] }],
          },
        },
      ],
    });

    const events = await collectEvents(leader, 'Show me sales by region');

    const agentStarts = events.filter((e) => e.type === 'agent_start');
    const agentEnds = events.filter((e) => e.type === 'agent_end');

    expect(agentStarts).toHaveLength(1);
    expect((agentStarts[0] as Extract<AgentEvent, { type: 'agent_start' }>).agent).toBe('query');
    expect(agentEnds).toHaveLength(1);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('delegates to ViewAgent', async () => {
    const leader = new LeaderAgent({
      provider: mockProvider([
        // Leader calls delegate_view
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'delegate_view' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'delegate_view',
            input: {
              instruction: 'Create a bar chart',
              data_summary: { columns: [{ name: 'region', type: 'varchar' }], rowCount: 5 },
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // ViewAgent internal calls
        [
          { type: 'tool_call_start', id: 'v1', name: 'create_view' },
          {
            type: 'tool_call_end',
            id: 'v1',
            name: 'create_view',
            input: { title: 'Sales Chart', sql: 'SELECT * FROM orders', html: '<html><body>chart</body></html>' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'View created.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
        // Leader responds
        [
          { type: 'text_delta', text: 'Here is your chart.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
    });

    const events = await collectEvents(leader, 'Make a bar chart');

    const agentStarts = events.filter((e) => e.type === 'agent_start') as Array<Extract<AgentEvent, { type: 'agent_start' }>>;
    expect(agentStarts).toHaveLength(1);
    expect(agentStarts[0]!.agent).toBe('view');
  });

  it('delegates to InsightsAgent', async () => {
    const leader = new LeaderAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'delegate_insights' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'delegate_insights',
            input: { instruction: 'Find outliers', table_name: 'sales_data' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // InsightsAgent responds with text only
        [
          { type: 'text_delta', text: 'The data looks normally distributed.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
        // Leader summarizes
        [
          { type: 'text_delta', text: 'No outliers found.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
    });

    const events = await collectEvents(leader, 'Any outliers?');

    const agentStarts = events.filter((e) => e.type === 'agent_start') as Array<Extract<AgentEvent, { type: 'agent_start' }>>;
    expect(agentStarts).toHaveLength(1);
    expect(agentStarts[0]!.agent).toBe('insights');
  });

  it('load_scratchpad returns summary not raw data', async () => {
    const scratchpadManager = new ScratchpadManager({ cleanupIntervalMs: 0 });
    // Pre-populate scratchpad
    const pad = scratchpadManager.getOrCreate('test-conv');
    await pad.saveTable('my_data', [{ a: 1 }, { a: 2 }, { a: 3 }], 'Test data');

    const leader = new LeaderAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'load_scratchpad' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'load_scratchpad',
            input: { table_name: 'my_data' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Found 3 rows.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
      scratchpadManager,
    });

    const events = await collectEvents(leader, 'Show me my_data');

    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd).toBeDefined();
    expect(toolEnd.isError).toBe(false);

    const result = JSON.parse(toolEnd.result);
    expect(result.rowCount).toBe(3);
    expect(result.sampleRows).toBeDefined();
    expect(result.columns).toBeDefined();

    await scratchpadManager.destroyAll();
  });

  it('handles sub-agent errors gracefully', async () => {
    const ctx = mockToolContext();
    (ctx.runSQL as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));

    const leader = new LeaderAgent({
      provider: mockProvider([
        // Leader delegates
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'delegate_query' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'delegate_query',
            input: { instruction: 'Get data', source_id: 'broken' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Sub-agent tries run_sql, fails
        [
          { type: 'tool_call_start', id: 's1', name: 'run_sql' },
          {
            type: 'tool_call_end',
            id: 's1',
            name: 'run_sql',
            input: { source_id: 'broken', query_ir: { source: 'broken', table: 'x', select: [], aggregations: [], groupBy: [], orderBy: [], joins: [] } },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Sub-agent gives up
        [
          { type: 'text_delta', text: 'Query failed.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
        // Leader reports error
        [
          { type: 'text_delta', text: 'Sorry, the query failed.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: ctx,
      dataSources: [],
    });

    const events = await collectEvents(leader, 'Query broken db');

    // Should still complete without crashing
    expect(events.some((e) => e.type === 'done')).toBe(true);
    const agentEnds = events.filter((e) => e.type === 'agent_end') as Array<Extract<AgentEvent, { type: 'agent_end' }>>;
    expect(agentEnds).toHaveLength(1);
  });

  it('maintains conversation history', async () => {
    const leader = new LeaderAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'First reply' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
        [
          { type: 'text_delta', text: 'Second reply' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
    });

    await collectEvents(leader, 'first');
    await collectEvents(leader, 'second');

    const history = leader.getHistory();
    expect(history.length).toBe(4); // 2 user + 2 assistant
  });

  it('auto-saves query results to scratchpad and returns summary', async () => {
    const scratchpadManager = new ScratchpadManager({ cleanupIntervalMs: 0 });

    const leader = new LeaderAgent({
      provider: mockProvider([
        // Leader delegates query
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'delegate_query' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'delegate_query',
            input: { instruction: 'Get sales data', source_id: 'pg-main' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // QueryAgent internal: run_sql
        [
          { type: 'tool_call_start', id: 's1', name: 'run_sql' },
          {
            type: 'tool_call_end',
            id: 's1',
            name: 'run_sql',
            input: { source_id: 'pg-main', sql: 'SELECT region FROM orders' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // QueryAgent done
        [
          { type: 'text_delta', text: 'Got data.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
        // Leader summarizes (no save_scratchpad call — auto-saved server-side)
        [
          { type: 'text_delta', text: 'Found the data.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [{ id: 'pg-main', name: 'Main DB', type: 'postgres' }],
      scratchpadManager,
    });

    const events = await collectEvents(leader, 'Get sales data');

    // Verify delegation happened
    expect(events.some((e) => e.type === 'agent_start')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);

    // Verify data was auto-saved to scratchpad
    const scratchpad = scratchpadManager.getOrCreate('test-conv');
    expect(scratchpad.listTables().length).toBeGreaterThan(0);

    // Verify the delegate_query tool result contains a summary, not raw data
    const queryEnd = events.find((e) => e.type === 'tool_end' && e.name === 'delegate_query') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(queryEnd).toBeDefined();
    const result = JSON.parse(queryEnd.result);
    expect(result.scratchpadTable).toBeDefined();
    expect(result.rowCount).toBeDefined();
    expect(result.sampleRows).toBeDefined();
    // Should NOT contain the full rows array
    expect(result.rows).toBeUndefined();

    await scratchpadManager.destroyAll();
  });

  it('handles list_scratchpads tool', async () => {
    const scratchpadManager = new ScratchpadManager({ cleanupIntervalMs: 0 });
    // Pre-populate scratchpad
    const pad = scratchpadManager.getOrCreate('test-conv');
    await pad.saveTable('existing_table', [{ x: 1 }], 'Pre-existing');

    const leader = new LeaderAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'list_scratchpads' },
          { type: 'tool_call_end', id: 'tc_1', name: 'list_scratchpads', input: {} },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Found 1 table.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
      scratchpadManager,
    });

    const events = await collectEvents(leader, 'What tables do I have?');

    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd.isError).toBe(false);
    const tables = JSON.parse(toolEnd.result);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('existing_table');

    await scratchpadManager.destroyAll();
  });

  it('enriches tool_end events with kind, label and durationMs', async () => {
    const scratchpadManager = new ScratchpadManager({ cleanupIntervalMs: 0 });
    const leader = new LeaderAgent({
      provider: mockProvider([
        // Leader calls list_scratchpads — handled synchronously inside the
        // leader so it's the simplest path to assert enrichment on.
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'list_scratchpads' },
          { type: 'tool_call_end', id: 'tc_1', name: 'list_scratchpads', input: {} },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Done.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
      scratchpadManager,
    });

    const events = await collectEvents(leader, 'What tables do I have?');

    const start = events.find(
      (e) => e.type === 'tool_start' && e.name === 'list_scratchpads',
    ) as Extract<AgentEvent, { type: 'tool_start' }> | undefined;
    expect(start).toBeDefined();
    // tool_start carries the kind immediately so the UI can color the row
    // while inputs are still streaming.
    expect(start?.kind).toBe('COMPUTE');

    const end = events.find(
      (e) => e.type === 'tool_end' && e.name === 'list_scratchpads',
    ) as Extract<AgentEvent, { type: 'tool_end' }> | undefined;
    expect(end).toBeDefined();
    expect(end?.kind).toBe('COMPUTE');
    expect(end?.label).toBe('list_scratchpads()');
    expect(typeof end?.durationMs).toBe('number');
    expect((end?.durationMs as number) >= 0).toBe(true);

    await scratchpadManager.destroyAll();
  });

  it('bubbles sub-agent tool events up with parentAgent stamped', async () => {
    // Leader synchronously delegates to QueryAgent. The sub-agent runs
    // run_sql internally; we expect those tool_start/tool_end events to
    // surface on the outer stream tagged with parentAgent='query'.
    const leader = new LeaderAgent({
      provider: mockProvider([
        // Round 1: leader calls delegate_query
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'delegate_query' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'delegate_query',
            input: { instruction: 'Count rows', source_id: 'pg-main' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Sub-agent round 1: run_sql
        [
          { type: 'tool_call_start', id: 'sub_1', name: 'run_sql' },
          {
            type: 'tool_call_end',
            id: 'sub_1',
            name: 'run_sql',
            input: { source_id: 'pg-main', sql: 'SELECT COUNT(*) FROM orders' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Sub-agent round 2: text only
        [
          { type: 'text_delta', text: 'Got it.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
        // Leader round 2: final text
        [
          { type: 'text_delta', text: 'Found the rows.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [{ id: 'pg-main', name: 'Main DB', type: 'postgres' }],
    });

    const events = await collectEvents(leader, 'Count orders');

    const bubbledStart = events.find(
      (e) => e.type === 'tool_start' && e.name === 'run_sql',
    ) as Extract<AgentEvent, { type: 'tool_start' }> | undefined;
    expect(bubbledStart).toBeDefined();
    expect(bubbledStart?.parentAgent).toBe('query');
    expect(bubbledStart?.kind).toBe('QUERY');

    const bubbledEnd = events.find(
      (e) => e.type === 'tool_end' && e.name === 'run_sql',
    ) as Extract<AgentEvent, { type: 'tool_end' }> | undefined;
    expect(bubbledEnd).toBeDefined();
    expect(bubbledEnd?.parentAgent).toBe('query');
    expect(bubbledEnd?.kind).toBe('QUERY');
    // Label pulled from formatStart — should summarize the SQL body.
    expect(bubbledEnd?.label).toMatch(/^sql\(SELECT COUNT/);
    expect(typeof bubbledEnd?.durationMs).toBe('number');
    // The mocked runSQL returns { rows: [...], rowCount: 1 } → "→ 1 rows".
    expect(bubbledEnd?.resultSummary).toBe('→ 1 rows');

    // The parent delegate_query tool_end is emitted after the bubble-up
    // events so the trace renders children before their parent's `done`.
    const startIdx = events.findIndex((e) => e.type === 'tool_start' && e.name === 'run_sql');
    const endIdx = events.findIndex((e) => e.type === 'tool_end' && e.name === 'run_sql');
    const parentEndIdx = events.findIndex(
      (e) => e.type === 'tool_end' && e.name === 'delegate_query',
    );
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    expect(parentEndIdx).toBeGreaterThan(endIdx);
  });

  it('resets conversation', async () => {
    const leader = new LeaderAgent({
      provider: mockProvider([
        [{ type: 'text_delta', text: 'Hi' }, { type: 'message_end', stopReason: 'end_turn' }],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
    });

    await collectEvents(leader, 'hello');
    expect(leader.getHistory().length).toBeGreaterThan(0);

    leader.reset();
    expect(leader.getHistory()).toHaveLength(0);
  });

  describe('narrate_summary', () => {
    /** A canonical 3-bullet narrate_summary payload used across these tests. */
    const validNarratePayload = {
      bullets: [
        {
          rank: 1,
          headline: 'North region',
          value: '+12.4%',
          body: 'North led Q4 growth, well ahead of the pack.',
        },
        {
          rank: 2,
          headline: 'East region',
          value: '+4.1%',
          body: 'East held steady with a modest uptick.',
        },
        {
          rank: 3,
          headline: 'West region',
          body: 'West was flat within normal noise.',
        },
      ],
      caveat: 'Sample size of 40 stores; treat with caution.',
    };

    it('ends the turn with end_turn and enriches tool_end with NARRATE kind', async () => {
      const leader = new LeaderAgent({
        provider: mockProvider([
          [
            { type: 'tool_call_start', id: 'nt_1', name: 'narrate_summary' },
            {
              type: 'tool_call_end',
              id: 'nt_1',
              name: 'narrate_summary',
              input: validNarratePayload,
            },
            { type: 'message_end', stopReason: 'tool_use' },
          ],
          // This round should never execute — the leader short-circuits after
          // narrate. If it does run, the fixture stops it harmlessly.
          [
            { type: 'text_delta', text: 'extra chatter that should never appear' },
            { type: 'message_end', stopReason: 'end_turn' },
          ],
        ]),
        toolContext: mockToolContext(),
        dataSources: [],
      });

      const events = await collectEvents(leader, 'Summarize the regional breakdown');

      const end = events.find(
        (e) => e.type === 'tool_end' && e.name === 'narrate_summary',
      ) as Extract<AgentEvent, { type: 'tool_end' }> | undefined;
      expect(end).toBeDefined();
      expect(end?.isError).toBe(false);
      expect(end?.kind).toBe('NARRATE');
      expect(typeof end?.durationMs).toBe('number');

      // Result is a valid JSON blob carrying the normalized bullets + caveat.
      const parsed = JSON.parse(end!.result);
      expect(Array.isArray(parsed.bullets)).toBe(true);
      expect(parsed.bullets).toHaveLength(3);
      expect(parsed.bullets.map((b: { rank: number }) => b.rank)).toEqual([1, 2, 3]);
      expect(parsed.caveat).toBe('Sample size of 40 stores; treat with caution.');
      expect(parsed.rendered).toBe(true);

      // Short-circuit must fire: the turn ends with end_turn after narrate,
      // and no extra text chunk from the unreached fixture round leaks out.
      const done = events.find(
        (e) => e.type === 'done',
      ) as Extract<AgentEvent, { type: 'done' }> | undefined;
      expect(done?.stopReason).toBe('end_turn');

      const leakedText = events.find(
        (e) => e.type === 'text' && e.text.includes('extra chatter'),
      );
      expect(leakedText).toBeUndefined();
    });

    it('reports a validation error when the payload has the wrong bullet count', async () => {
      const leader = new LeaderAgent({
        provider: mockProvider([
          [
            { type: 'tool_call_start', id: 'nt_1', name: 'narrate_summary' },
            {
              type: 'tool_call_end',
              id: 'nt_1',
              name: 'narrate_summary',
              input: { bullets: [{ rank: 1, headline: 'only one', body: 'oops' }] },
            },
            { type: 'message_end', stopReason: 'tool_use' },
          ],
          [
            { type: 'text_delta', text: 'Let me retry.' },
            { type: 'message_end', stopReason: 'end_turn' },
          ],
        ]),
        toolContext: mockToolContext(),
        dataSources: [],
      });

      const events = await collectEvents(leader, 'summarize');
      const end = events.find(
        (e) => e.type === 'tool_end' && e.name === 'narrate_summary',
      ) as Extract<AgentEvent, { type: 'tool_end' }> | undefined;
      expect(end?.isError).toBe(true);
      expect(end?.result).toMatch(/expected exactly 3 bullets/);
    });

    it('reports a validation error when two bullets share a rank', async () => {
      const leader = new LeaderAgent({
        provider: mockProvider([
          [
            { type: 'tool_call_start', id: 'nt_1', name: 'narrate_summary' },
            {
              type: 'tool_call_end',
              id: 'nt_1',
              name: 'narrate_summary',
              input: {
                bullets: [
                  { rank: 1, headline: 'a', body: 'A' },
                  { rank: 1, headline: 'b', body: 'B' },
                  { rank: 2, headline: 'c', body: 'C' },
                ],
              },
            },
            { type: 'message_end', stopReason: 'tool_use' },
          ],
          [
            { type: 'text_delta', text: 'Retrying.' },
            { type: 'message_end', stopReason: 'end_turn' },
          ],
        ]),
        toolContext: mockToolContext(),
        dataSources: [],
      });

      const events = await collectEvents(leader, 'summarize');
      const end = events.find(
        (e) => e.type === 'tool_end' && e.name === 'narrate_summary',
      ) as Extract<AgentEvent, { type: 'tool_end' }> | undefined;
      expect(end?.isError).toBe(true);
      expect(end?.result).toMatch(/duplicate rank/);
    });

    it('reports a validation error when a bullet has an empty body', async () => {
      const leader = new LeaderAgent({
        provider: mockProvider([
          [
            { type: 'tool_call_start', id: 'nt_1', name: 'narrate_summary' },
            {
              type: 'tool_call_end',
              id: 'nt_1',
              name: 'narrate_summary',
              input: {
                bullets: [
                  { rank: 1, headline: 'a', body: 'A' },
                  { rank: 2, headline: 'b', body: '   ' },
                  { rank: 3, headline: 'c', body: 'C' },
                ],
              },
            },
            { type: 'message_end', stopReason: 'tool_use' },
          ],
          [
            { type: 'text_delta', text: 'Retrying.' },
            { type: 'message_end', stopReason: 'end_turn' },
          ],
        ]),
        toolContext: mockToolContext(),
        dataSources: [],
      });

      const events = await collectEvents(leader, 'summarize');
      const end = events.find(
        (e) => e.type === 'tool_end' && e.name === 'narrate_summary',
      ) as Extract<AgentEvent, { type: 'tool_end' }> | undefined;
      expect(end?.isError).toBe(true);
      expect(end?.result).toMatch(/empty or missing body/);
    });

    it('continues the leader loop when validation fails (does not short-circuit)', async () => {
      const leader = new LeaderAgent({
        provider: mockProvider([
          [
            { type: 'tool_call_start', id: 'nt_1', name: 'narrate_summary' },
            {
              type: 'tool_call_end',
              id: 'nt_1',
              name: 'narrate_summary',
              input: { bullets: [] },
            },
            { type: 'message_end', stopReason: 'tool_use' },
          ],
          // After the validation error, the leader should get another turn
          // and emit this retry text.
          [
            { type: 'text_delta', text: 'retry landed' },
            { type: 'message_end', stopReason: 'end_turn' },
          ],
        ]),
        toolContext: mockToolContext(),
        dataSources: [],
      });

      const events = await collectEvents(leader, 'summarize');
      const retryText = events.find(
        (e) => e.type === 'text' && e.text === 'retry landed',
      );
      expect(retryText).toBeDefined();
    });
  });

  describe('setPromptOverride', () => {
    it('forwards the override string to the provider in place of buildLeaderPrompt', async () => {
      // Spy provider that records the system prompt it was called with.
      const seenSystem: string[] = [];
      const provider: LLMProvider = {
        name: 'spy',
        async *chat(_messages, _tools, options) {
          seenSystem.push(options?.system ?? '');
          yield { type: 'text_delta', text: 'ok' };
          yield { type: 'message_end', stopReason: 'end_turn' };
        },
      };

      const leader = new LeaderAgent({
        provider,
        toolContext: mockToolContext(),
        dataSources: [{ id: 'pg-main', name: 'Main DB', type: 'postgres' }],
      });

      const override = 'OVERRIDE_PROMPT_FOR_EVAL_HARNESS';
      leader.setPromptOverride(override);
      await collectEvents(leader, 'hi');
      expect(seenSystem).toHaveLength(1);
      expect(seenSystem[0]).toBe(override);

      // Reverting to null restores the default builder output.
      leader.setPromptOverride(null);
      await collectEvents(leader, 'hi again');
      expect(seenSystem).toHaveLength(2);
      expect(seenSystem[1]).not.toBe(override);
      // buildLeaderPrompt starts with a well-known role sentence; sanity-check
      // that we got the real prompt back.
      expect(seenSystem[1]).toContain("Lightboard's data exploration assistant");
    });
  });
});
