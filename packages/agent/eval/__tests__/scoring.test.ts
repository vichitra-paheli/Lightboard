import { describe, expect, it } from 'vitest';

import type { AgentEvent } from '../../src/agent';
import type { ToolKind } from '../../src/events/tool-event-formatter';
import {
  estimateTokens,
  inferChartType,
  isSchemaDocComplete,
  REQUIRED_SCHEMA_DOC_SECTIONS,
  scoreQuestion,
} from '../scoring';

/**
 * Build a tool_end event with the minimum fields the scorer cares about.
 * Keeps the fixtures readable — the real AgentEvent has many optional fields
 * the scorer ignores here.
 */
function toolEnd(
  name: string,
  opts: { kind?: ToolKind; isError?: boolean; result?: string } = {},
): Extract<AgentEvent, { type: 'tool_end' }> {
  return {
    type: 'tool_end',
    name,
    result: opts.result ?? '{}',
    isError: opts.isError ?? false,
    ...(opts.kind ? { kind: opts.kind } : {}),
  };
}

describe('estimateTokens', () => {
  it('rounds chars / 4 up', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(400)).toBe(100);
  });

  it('treats negative input as zero', () => {
    expect(estimateTokens(-10)).toBe(0);
  });
});

describe('inferChartType', () => {
  it('returns undefined for empty HTML', () => {
    expect(inferChartType(undefined)).toBeUndefined();
    expect(inferChartType('')).toBeUndefined();
  });

  it('picks up Chart.js type declarations', () => {
    expect(inferChartType("<script>new Chart(ctx, { type: 'bar', data: {} })</script>")).toBe('bar');
    expect(inferChartType('<script>new Chart(ctx, { type:"line", data:{} })</script>')).toBe('line');
  });

  it('ignores non-chart type: declarations', () => {
    // `type: number` is a TS/JS usage, not a Chart.js kind.
    expect(inferChartType('<script>const foo: { type: number } = { type: 1 };</script>')).toBeUndefined();
  });

  it('falls back to class hints', () => {
    expect(inferChartType('<div class="fig fig--donut">')).toBe('donut');
    expect(inferChartType('<div class="fig fig--horizontal-bar">')).toBe('horizontal-bar');
  });

  it('uses the design-system figure classes when present', () => {
    expect(inferChartType('<div class="fig__bar"></div>')).toBe('bar');
    expect(inferChartType('<svg><polyline points="0,0" /></svg>')).toBe('line');
    expect(inferChartType('<div class="fig__stat">42</div>')).toBe('stat');
  });
});

describe('isSchemaDocComplete', () => {
  const allSections = REQUIRED_SCHEMA_DOC_SECTIONS.map((s) => `### ${s}\ncontent\n`).join('\n');

  it('returns true when all 8 H3 sections are present', () => {
    expect(isSchemaDocComplete(allSections)).toBe(true);
  });

  it('returns false when a section is missing', () => {
    const dropped = allSections.replace('### Gotchas', '### Unrelated');
    expect(isSchemaDocComplete(dropped)).toBe(false);
  });

  it('returns false for empty or undefined input', () => {
    expect(isSchemaDocComplete(undefined)).toBe(false);
    expect(isSchemaDocComplete('')).toBe(false);
  });

  it('matches case-insensitively', () => {
    const mixedCase = REQUIRED_SCHEMA_DOC_SECTIONS.map((s) => `### ${s.toUpperCase()}\nbody\n`).join('\n');
    expect(isSchemaDocComplete(mixedCase)).toBe(true);
  });
});

