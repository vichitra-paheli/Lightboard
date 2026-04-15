import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider, StreamEvent } from '../provider/types';
import type { ToolContext } from '../tools/router';
import { ToolRouter } from '../tools/router';
import { insightsTools } from '../tools/insights-tools';
import { InsightsAgent } from './insights-agent';
import type { AgentTask, SubAgentResult } from './types';

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

/** Creates a mock tool context with analyzeData support. */
function mockToolContext(analyzeResult?: Record<string, unknown>): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({ tables: [] }),
    runSQL: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    analyzeData: vi.fn().mockResolvedValue(
      analyzeResult ?? {
        rows: [
          { region: 'North', avg_sales: 5000, stddev: 1200 },
          { region: 'South', avg_sales: 3200, stddev: 800 },
        ],
        rowCount: 2,
      },
    ),
  };
}

/** Creates a standard insights task for testing. */
function createInsightsTask(overrides?: Partial<AgentTask>): AgentTask {
  return {
    id: 'task_1',
    instruction: 'What are the average sales by region and are there any outliers?',
    context: {
      dataSummary: {
        columns: [
          { name: 'region', type: 'varchar' },
          { name: 'sales', type: 'numeric' },
          { name: 'date', type: 'timestamp' },
        ],
        rowCount: 1000,
      },
      tableName: 'sales_data',
    },
    ...overrides,
  };
}

describe('InsightsAgent', () => {
  it('has role set to insights and correct tools', () => {
    const agent = new InsightsAgent({
      provider: mockProvider([]),
      toolRouter: new ToolRouter(mockToolContext(), insightsTools),
    });

    expect(agent.role).toBe('insights');
    const toolNames = agent.tools.map((t) => t.name);
    expect(toolNames).toEqual(['analyze_data']);
  });

  it('executes analyze_data tool and returns analysis result', async () => {
    const ctx = mockToolContext();
    const router = new ToolRouter(ctx, insightsTools);

    const agent = new InsightsAgent({
      provider: mockProvider([
        // Round 1: LLM calls analyze_data
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'analyze_data' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'analyze_data',
            input: {
              sql: 'SELECT region, AVG(sales) AS avg_sales, STDDEV(sales) AS stddev FROM sales_data GROUP BY region',
              description: 'Average sales and standard deviation by region',
            },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // Round 2: LLM responds with analysis
        [
          { type: 'text_delta', text: 'The North region has the highest average sales at 5000.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: router,
    });

    const result = await agent.run(createInsightsTask());

    expect(result.role).toBe('insights');
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('rows');
    expect(result.explanation).toContain('North region');
    expect(ctx.analyzeData).toHaveBeenCalledWith(
      'SELECT region, AVG(sales) AS avg_sales, STDDEV(sales) AS stddev FROM sales_data GROUP BY region',
    );
  });

  it('returns text-only analysis when no tool calls are made', async () => {
    const agent = new InsightsAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'Based on the data summary, the sales appear normally distributed.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(mockToolContext(), insightsTools),
    });

    const result = await agent.run(createInsightsTask());

    expect(result.success).toBe(true);
    expect(result.explanation).toContain('normally distributed');
    expect(result.data).toHaveProperty('analysis');
  });

  it('handles analyze_data unavailable gracefully', async () => {
    // Context without analyzeData
    const ctx: ToolContext = {
      getSchema: vi.fn().mockResolvedValue({ tables: [] }),
      runSQL: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      // No analyzeData
    };
    const router = new ToolRouter(ctx, insightsTools);

    const agent = new InsightsAgent({
      provider: mockProvider([
        [
          { type: 'tool_call_start', id: 'tc_1', name: 'analyze_data' },
          {
            type: 'tool_call_end',
            id: 'tc_1',
            name: 'analyze_data',
            input: { sql: 'SELECT 1' },
          },
          { type: 'message_end', stopReason: 'tool_use' },
        ],
        // LLM recovers after tool error
        [
          { type: 'text_delta', text: 'Analysis tool is not available.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: router,
    });

    const result = await agent.run(createInsightsTask());

    expect(result.success).toBe(true);
    expect(result.role).toBe('insights');
  });

  it('yields result via execute async iterable', async () => {
    const agent = new InsightsAgent({
      provider: mockProvider([
        [
          { type: 'text_delta', text: 'Insights ready.' },
          { type: 'message_end', stopReason: 'end_turn' },
        ],
      ]),
      toolRouter: new ToolRouter(mockToolContext(), insightsTools),
    });

    const results: SubAgentResult[] = [];
    for await (const result of agent.execute(createInsightsTask())) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]!.role).toBe('insights');
    expect(results[0]!.success).toBe(true);
  });

  it('returns failure when max rounds exceeded without final text', async () => {
    // Provider always makes tool calls, never returns text
    const infiniteToolProvider: LLMProvider = {
      name: 'mock',
      async *chat() {
        yield { type: 'tool_call_start' as const, id: 'tc', name: 'analyze_data' };
        yield {
          type: 'tool_call_end' as const,
          id: 'tc',
          name: 'analyze_data',
          input: { sql: 'SELECT COUNT(*) FROM data' },
        };
        yield { type: 'message_end' as const, stopReason: 'tool_use' };
      },
    };

    const agent = new InsightsAgent({
      provider: infiniteToolProvider,
      toolRouter: new ToolRouter(mockToolContext(), insightsTools),
      maxToolRounds: 2,
    });

    const result = await agent.run(createInsightsTask());

    expect(result.role).toBe('insights');
    expect(result.success).toBe(false);
    expect(result.error).toBe('max_tool_rounds');
    // Should still capture the last analysis result
    expect(result.data).toHaveProperty('rows');
  });
});
