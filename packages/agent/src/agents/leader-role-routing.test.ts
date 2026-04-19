import { describe, expect, it, vi } from 'vitest';

import type { LLMProvider, Message, StreamEvent, ToolDefinition } from '../provider/types';
import type { ToolContext } from '../tools/router';

import { LeaderAgent, type LeaderProviderMap } from './leader';

/**
 * Builds a scripted provider that records the tool it was asked to host and
 * walks through a predefined `StreamEvent[]` sequence. Each call to chat()
 * pulls from the queue so the test can distinguish the leader pass (tool
 * request) from the sub-agent pass (final answer).
 */
function scriptedProvider(label: string, scripts: StreamEvent[][]): LLMProvider & {
  calls: { tools: string[] }[];
} {
  let idx = 0;
  const calls: { tools: string[] }[] = [];
  return {
    name: label,
    calls,
    async *chat(
      _messages: Message[],
      tools: ToolDefinition[],
    ): AsyncIterable<StreamEvent> {
      calls.push({ tools: tools.map((t) => t.name) });
      const events = scripts[idx] ?? [{ type: 'message_end' as const, stopReason: 'end_turn' }];
      idx++;
      for (const ev of events) yield ev;
    },
  };
}

function mockToolContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({
      tables: [{ name: 'orders', columns: [{ name: 'id', type: 'integer' }] }],
    }),
    runSQL: vi.fn().mockResolvedValue({ rows: [{ region: 'North' }], rowCount: 1 }),
  };
}

describe('LeaderAgent — per-role provider routing', () => {
  it('routes delegate_query to the query provider', async () => {
    // Leader's first turn: request a delegate_query. Second turn: final text.
    const leaderProv = scriptedProvider('leader', [
      [
        { type: 'tool_call_start', id: 'call_1', name: 'delegate_query' },
        {
          type: 'tool_call_end',
          id: 'call_1',
          name: 'delegate_query',
          input: { instruction: 'count rows', source_id: 'pg-main' },
        },
        { type: 'message_end', stopReason: 'tool_use' },
      ],
      [
        { type: 'text_delta', text: 'Done.' },
        { type: 'message_end', stopReason: 'end_turn' },
      ],
    ]);
    // Query agent responds with a get_schema call then a completion.
    const queryProv = scriptedProvider('query', [
      [
        { type: 'tool_call_start', id: 'q1', name: 'get_schema' },
        { type: 'tool_call_end', id: 'q1', name: 'get_schema', input: { source_id: 'pg-main' } },
        { type: 'message_end', stopReason: 'tool_use' },
      ],
      [
        { type: 'text_delta', text: 'Data ready.' },
        { type: 'message_end', stopReason: 'end_turn' },
      ],
    ]);
    const viewProv = scriptedProvider('view', []);
    const insightsProv = scriptedProvider('insights', []);

    const providers: LeaderProviderMap = {
      leader: leaderProv,
      query: queryProv,
      view: viewProv,
      insights: insightsProv,
    };

    const leader = new LeaderAgent({
      providers,
      toolContext: mockToolContext(),
      dataSources: [{ id: 'pg-main', name: 'Main', type: 'postgres' }],
      subAgentMaxRounds: 3,
    });

    const events = [];
    for await (const ev of leader.chat('count rows', 'conv')) events.push(ev);

    // Leader received two chat() calls (pre-tool + post-tool-result).
    expect(leaderProv.calls.length).toBeGreaterThanOrEqual(1);
    // Query provider saw at least one call because delegate_query triggered it.
    expect(queryProv.calls.length).toBeGreaterThanOrEqual(1);
    // View + insights providers weren't touched.
    expect(viewProv.calls).toHaveLength(0);
    expect(insightsProv.calls).toHaveLength(0);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('fills the map from the single `provider` field for back-compat', () => {
    const prov = scriptedProvider('solo', []);
    const leader = new LeaderAgent({
      provider: prov,
      toolContext: mockToolContext(),
      dataSources: [{ id: 'pg', name: 'PG', type: 'postgres' }],
    });
    expect(leader.provider.name).toBe('solo');
  });

  it('requires either providers or provider', () => {
    expect(
      () =>
        new LeaderAgent({
          toolContext: mockToolContext(),
          dataSources: [{ id: 'pg', name: 'PG', type: 'postgres' }],
        }),
    ).toThrow(/providers|provider/);
  });
});
