import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider, StreamEvent } from '../provider/types';
import type { ToolContext } from '../tools/router';
import { ToolRouter } from '../tools/router';
import { ViewAgent } from './view-agent';
import type { AgentTask, SubAgentConfig } from './types';

/** Creates a mock provider that yields predefined event sequences. */
function mockProvider(eventSequences: StreamEvent[][]): LLMProvider {
  let callIndex = 0;
  return {
    name: 'mock',
    async *chat() {
      const events = eventSequences[callIndex] ?? [{ type: 'message_end', stopReason: 'end_turn' }];
      callIndex++;
      for (const event of events) {
        yield event;
      }
    },
  };
}

/** Creates a mock tool context with standard stubs. */
function mockToolContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({ tables: [] }),
    executeQuery: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
}

/** Creates a standard view task for testing. */
function createViewTask(overrides?: Partial<AgentTask>): AgentTask {
  return {
    id: 'task_1',
    instruction: 'Create a bar chart showing sales by region',
    context: {
      dataSummary: {
        columns: [
          { name: 'region', type: 'varchar' },
          { name: 'total_sales', type: 'numeric' },
        ],
        rowCount: 5,
        sampleRows: [
          { region: 'North', total_sales: 5000 },
          { region: 'South', total_sales: 3200 },
        ],
      },
    },
    ...overrides,
  };
}

describe('ViewAgent', () => {
  it('has role set to view', () => {
    const agent = new ViewAgent({
      provider: mockProvider([]),
      toolRouter: new ToolRouter(mockToolContext()),
    });

    expect(agent.role).toBe('view');
  });

  it('has create_view and modify_view tools', () => {
    const agent = new ViewAgent({
      provider: mockProvider([]),
      toolRouter: new ToolRouter(mockToolContext()),
    });

    const toolNames = agent.tools.map((t) => t.name);
    expect(toolNames).toContain('create_view');
    expect(toolNames).toContain('modify_view');
    expect(toolNames).toHaveLength(2);
  });

  it('returns success when LLM responds with text only', async () => {
    const agent = new ViewAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'Here is the recommended chart configuration.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(mockToolContext()),
    });

    const result = await agent.run(createViewTask());

    expect(result.role).toBe('view');
    expect(result.success).toBe(true);
    expect(result.explanation).toContain('recommended chart');
  });

  it('executes create_view tool and returns view data', async () => {
    const ctx = mockToolContext();
    const router = new ToolRouter(ctx);

    const agent = new ViewAgent({
      provider: mockProvider([
        // Round 1: LLM calls create_view
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'create_view' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'create_view',
            input: {
              view_spec: {
                title: 'Sales by Region',
                description: 'Bar chart of total sales per region',
                query: { source: 'pg-main', table: 'sales' },
                chart: {
                  type: 'bar-chart',
                  config: { xField: 'region', yFields: ['total_sales'] },
                },
                controls: [],
              },
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Round 2: LLM responds with explanation
        [
          { type: 'text_delta', text: 'I created a bar chart showing sales by region.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: router,
    });

    const result = await agent.run(createViewTask());

    expect(result.role).toBe('view');
    expect(result.success).toBe(true);
    expect(result.explanation).toContain('bar chart');
  });

  it('handles modify_view tool call', async () => {
    const ctx = mockToolContext();
    const router = new ToolRouter(ctx);

    // Pre-create a view in the router's store
    await router.execute('create_view', {
      view_spec: {
        title: 'Original',
        query: { source: 'pg-main', table: 'sales' },
        chart: { type: 'bar-chart', config: {} },
      },
    });

    const agent = new ViewAgent({
      provider: mockProvider([
        // LLM calls modify_view
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'modify_view' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'modify_view',
            input: {
              view_id: 'nonexistent_view',
              patch: { chart: { type: 'time-series-line', config: { xField: 'date', yFields: ['total'] } } },
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // LLM responds after error
        [
          { type: 'text_delta', text: 'The view was not found, but here is my analysis.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: router,
    });

    const task = createViewTask({
      instruction: 'Change the chart to a time series',
      context: { currentView: { viewId: 'nonexistent_view' } },
    });

    const result = await agent.run(task);
    expect(result.success).toBe(true);
    expect(result.role).toBe('view');
  });

  it('returns failure when max tool rounds exceeded', async () => {
    // Provider that always returns tool calls
    const infiniteToolProvider: LLMProvider = {
      name: 'mock',
      async *chat() {
        yield { type: 'tool_call_start' as const, id: 'tc', name: 'create_view' };
        yield {
          type: 'tool_call_end' as const,
          id: 'tc',
          name: 'create_view',
          input: {
            view_spec: {
              query: { source: 'x', table: 'y' },
              chart: { type: 'bar-chart', config: {} },
            },
          },
        };
        yield { type: 'message_end' as const, stopReason: 'tool_use' };
      },
    };

    const agent = new ViewAgent({
      provider: infiniteToolProvider,
      toolRouter: new ToolRouter(mockToolContext()),
      maxToolRounds: 2,
    });

    const result = await agent.run(createViewTask());

    // Should succeed because last round captured the view result
    expect(result.role).toBe('view');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('yields result via execute async iterable', async () => {
    const agent = new ViewAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'Analysis complete.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(mockToolContext()),
    });

    const results: import('./types').SubAgentResult[] = [];
    for await (const result of agent.execute(createViewTask())) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]!.role).toBe('view');
    expect(results[0]!.success).toBe(true);
  });

  it('extracts JSON from code blocks in text response', async () => {
    const agent = new ViewAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'Here is the config:\n```json\n{"chartType": "bar-chart"}\n```' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(mockToolContext()),
    });

    const result = await agent.run(createViewTask());

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ chartType: 'bar-chart' });
  });
});
