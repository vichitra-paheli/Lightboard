import { describe, expect, it } from 'vitest';

import { classifyTool, formatEnd, formatStart } from './tool-event-formatter';

describe('classifyTool', () => {
  it.each([
    ['get_schema', 'SCHEMA'],
    ['describe_table', 'SCHEMA'],
    ['introspect_schema', 'SCHEMA'],
    ['propose_schema_doc', 'SCHEMA'],
    ['run_sql', 'QUERY'],
    ['execute_query', 'QUERY'],
    ['check_query_hints', 'FILTER'],
    ['apply_filter', 'FILTER'],
    ['create_view', 'VIZ'],
    ['modify_view', 'VIZ'],
    ['analyze_data', 'COMPUTE'],
    ['list_scratchpads', 'COMPUTE'],
    ['load_scratchpad', 'COMPUTE'],
    ['narrate_summary', 'NARRATE'],
    ['dispatch_query', 'COMPUTE'],
    ['dispatch_view', 'COMPUTE'],
    ['dispatch_insights', 'COMPUTE'],
    ['delegate_query', 'COMPUTE'],
    ['await_tasks', 'COMPUTE'],
    ['cancel_task', 'COMPUTE'],
    ['totally_unknown_tool', 'COMPUTE'],
  ])('classifies %s as %s', (name, expected) => {
    expect(classifyTool(name)).toBe(expected);
  });
});

describe('formatStart', () => {
  it('formats get_schema with an empty body', () => {
    const { kind, label } = formatStart('get_schema', {});
    expect(kind).toBe('SCHEMA');
    expect(label).toBe('get_schema()');
  });

  it('pulls source.table out of describe_table input', () => {
    const out = formatStart('describe_table', {
      source_id: 'cricket',
      table_name: 'ball_by_ball',
    });
    expect(out.kind).toBe('SCHEMA');
    expect(out.label).toBe('describe_table(cricket.ball_by_ball)');
  });

  it('falls back to the bare table name when source_id missing', () => {
    const out = formatStart('describe_table', { table_name: 'ball_by_ball' });
    expect(out.label).toBe('describe_table(ball_by_ball)');
  });

  it('summarizes short SQL verbatim', () => {
    const out = formatStart('run_sql', { sql: 'SELECT 1' });
    expect(out.kind).toBe('QUERY');
    expect(out.label).toBe('sql(SELECT 1)');
  });

  it('truncates SQL at the FROM clause', () => {
    const sql = 'SELECT batter, SUM(runs) FROM cricket.ball_by_ball WHERE over < 20';
    const out = formatStart('run_sql', { sql });
    expect(out.label).toBe('sql(SELECT batter, SUM(runs))');
  });

  it('collapses multi-line SQL whitespace', () => {
    const sql = `SELECT
        batter,
        SUM(runs)
      FROM cricket.ball_by_ball`;
    const out = formatStart('run_sql', { sql });
    expect(out.label).toBe('sql(SELECT batter, SUM(runs))');
  });

  it('truncates SQL with no FROM clause at the 60-char ceiling', () => {
    const sql = 'SELECT ' + 'a, '.repeat(50);
    const out = formatStart('run_sql', { sql });
    // Should start with `sql(SELECT ` and end with the ellipsis truncation
    expect(out.label.startsWith('sql(SELECT ')).toBe(true);
    // The label body (inside the parens) is truncated to 60 chars.
    const inner = out.label.slice('sql('.length, -1);
    expect(inner.length).toBeLessThanOrEqual(60);
    expect(inner.endsWith('…')).toBe(true);
  });

  it('formats execute_query like run_sql', () => {
    const out = formatStart('execute_query', { sql: 'SELECT 1' });
    expect(out.kind).toBe('QUERY');
    expect(out.label).toBe('sql(SELECT 1)');
  });

  it('formats create_view with a truncated title', () => {
    const out = formatStart('create_view', {
      title: 'Top 10 Indian batters by TSR since 2010 in cricket world cups',
    });
    expect(out.kind).toBe('VIZ');
    expect(out.label.startsWith('create_view(Top 10 Indian batters by TSR')).toBe(true);
    const inner = out.label.slice('create_view('.length, -1);
    expect(inner.length).toBeLessThanOrEqual(40);
    expect(inner.endsWith('…')).toBe(true);
  });

  it('formats modify_view with the title when present', () => {
    const out = formatStart('modify_view', { title: 'Sales by region' });
    expect(out.kind).toBe('VIZ');
    expect(out.label).toBe('modify_view(Sales by region)');
  });

  it('formats dispatch_query with the instruction', () => {
    const out = formatStart('dispatch_query', {
      instruction: 'Count orders grouped by customer region over the last quarter',
    });
    expect(out.kind).toBe('COMPUTE');
    expect(out.label.startsWith('dispatch_query(Count orders grouped by')).toBe(true);
  });

  it('formats await_tasks with a count', () => {
    expect(formatStart('await_tasks', { task_ids: ['a', 'b', 'c'] }).label).toBe(
      'await_tasks(3 tasks)',
    );
    expect(formatStart('await_tasks', { task_ids: ['a'] }).label).toBe(
      'await_tasks(1 task)',
    );
    expect(formatStart('await_tasks', { task_ids: [] }).label).toBe(
      'await_tasks(0 tasks)',
    );
  });

  it('falls back to name() for unknown tools', () => {
    const out = formatStart('some_tool_we_have_never_seen', { random: 'stuff' });
    expect(out.kind).toBe('COMPUTE');
    expect(out.label).toBe('some_tool_we_have_never_seen()');
  });

  it('handles non-object input defensively', () => {
    expect(formatStart('get_schema', null).label).toBe('get_schema()');
    expect(formatStart('run_sql', 'not-an-object' as unknown).label).toBe('run_sql()');
  });
});

