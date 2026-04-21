import { describe, expect, it } from 'vitest';

import { inferChartHint } from './leader';

describe('inferChartHint', () => {
  it('returns auto for an empty summary', () => {
    expect(inferChartHint([], 0)).toBe('auto');
    expect(inferChartHint([{ name: 'x', type: 'number' }], 0)).toBe('auto');
  });

  it('returns stat for a single numeric value', () => {
    expect(inferChartHint([{ name: 'total', type: 'number' }], 1)).toBe('stat');
  });

  it('returns line for one numeric + one date column', () => {
    expect(
      inferChartHint(
        [
          { name: 'month', type: 'string', sample: '2025-01-01' },
          { name: 'revenue', type: 'number' },
        ],
        12,
      ),
    ).toBe('line');
  });

  it('returns line when the date column is detected by name', () => {
    expect(
      inferChartHint(
        [
          { name: 'day', type: 'string', sample: 'Monday' },
          { name: 'visits', type: 'number' },
        ],
        7,
      ),
    ).toBe('line');
  });

  it('returns line for multiple numerics against a date axis', () => {
    expect(
      inferChartHint(
        [
          { name: 'timestamp', type: 'string', sample: '2025-04-01' },
          { name: 'latency_p50', type: 'number' },
          { name: 'latency_p99', type: 'number' },
        ],
        48,
      ),
    ).toBe('line');
  });

  it('returns donut for parts-of-whole (small N, one cat + one numeric)', () => {
    expect(
      inferChartHint(
        [
          { name: 'channel', type: 'string', sample: 'Web' },
          { name: 'share', type: 'number' },
        ],
        4,
      ),
    ).toBe('donut');
  });

  it('returns horizontal-bar for ranked comparisons', () => {
    expect(
      inferChartHint(
        [
          { name: 'batter', type: 'string', sample: 'G Gambhir' },
          { name: 'strike_rate', type: 'number' },
        ],
        10,
      ),
    ).toBe('horizontal-bar');
  });

  it('returns auto when too many categorical rows to rank cleanly', () => {
    expect(
      inferChartHint(
        [
          { name: 'user_id', type: 'string', sample: 'u_0001' },
          { name: 'score', type: 'number' },
        ],
        500,
      ),
    ).toBe('auto');
  });
});
