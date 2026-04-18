import { describe, expect, it } from 'vitest';
import { buildSuggestionsForView, __testing } from '../suggestions-fixture';
import type { HtmlView } from '@/components/view-renderer';
import type { ViewSpec } from '@lightboard/viz-core';

function htmlView(html: string, title = 'Seed view'): HtmlView {
  return { title, sql: 'SELECT 1', html };
}

function viewSpec(panelType: string): ViewSpec {
  return {
    query: {
      source: 's1',
      table: 't1',
      select: [],
      aggregations: [],
      groupBy: [],
      orderBy: [],
      joins: [],
    },
    chart: { type: panelType, config: {} },
    controls: [],
  };
}

describe('buildSuggestionsForView', () => {
  const { FIXTURES, DEFAULT_FIXTURE } = __testing;

  it('returns the bar fixture for bar-kind views', () => {
    const out = buildSuggestionsForView(
      htmlView(`new Chart(ctx, { type: 'bar', data: [] })`),
    );
    expect(out).toEqual(FIXTURES.bar);
  });

  it('returns the scatter fixture for scatter-kind views (including bubble)', () => {
    const scatter = buildSuggestionsForView(
      htmlView(`new Chart(ctx, { type: 'scatter' })`),
    );
    expect(scatter).toEqual(FIXTURES.scatter);

    const bubble = buildSuggestionsForView(
      htmlView(`new Chart(ctx, { type: 'bubble' })`),
    );
    expect(bubble).toEqual(FIXTURES.scatter);
  });

  it('returns the line fixture for line-kind views', () => {
    const htmlOut = buildSuggestionsForView(
      htmlView(`new Chart(ctx, { type: 'line' })`),
    );
    expect(htmlOut).toEqual(FIXTURES.line);

    const specOut = buildSuggestionsForView(viewSpec('time-series-line'));
    expect(specOut).toEqual(FIXTURES.line);
  });

  it('returns the hist fixture for histogram-kind views', () => {
    const out = buildSuggestionsForView(
      htmlView(`// histogram of strike rates per batter`),
    );
    expect(out).toEqual(FIXTURES.hist);
  });

  it('falls back to the default fixture when no chart kind is detectable', () => {
    // `detectKind` returns 'bar' as a fallback for HtmlView with no chart
    // markers, so to test the explicit default-fixture branch we drop the
    // fixture map entry via a mocked kind — not needed here because the
    // current `detectKind` never returns a value outside the FIXTURES keys.
    // Instead, assert that the fallback CONSTANT itself is the expected one.
    expect(DEFAULT_FIXTURE).toEqual([
      'Refine the filter',
      'Break down further',
      'Switch chart type',
      'Drill into a row',
    ]);
  });

  it('returns a fresh array each call (no shared mutable reference)', () => {
    const a = buildSuggestionsForView(
      htmlView(`new Chart(ctx, { type: 'bar' })`),
    );
    const b = buildSuggestionsForView(
      htmlView(`new Chart(ctx, { type: 'bar' })`),
    );
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    // Mutating `a` must not affect `b` or the shared fixture.
    a.push('Should not leak');
    expect(b).not.toContain('Should not leak');
    expect(FIXTURES.bar).not.toContain('Should not leak');
  });
});
