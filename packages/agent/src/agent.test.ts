import { describe, expect, it, vi } from 'vitest';
import { Agent, type AgentEvent } from './agent';
import type { LLMProvider, StreamEvent, ToolContext } from './index';

/** Creates a mock provider that yields predefined events. */
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

function mockToolContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({
      tables: [
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'integer' },
            { name: 'created_at', type: 'timestamp' },
            { name: 'amount', type: 'numeric' },
            { name: 'status', type: 'varchar' },
            { name: 'region', type: 'varchar' },
          ],
        },
      ],
    }),
    executeQuery: vi.fn().mockResolvedValue({
      rows: [
        { region: 'North', total: 5000 },
        { region: 'South', total: 3200 },
        { region: 'East', total: 4100 },
      ],
      rowCount: 3,
    }),
  };
}

async function collectEvents(agent: Agent, message: string): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of agent.chat(message)) {
    events.push(event);
  }
  return events;
}

describe('Agent', () => {
  it('streams text response without tool calls', async () => {
    const agent = new Agent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'Hello! ' },
          { type: 'text_delta', text: 'How can I help?' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
    });

    const events = await collectEvents(agent, 'hi');
    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(2);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('executes tool calls and continues', async () => {
    const agent = new Agent({
      provider: mockProvider([
        // Round 1: agent calls get_schema
        [
          { type: 'text_delta', text: 'Let me check the schema.' },
          { type: 'tool_call_start', id: 'tc_1', name: 'get_schema' },
          { type: 'tool_call_end', id: 'tc_1', name: 'get_schema', input: { source_id: 'pg-main' } },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Round 2: agent responds with text
        [
          { type: 'text_delta', text: 'I found the orders table.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [{ id: 'pg-main', name: 'Main DB', type: 'postgres' }],
    });

    const events = await collectEvents(agent, 'Show me the orders data');

    expect(events.some((e) => e.type === 'tool_start')).toBe(true);
    expect(events.some((e) => e.type === 'tool_end')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('handles create_view tool call', async () => {
    const agent = new Agent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'create_view' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'create_view',
            input: {
              view_spec: {
                title: 'Sales by Region',
                query: { source: 'pg-main', table: 'orders' },
                chart: { type: 'bar-chart', config: { xField: 'region', yFields: ['total'] } },
                controls: [
                  { type: 'dropdown', label: 'Status', variable: 'status' },
                ],
              },
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'Here is your chart.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: mockToolContext(),
      dataSources: [{ id: 'pg-main', name: 'Main DB', type: 'postgres' }],
    });

    const events = await collectEvents(agent, 'Show sales by region');
    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd).toBeDefined();
    expect(toolEnd.name).toBe('create_view');
    expect(toolEnd.isError).toBe(false);

    const parsed = JSON.parse(toolEnd.result);
    expect(parsed.viewSpec.chart.type).toBe('bar-chart');
  });

  it('handles tool errors gracefully', async () => {
    const ctx = mockToolContext();
    (ctx.getSchema as any).mockRejectedValue(new Error('Connection refused'));

    const agent = new Agent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'get_schema' },
          { type: 'tool_call_end', id: 'tc_1', name: 'get_schema', input: { source_id: 'broken' } },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        [
          { type: 'text_delta', text: 'The connection failed, let me try again.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolContext: ctx,
      dataSources: [],
    });

    const events = await collectEvents(agent, 'query the broken db');
    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.result).toContain('Connection refused');
  });

  it('stops after max tool rounds', async () => {
    // Provider that always returns tool calls
    const infiniteToolProvider: LLMProvider = {
      name: 'mock',
      async *chat() {
        yield { type: 'tool_call_start' as const, id: 'tc', name: 'get_schema' };
        yield { type: 'tool_call_end' as const, id: 'tc', name: 'get_schema', input: { source_id: 'x' } };
        yield { type: 'message_end' as const, stopReason: 'tool_use' };
      },
    };

    const agent = new Agent({
      provider: infiniteToolProvider,
      toolContext: mockToolContext(),
      dataSources: [],
      maxToolRounds: 3,
    });

    const events = await collectEvents(agent, 'infinite loop');
    const done = events.filter((e) => e.type === 'done');
    expect(done).toHaveLength(1);
    expect((done[0] as Extract<AgentEvent, { type: 'done' }>).stopReason).toBe('max_tool_rounds');
  });

  it('resets conversation', async () => {
    const agent = new Agent({
      provider: mockProvider([
        [{ type: 'text_delta', text: 'Hi' }, { type: 'message_end', stopReason: 'end_turn' }],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
    });

    await collectEvents(agent, 'hello');
    expect(agent.getHistory().length).toBeGreaterThan(0);

    agent.reset();
    expect(agent.getHistory()).toHaveLength(0);
  });

  it('stores conversation history across turns', async () => {
    const agent = new Agent({
      provider: mockProvider([
        [{ type: 'text_delta', text: 'First reply' }, { type: 'message_end', stopReason: 'end_turn' }],
        [{ type: 'text_delta', text: 'Second reply' }, { type: 'message_end', stopReason: 'end_turn' }],
      ]),
      toolContext: mockToolContext(),
      dataSources: [],
    });

    await collectEvents(agent, 'first message');
    await collectEvents(agent, 'second message');

    const history = agent.getHistory();
    expect(history.length).toBe(4); // 2 user + 2 assistant
  });
});
