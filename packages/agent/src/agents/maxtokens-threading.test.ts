import { describe, expect, it, vi } from 'vitest';

import { QueryAgent } from './query-agent';
import { ViewAgent } from './view-agent';
import { InsightsAgent } from './insights-agent';
import { LeaderAgent } from './leader';
import { ToolRouter, type ToolContext } from '../tools/router';
import type { ChatOptions, LLMProvider, StreamEvent, ToolDefinition } from '../provider/types';

/**
 * Each agent must pass `maxTokens` from its config into `ChatOptions` so the
 * user-configured `model_configs.max_tokens` is honored explicitly at the
 * call site — not left to the provider's stored default. The test captures
 * the options a mock provider received and asserts the expected value.
 */

function makeCapturingProvider(): {
  provider: LLMProvider;
  captured: ChatOptions[];
} {
  const captured: ChatOptions[] = [];
  const provider: LLMProvider = {
    name: 'mock',
    async *chat(_msgs, _tools, options?: ChatOptions): AsyncIterable<StreamEvent> {
      captured.push(options ?? {});
      yield { type: 'text_delta', text: 'ok' };
      yield { type: 'message_end', stopReason: 'end_turn' };
    },
  };
  return { provider, captured };
}

function mockToolContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({ tables: [] }),
    runSQL: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, columns: [] }),
    describeTable: vi.fn().mockResolvedValue({ columns: [] }),
    analyzeData: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
}

describe('SubAgents thread maxTokens into ChatOptions', () => {
  it('QueryAgent passes config.maxTokens', async () => {
    const { provider, captured } = makeCapturingProvider();
    const agent = new QueryAgent({
      provider,
      toolRouter: new ToolRouter(mockToolContext()),
      maxToolRounds: 1,
      maxTokens: 1234,
    });
    await agent.run({ id: 't1', instruction: 'hi', context: {} });
    expect(captured[0]?.maxTokens).toBe(1234);
  });

  it('ViewAgent passes config.maxTokens', async () => {
    const { provider, captured } = makeCapturingProvider();
    const agent = new ViewAgent({
      provider,
      toolRouter: new ToolRouter(mockToolContext()),
      maxToolRounds: 1,
      maxTokens: 8888,
    });
    await agent.run({ id: 't1', instruction: 'draw', context: { dataSummary: { columns: [], rowCount: 0, sampleRows: [] } } });
    expect(captured[0]?.maxTokens).toBe(8888);
  });

  it('InsightsAgent passes config.maxTokens', async () => {
    const { provider, captured } = makeCapturingProvider();
    const agent = new InsightsAgent({
      provider,
      toolRouter: new ToolRouter(mockToolContext()),
      maxToolRounds: 1,
      maxTokens: 7,
    });
    await agent.run({ id: 't1', instruction: 'summarize', context: { tableName: 'query_1' } });
    expect(captured[0]?.maxTokens).toBe(7);
  });

  it('leaves maxTokens undefined when config omits it', async () => {
    const { provider, captured } = makeCapturingProvider();
    const agent = new QueryAgent({
      provider,
      toolRouter: new ToolRouter(mockToolContext()),
      maxToolRounds: 1,
    });
    await agent.run({ id: 't1', instruction: 'hi', context: {} });
    expect(captured[0]?.maxTokens).toBeUndefined();
  });
});

describe('LeaderAgent threads maxTokensPerRole to its own chat() call', () => {
  it('passes maxTokensPerRole.leader to the leader provider', async () => {
    const { provider: leaderProvider, captured } = makeCapturingProvider();
    const stubTool: ToolDefinition = {
      name: 'noop',
      description: '',
      inputSchema: { type: 'object', properties: {} },
    };
    void stubTool;

    const leader = new LeaderAgent({
      providers: {
        leader: leaderProvider,
        query: leaderProvider,
        view: leaderProvider,
        insights: leaderProvider,
      },
      toolContext: mockToolContext(),
      dataSources: [],
      maxToolRounds: 1,
      maxTokensPerRole: { leader: 5555, query: 1111, view: 2222, insights: 3333 },
    });

    // Drain the first turn — leader calls provider.chat once and then emits 'done'.
    for await (const _ of leader.chat('ping', 'sess_1')) { void _; }

    expect(captured[0]?.maxTokens).toBe(5555);
  });
});