describe('formatEnd', () => {
  it('surfaces rowCount from a run_sql result', () => {
    const out = formatEnd(
      'run_sql',
      JSON.stringify({ rowCount: 412, rows: [] }),
      false,
      42,
    );
    expect(out.resultSummary).toBe('→ 412 rows');
  });

  it('falls back to rows.length when rowCount is missing', () => {
    const out = formatEnd(
      'run_sql',
      JSON.stringify({ rows: [{ a: 1 }, { a: 2 }] }),
      false,
      10,
    );
    expect(out.resultSummary).toBe('→ 2 rows');
  });

  it('reports → view created for create_view', () => {
    const out = formatEnd('create_view', '{"viewSpec":{"html":"x"}}', false, 5);
    expect(out.resultSummary).toBe('→ view created');
  });

  it('reports → view updated for modify_view', () => {
    const out = formatEnd('modify_view', '{}', false, 5);
    expect(out.resultSummary).toBe('→ view updated');
  });

  it('reports findings count for analyze_data when present', () => {
    const out = formatEnd(
      'analyze_data',
      JSON.stringify({ findings: [{}, {}, {}] }),
      false,
      10,
    );
    expect(out.resultSummary).toBe('→ 3 findings');
  });

  it('reports rows for analyze_data when no findings are present', () => {
    const out = formatEnd(
      'analyze_data',
      JSON.stringify({ rowCount: 5, rows: [] }),
      false,
      10,
    );
    expect(out.resultSummary).toBe('→ 5 rows');
  });

  it('reports task count for await_tasks', () => {
    const out = formatEnd(
      'await_tasks',
      JSON.stringify({ task_q1: {}, task_v1: {} }),
      false,
      10,
    );
    expect(out.resultSummary).toBe('→ 2 tasks');
  });

  it('reports → proposed for propose_schema_doc', () => {
    const out = formatEnd('propose_schema_doc', '{"proposed":true}', false, 8);
    expect(out.resultSummary).toBe('→ proposed');
  });

  it('reports → error on the error path regardless of tool', () => {
    expect(formatEnd('run_sql', 'connection refused', true, 1).resultSummary).toBe('→ error');
    expect(formatEnd('create_view', 'boom', true, 1).resultSummary).toBe('→ error');
    expect(formatEnd('get_schema', 'fail', true, 1).resultSummary).toBe('→ error');
  });

  it('returns an empty object for unknown tools', () => {
    expect(formatEnd('get_schema', '{}', false, 1)).toEqual({});
    expect(formatEnd('totally_unknown', 'stuff', false, 1)).toEqual({});
  });

  it('returns an empty object for run_sql results that are not JSON', () => {
    expect(formatEnd('run_sql', 'plain text result', false, 1)).toEqual({});
  });
});
