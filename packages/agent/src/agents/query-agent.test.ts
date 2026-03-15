import { describe, expect, it, vi } from 'vitest';

import type { AgentEvent } from '../agent';
import type { LLMProvider, StreamEvent, ToolContext } from '../index';

import { QueryAgent } from './query-agent';
import type { AgentTask } from './types';

/** Creates a mock provider that yields predefined event sequences. */
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

/** Creates a mock tool context with schema and query capabilities. */
function mockToolContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({
      tables: [
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'integer' },
            { name: 'amount', type: 'numeric' },
            { name: 'region', type: 'varchar' },
          ],
        },
      ],
    }),
    executeQuery: vi.fn().mockResolvedValue({
      rows: [
        { region: 'North', total: 5000 },
        { region: 'South', total: 3200 },
      ],
      rowCount: 2,
    }),
    runSQL: vi.fn().mockResolvedValue({
      rows: [{ count: 42 }],
      rowCount: 1,
    }),
  };
}

/** Collects all AgentEvents from the query agent's chat generator. */
async function collectEvents(
  agent: QueryAgent,
  task: AgentTask,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of agent.chat(task)) {
    events.push(event);
  }
  return events;
}

/** Creates a standard AgentTask for testing. */
function makeTask(instruction: string): AgentTask {
  return {
    instruction,
    context: {
      dataSources: [
        {
          id: 'pg-main',
          name: 'Main DB',
          type: 'postgres',
          cachedSchema: {
            tables: [
              {
                name: 'orders',
                schema: 'public',
                columns: [
                  { name: 'id', type: 'integer', nullable: false, primaryKey: true },
                  { name: 'amount', type: 'numeric', nullable: false, primaryKey: false },
                  { name: 'region', type: 'varchar', nullable: true, primaryKey: false },
                ],
              },
            ],
          },
        },
      ],
    },
    conversationId: 'test-conv-1',
  };
}