describe('scoreQuestion', () => {
  it('scores hasView true when a create_view succeeds', () => {
    const summary = scoreQuestion({
      slug: 'chart-q',
      question: 'Chart please',
      events: [
        toolEnd('create_view', { result: '{"viewId":"v1","viewSpec":{"html":"<div/>"}}' }),
        { type: 'done', stopReason: 'end_turn' } as AgentEvent,
      ],
      viewHtml: "<script>new Chart(ctx, { type: 'bar' })</script>",
      durationMs: 1000,
    });
    expect(summary.hasView).toBe(true);
    expect(summary.chartType).toBe('bar');
    expect(summary.stopReason).toBe('end_turn');
  });

  it('scores hasView true when await_tasks carries a view role result', () => {
    const awaitResult = JSON.stringify({
      task_view_1: {
        role: 'view',
        success: true,
        data: { viewSpec: { html: '<svg />' } },
      },
    });
    const summary = scoreQuestion({
      slug: 'dispatch-chart',
      question: 'Dispatch a chart',
      events: [toolEnd('await_tasks', { result: awaitResult })],
      durationMs: 500,
    });
    expect(summary.hasView).toBe(true);
  });

  it('scores hasKeyTakeaways + hasCaveat when narrate payload is well-formed', () => {
    const summary = scoreQuestion({
      slug: 'narrate',
      question: 'summarize',
      events: [],
      narrate: {
        bullets: [
          { rank: 1, headline: 'A', body: 'one' },
          { rank: 2, headline: 'B', body: 'two' },
          { rank: 3, headline: 'C', body: 'three' },
        ],
        caveat: 'small sample',
      },
      durationMs: 10,
    });
    expect(summary.hasKeyTakeaways).toBe(true);
    expect(summary.hasCaveat).toBe(true);
  });

  it('hasKeyTakeaways is false when bullets count is off', () => {
    const summary = scoreQuestion({
      slug: 'short',
      question: 'q',
      events: [],
      narrate: { bullets: [{ rank: 1, headline: 'A', body: 'only one' }] },
      durationMs: 0,
    });
    expect(summary.hasKeyTakeaways).toBe(false);
    expect(summary.hasCaveat).toBe(false);
  });

  it('hasCaveat is false when the caveat is whitespace only', () => {
    const summary = scoreQuestion({
      slug: 'wscaveat',
      question: 'q',
      events: [],
      narrate: {
        bullets: [
          { rank: 1, headline: 'A', body: 'one' },
          { rank: 2, headline: 'B', body: 'two' },
          { rank: 3, headline: 'C', body: 'three' },
        ],
        caveat: '   ',
      },
      durationMs: 0,
    });
    expect(summary.hasKeyTakeaways).toBe(true);
    expect(summary.hasCaveat).toBe(false);
  });

  it('tallies tool kinds from tool_end events', () => {
    const events: AgentEvent[] = [
      { type: 'tool_end', name: 'get_schema', result: '{}', isError: false, kind: 'SCHEMA' },
      { type: 'tool_end', name: 'run_sql', result: '{}', isError: false, kind: 'QUERY' },
      { type: 'tool_end', name: 'run_sql', result: '{}', isError: false, kind: 'QUERY' },
      { type: 'tool_end', name: 'create_view', result: '{}', isError: false, kind: 'VIZ' },
    ];
    const summary = scoreQuestion({
      slug: 'counts',
      question: 'q',
      events,
      durationMs: 0,
    });
    expect(summary.toolCallCount).toBe(4);
    expect(summary.kinds).toEqual({ SCHEMA: 1, QUERY: 2, VIZ: 1 });
  });

  it('surfaces tool failures into errors[]', () => {
    const summary = scoreQuestion({
      slug: 'fail',
      question: 'q',
      events: [
        {
          type: 'tool_end',
          name: 'run_sql',
          result: 'connection refused',
          isError: true,
          kind: 'QUERY',
        },
      ],
      durationMs: 0,
    });
    expect(summary.errors.length).toBe(1);
    expect(summary.errors[0]).toContain('run_sql');
  });

  it('merges harnessErrors without losing them', () => {
    const summary = scoreQuestion({
      slug: 'outer-fail',
      question: 'q',
      events: [],
      durationMs: 0,
      harnessErrors: ['LLM endpoint unreachable'],
    });
    expect(summary.errors).toEqual(['LLM endpoint unreachable']);
  });

  it('hasSchemaDoc is true only when all 8 sections are present', () => {
    const complete = REQUIRED_SCHEMA_DOC_SECTIONS.map((s) => `### ${s}\nbody\n`).join('\n');
    const summary = scoreQuestion({
      slug: 'schema',
      question: 'bootstrap',
      events: [],
      schemaDoc: complete,
      durationMs: 0,
    });
    expect(summary.hasSchemaDoc).toBe(true);
  });

  it('hasSchemaDoc is false when a section is missing', () => {
    const partial = REQUIRED_SCHEMA_DOC_SECTIONS.slice(0, 6).map((s) => `### ${s}\nbody\n`).join('\n');
    const summary = scoreQuestion({
      slug: 'schema-partial',
      question: 'bootstrap',
      events: [],
      schemaDoc: partial,
      durationMs: 0,
    });
    expect(summary.hasSchemaDoc).toBe(false);
  });

  it('uses real usage when tokenExact is available', () => {
    const summary = scoreQuestion({
      slug: 'tok',
      question: 'hello world',
      events: [{ type: 'text', text: 'ok' }],
      durationMs: 0,
      usage: { input: 123, output: 45 },
    });
    expect(summary.tokenExact).toBe(true);
    expect(summary.tokenEstIn).toBe(123);
    expect(summary.tokenEstOut).toBe(45);
  });

  it('falls back to char-based estimates when usage is unset', () => {
    const summary = scoreQuestion({
      slug: 'tok',
      question: 'hello world', // 11 chars → 3 tokens
      events: [{ type: 'text', text: '1234' }], // 4 chars → 1 token
      durationMs: 0,
    });
    expect(summary.tokenExact).toBe(false);
    expect(summary.tokenEstIn).toBe(3);
    expect(summary.tokenEstOut).toBe(1);
  });
});
