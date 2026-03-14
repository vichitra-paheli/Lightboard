import { describe, expect, it } from 'vitest';
import { extractVariables, interpolateVariables } from './interpolate';
import type { QueryIR } from './types';

const baseIR: QueryIR = {
  source: 'pg-main',
  table: 'events',
  select: [],
  aggregations: [],
  groupBy: [],
  orderBy: [],
  joins: [],
};

describe('interpolateVariables', () => {
  it('substitutes variables in filter values', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: { field: { field: 'status' }, operator: 'eq', value: '$status' },
    };
    const result = interpolateVariables(ir, { status: 'active' });
    expect((result.filter as any).value).toBe('active');
  });

  it('substitutes variables in time range', () => {
    const ir: QueryIR = {
      ...baseIR,
      timeRange: {
        field: { field: 'created_at' },
        from: '$start_time',
        to: '$end_time',
      },
    };
    const result = interpolateVariables(ir, {
      start_time: '2024-01-01',
      end_time: '2024-12-31',
    });
    expect(result.timeRange!.from).toBe('2024-01-01');
    expect(result.timeRange!.to).toBe('2024-12-31');
  });

  it('substitutes numeric variables as strings', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: { field: { field: 'age' }, operator: 'gt', value: '$min_age' },
    };
    const result = interpolateVariables(ir, { min_age: 18 });
    expect((result.filter as any).value).toBe('18');
  });

  it('substitutes null variables', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: { field: { field: 'x' }, operator: 'eq', value: '$val' },
    };
    const result = interpolateVariables(ir, { val: null });
    expect((result.filter as any).value).toBe('null');
  });

  it('leaves unmatched variables as-is', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: { field: { field: 'x' }, operator: 'eq', value: '$unknown' },
    };
    const result = interpolateVariables(ir, {});
    expect((result.filter as any).value).toBe('$unknown');
  });

  it('handles multiple variables in one string', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: { field: { field: 'x' }, operator: 'like', value: '$prefix%$suffix' },
    };
    const result = interpolateVariables(ir, { prefix: 'hello', suffix: 'world' });
    expect((result.filter as any).value).toBe('hello%world');
  });

  it('does not modify the original IR', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: { field: { field: 'x' }, operator: 'eq', value: '$val' },
    };
    interpolateVariables(ir, { val: 'replaced' });
    expect((ir.filter as any).value).toBe('$val');
  });
});

describe('extractVariables', () => {
  it('finds variables in filter values', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: {
        and: [
          { field: { field: 'x' }, operator: 'eq', value: '$foo' },
          { field: { field: 'y' }, operator: 'gt', value: '$bar' },
        ],
      },
    };
    const vars = extractVariables(ir);
    expect(vars).toContain('foo');
    expect(vars).toContain('bar');
    expect(vars).toHaveLength(2);
  });

  it('finds variables in time range', () => {
    const ir: QueryIR = {
      ...baseIR,
      timeRange: { field: { field: 'ts' }, from: '$start', to: '$end' },
    };
    const vars = extractVariables(ir);
    expect(vars).toContain('start');
    expect(vars).toContain('end');
  });

  it('deduplicates repeated variables', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: {
        and: [
          { field: { field: 'a' }, operator: 'eq', value: '$x' },
          { field: { field: 'b' }, operator: 'eq', value: '$x' },
        ],
      },
    };
    expect(extractVariables(ir)).toEqual(['x']);
  });

  it('returns empty array when no variables', () => {
    expect(extractVariables(baseIR)).toEqual([]);
  });
});
