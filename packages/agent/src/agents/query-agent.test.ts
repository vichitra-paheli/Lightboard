import { describe, expect, it, vi } from 'vitest';

import type { LLMProvider, StreamEvent } from '../provider/types';
import type { ToolContext } from '../tools/router';
import { ToolRouter } from '../tools/router';

import { QueryAgent } from './query-agent';
import type { AgentTask, SubAgentResult } from './types';

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

/** Creates a mock tool context. */
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
    runSQL: vi.fn().mockResolvedValue({
      rows: [
        { region: 'North', total: 5000 },
        { region: 'South', total: 3200 },
      ],
      rowCount: 2,
    }),
    describeTable: vi.fn().mockResolvedValue({
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'amount', type: 'numeric' },
        { name: 'region', type: 'varchar' },
      ],
    }),
  };
}

/** Creates a standard AgentTask for testing. */
function makeTask(instruction: string): AgentTask {
  return {
    id: 'task_1',
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
  };
}

describe('QueryAgent', () => {
  it('has role set to query and correct tools', () => {
    const agent = new QueryAgent({
      provider: mockProvider([]),
      toolRouter: new ToolRouter(mockToolContext()),
    });

    expect(agent.role).toBe('query');
    const toolNames = agent.tools.map((t) => t.name);
    expect(toolNames).toContain('get_schema');
    expect(toolNames).toContain('describe_table');
    expect(toolNames).toContain('run_sql');
    expect(toolNames).not.toContain('create_view');
  });

  it('returns success on text-only response', async () => {
    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'The schema has an orders table.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(mockToolContext()),
    });

    const result = await agent.run(makeTask('Describe the schema'));

    expect(result.role).toBe('query');
    expect(result.success).toBe(true);
    expect(result.explanation).toContain('orders table');
  });

  it('executes run_sql tool and returns results', async () => {
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
              sql: 'SELECT region, SUM(amount) AS total FROM orders GROUP BY region LIMIT 100',
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Query executed successfully.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(ctx),
    });

    const result = await agent.run(makeTask('Sum amount by region'));

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('rows');
    expect(ctx.runSQL).toHaveBeenCalled();
  });

  it('executes run_sql tool', async () => {
    const ctx = mockToolContext();
    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'run_sql' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'run_sql',
            input: { source_id: 'pg-main', sql: 'SELECT COUNT(*) as count FROM orders' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Found 42 orders.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(ctx),
    });

    const result = await agent.run(makeTask('Count all orders'));

    expect(result.success).toBe(true);
    expect(ctx.runSQL).toHaveBeenCalledWith('pg-main', 'SELECT COUNT(*) as count FROM orders');
  });

  it('handles tool errors and self-corrects', async () => {
    const ctx = mockToolContext();
    (ctx.runSQL as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('column "foo" does not exist'))
      .mockResolvedValueOnce({ rows: [{ count: 10 }], rowCount: 1 });

    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'run_sql' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'run_sql',
            input: { source_id: 'pg-main', sql: 'SELECT foo FROM orders' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'tool_call_start', id: 'tc_2', name: 'run_sql' },
          {
            type: 'tool_call_end',
            id: 'tc_2',
            name: 'run_sql',
            input: { source_id: 'pg-main', sql: 'SELECT region FROM orders' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Fixed and got results.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(ctx),
    });

    const result = await agent.run(makeTask('Get region data'));

    expect(result.success).toBe(true);
    expect(ctx.runSQL).toHaveBeenCalledTimes(2);
  });

  it('returns failure when max rounds exceeded', async () => {
    const infiniteProvider: LLMProvider = {
      name: 'mock',
      async *chat() {
        yield { type: 'tool_call_start' as const, id: 'tc', name: 'get_schema' };
        yield { type: 'tool_call_end' as const, id: 'tc', name: 'get_schema', input: { source_id: 'x' } };
        yield { type: 'message_end' as const, stopReason: 'tool_use' };
      },
    };

    const agent = new QueryAgent({
      provider: infiniteProvider,
      toolRouter: new ToolRouter(mockToolContext()),
      maxToolRounds: 2,
    });

    const result = await agent.run(makeTask('loop forever'));

    expect(result.role).toBe('query');
    expect(result.success).toBe(false);
    expect(result.error).toBe('max_tool_rounds');
  });

  it('yields result via execute async iterable', async () => {
    const agent = new QueryAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'Schema info.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(mockToolContext()),
    });

    const results: SubAgentResult[] = [];
    for await (const result of agent.execute(makeTask('test'))) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]!.role).toBe('query');
    expect(results[0]!.success).toBe(true);
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
      toolRouter: new ToolRouter(mockToolContext()),
    });

    await agent.run(makeTask('test'));

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
      toolRouter: new ToolRouter(mockToolContext()),
    });

    await agent.run(makeTask('test'));

    const toolNames = (capturedTools as Array<{ name: string }>).map((t) => t.name);
    expect(toolNames).toContain('get_schema');
    expect(toolNames).toContain('describe_table');
    expect(toolNames).toContain('run_sql');
    expect(toolNames).not.toContain('create_view');
    expect(toolNames).not.toContain('modify_view');
  });
});
