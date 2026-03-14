import { describe, expect, it } from 'vitest';
import { withSpan, traceConnectorQuery, traceDuckDBCompute, traceAgentLLMCall } from './spans';

describe('custom spans', () => {
  it('withSpan returns the function result', async () => {
    const result = await withSpan('test.span', { key: 'value' }, async () => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it('withSpan propagates errors', async () => {
    await expect(
      withSpan('test.error', {}, async () => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');
  });

  it('traceConnectorQuery wraps execution', async () => {
    const result = await traceConnectorQuery('postgres', 'main-db', async () => {
      return { rows: 10 };
    });
    expect(result).toEqual({ rows: 10 });
  });

  it('traceDuckDBCompute wraps execution', async () => {
    const result = await traceDuckDBCompute('cross-join', async () => {
      return { computed: true };
    });
    expect(result).toEqual({ computed: true });
  });

  it('traceAgentLLMCall wraps execution', async () => {
    const result = await traceAgentLLMCall('claude-4', async () => {
      return { response: 'hello' };
    });
    expect(result).toEqual({ response: 'hello' });
  });
});
