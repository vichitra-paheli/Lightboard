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
    executeQuery: vi.fn().mockResolvedValue({
      rows: [{ region: 'North', total: 5000 }],
      rowCount: 1,
    }),
    runSQL: vi.fn().mockResolvedValue({ rows: [{ count: 42 }], rowCount: 1 }),
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
    // Leader calls delegate_query, then sub-agent internally calls execute_query
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
          { type: 'tool_call_start', id: 'sub_1', name: 'execute_query' },
          {
            type: 'tool_call_end',
            id: 'sub_1',
            name: 'execute_query',
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
            input: { view_spec: { query: { source: 'x', table: 'y' }, chart: { type: 'bar-chart', config: {} } } },
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
    (ctx.executeQuery as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));

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
        // Sub-agent tries execute_query, fails
        [
          { type: 'tool_call_start', id: 's1', name: 'execute_query' },
          {
            type: 'tool_call_end',
            id: 's1',
            name: 'execute_query',
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
        // QueryAgent internal: execute_query
        [
          { type: 'tool_call_start', id: 's1', name: 'execute_query' },
          {
            type: 'tool_call_end',
            id: 's1',
            name: 'execute_query',
            input: { source_id: 'pg-main', query_ir: { source: 'pg-main', table: 'orders', select: [{ field: 'region' }], aggregations: [], groupBy: [], orderBy: [], joins: [] } },
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
});