describe('QueryAgent', () => {
  it('implements SubAgent interface with correct role', () => {
    const agent = new QueryAgent({
      provider: mockProvider([]),
      toolContext: mockToolContext(),
    });

    expect(agent.role).toBe('query');
    expect(agent.id).toMatch(/^query-agent-/);
  });

  it('streams text response without tool calls', async () => {
    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'The schema has an orders table.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
    });

    const events = await collectEvents(agent, makeTask('Describe the schema'));

    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(1);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('executes execute_query tool and returns results', async () => {
    const ctx = mockToolContext();
    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'execute_query' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'execute_query',
            input: {
              source_id: 'pg-main',
              query_ir: {
                source: 'pg-main',
                table: 'orders',
                select: [{ field: 'region' }],
                aggregations: [{ function: 'sum', field: { field: 'amount' }, alias: 'total' }],
                groupBy: [{ field: 'region' }],
                orderBy: [],
                joins: [],
                limit: 100,
              },
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Query executed.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: ctx,
    });

    const events = await collectEvents(agent, makeTask('Sum amount by region'));

    expect(events.some((e) => e.type === 'tool_start')).toBe(true);
    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd).toBeDefined();
    expect(toolEnd.name).toBe('execute_query');
    expect(toolEnd.isError).toBe(false);
    expect(ctx.executeQuery).toHaveBeenCalled();
  });

  it('executes run_sql tool for complex queries', async () => {
    const ctx = mockToolContext();
    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'run_sql' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'run_sql',
            input: {
              source_id: 'pg-main',
              sql: 'SELECT COUNT(*) as count FROM orders',
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Found 42 orders.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: ctx,
    });

    const events = await collectEvents(agent, makeTask('Count all orders'));

    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd.name).toBe('run_sql');
    expect(toolEnd.isError).toBe(false);
    expect(ctx.runSQL).toHaveBeenCalledWith('pg-main', 'SELECT COUNT(*) as count FROM orders');
  });

  it('rejects tools not in the query tool set', async () => {
    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'create_view' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'create_view',
            input: { view_spec: { query: {}, chart: { type: 'bar', config: {} } } },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Sorry, I cannot create views.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
    });

    const events = await collectEvents(agent, makeTask('Create a chart'));

    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.result).toContain('not available');
  });

  it('handles tool errors and self-corrects', async () => {
    const ctx = mockToolContext();
    (ctx.executeQuery as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('column "foo" does not exist'))
      .mockResolvedValueOnce({ rows: [{ count: 10 }], rowCount: 1 });

    const agent = new QueryAgent({
      provider: mockProvider([
        // First attempt: query fails
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'execute_query' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'execute_query',
            input: { source_id: 'pg-main', query_ir: { source: 'pg-main', table: 'orders', select: [{ field: 'foo' }], aggregations: [], groupBy: [], orderBy: [], joins: [] } },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Second attempt: agent fixes query
        [
          { type: 'tool_call_start', id: 'tc_2', name: 'execute_query' },
          {
            type: 'tool_call_end',
            id: 'tc_2',
            name: 'execute_query',
            input: { source_id: 'pg-main', query_ir: { source: 'pg-main', table: 'orders', select: [{ field: 'region' }], aggregations: [], groupBy: [], orderBy: [], joins: [] } },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Final response
        [
          { type: 'text_delta', text: 'Fixed and got results.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: ctx,
    });

    const events = await collectEvents(agent, makeTask('Get region data'));

    const toolEnds = events.filter((e) => e.type === 'tool_end') as Array<Extract<AgentEvent, { type: 'tool_end' }>>;
    expect(toolEnds).toHaveLength(2);
    expect(toolEnds[0]!.isError).toBe(true);
    expect(toolEnds[1]!.isError).toBe(false);
  });

  it('stops after maxRounds', async () => {
    const infiniteProvider: LLMProvider = {
      name: 'mock',
      async *chat() {
        yield { type: 'tool_call_start' as const, id: 'tc', name: 'get_schema' };
        yield {
          type: 'tool_call_end' as const,
          id: 'tc',
          name: 'get_schema',
          input: { source_id: 'x' },
        };
        yield { type: 'message_end' as const, stopReason: 'tool_use' };
      },
    };

    const agent = new QueryAgent({
      provider: infiniteProvider,
      toolContext: mockToolContext(),
      maxRounds: 2,
    });

    const events = await collectEvents(agent, makeTask('loop forever'));

    const done = events.find((e) => e.type === 'done') as Extract<AgentEvent, { type: 'done' }>;
    expect(done).toBeDefined();
  });

  it('run() returns structured SubAgentResult', async () => {
    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'execute_query' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'execute_query',
            input: {
              source_id: 'pg-main',
              query_ir: { source: 'pg-main', table: 'orders', select: [{ field: 'region' }], aggregations: [], groupBy: [], orderBy: [], joins: [] },
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Done.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
    });

    const result = await agent.run(makeTask('Get regions'));

    expect(result.agentId).toMatch(/^query-agent-/);
    expect(result.role).toBe('query');
    expect(result.success).toBe(true);
    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(result.toolCalls[0]!.name).toBe('execute_query');
  });

  it('builds system prompt with schema context', async () => {
    let capturedSystem: string | undefined;

    const captureProvider: LLMProvider = {
      name: 'mock',
      async *chat(_messages, _tools, options) {
        capturedSystem = options?.system;
        yield { type: 'text_delta' as const, text: 'ok' };
        yield { type: 'message_end' as const, stopReason: 'end_turn' };
      },
    };

    const agent = new QueryAgent({
      provider: captureProvider,
      toolContext: mockToolContext(),
    });

    await collectEvents(agent, makeTask('test'));

    expect(capturedSystem).toBeDefined();
    expect(capturedSystem).toContain('Query Agent');
    expect(capturedSystem).toContain('orders');
    expect(capturedSystem).toContain('pg-main');
  });

  it('only passes query tools to the LLM', async () => {
    let capturedTools: unknown;

    const captureProvider: LLMProvider = {
      name: 'mock',
      async *chat(_messages, tools) {
        capturedTools = tools;
        yield { type: 'text_delta' as const, text: 'ok' };
        yield { type: 'message_end' as const, stopReason: 'end_turn' };
      },
    };

    const agent = new QueryAgent({
      provider: captureProvider,
      toolContext: mockToolContext(),
    });

    await collectEvents(agent, makeTask('test'));

    const toolNames = (capturedTools as Array<{ name: string }>).map((t) => t.name);
    expect(toolNames).toContain('get_schema');
    expect(toolNames).toContain('execute_query');
    expect(toolNames).toContain('run_sql');
    expect(toolNames).not.toContain('create_view');
    expect(toolNames).not.toContain('modify_view');
  });
});
