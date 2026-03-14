import { describe, expect, it } from 'vitest';
import { filterClauseSchema, queryIRSchema } from './schema';

describe('queryIRSchema', () => {
  const minimal = {
    source: 'pg-main',
    table: 'events',
  };

  it('validates a minimal IR', () => {
    const result = queryIRSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('pg-main');
      expect(result.data.table).toBe('events');
      expect(result.data.select).toEqual([]);
      expect(result.data.aggregations).toEqual([]);
      expect(result.data.groupBy).toEqual([]);
      expect(result.data.orderBy).toEqual([]);
      expect(result.data.joins).toEqual([]);
    }
  });

  it('validates a full IR with all fields', () => {
    const full = {
      source: 'pg-main',
      table: 'orders',
      tableAlias: 'o',
      select: [
        { field: 'customer_id', table: 'o' },
        { field: 'status', alias: 'order_status' },
      ],
      filter: {
        and: [
          { field: { field: 'status' }, operator: 'eq', value: 'active' },
          { field: { field: 'amount' }, operator: 'gte', value: 100 },
        ],
      },
      aggregations: [
        { function: 'sum', field: { field: 'amount' }, alias: 'total' },
        { function: 'count', field: { field: '*' }, alias: 'num_orders' },
      ],
      groupBy: [{ field: 'customer_id' }],
      orderBy: [{ field: { field: 'total' }, direction: 'desc' }],
      timeRange: {
        field: { field: 'created_at' },
        from: 'now-7d',
        to: 'now',
      },
      joins: [
        {
          type: 'left',
          table: 'customers',
          alias: 'c',
          on: { field: { field: 'id', table: 'c' }, operator: 'eq', value: '$customer_id' },
        },
      ],
      limit: 100,
      offset: 0,
    };

    const result = queryIRSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('rejects invalid source', () => {
    const result = queryIRSchema.safeParse({ table: 'events' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid filter operator', () => {
    const result = queryIRSchema.safeParse({
      ...minimal,
      filter: { field: { field: 'x' }, operator: 'invalid', value: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid aggregation function', () => {
    const result = queryIRSchema.safeParse({
      ...minimal,
      aggregations: [{ function: 'median', field: { field: 'x' } }],
    });
    expect(result.success).toBe(false);
  });

  it('validates percentile with params', () => {
    const result = queryIRSchema.safeParse({
      ...minimal,
      aggregations: [
        { function: 'percentile', field: { field: 'latency' }, params: { p: 99 } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative limit', () => {
    const result = queryIRSchema.safeParse({ ...minimal, limit: -1 });
    expect(result.success).toBe(false);
  });
});

describe('filterClauseSchema', () => {
  it('validates simple condition', () => {
    const result = filterClauseSchema.safeParse({
      field: { field: 'age' },
      operator: 'gt',
      value: 18,
    });
    expect(result.success).toBe(true);
  });

  it('validates is_null without value', () => {
    const result = filterClauseSchema.safeParse({
      field: { field: 'deleted_at' },
      operator: 'is_null',
    });
    expect(result.success).toBe(true);
  });

  it('validates in operator with array', () => {
    const result = filterClauseSchema.safeParse({
      field: { field: 'status' },
      operator: 'in',
      value: ['active', 'pending'],
    });
    expect(result.success).toBe(true);
  });

  it('validates nested and/or combinators', () => {
    const result = filterClauseSchema.safeParse({
      and: [
        { field: { field: 'a' }, operator: 'eq', value: 1 },
        {
          or: [
            { field: { field: 'b' }, operator: 'gt', value: 10 },
            { field: { field: 'c' }, operator: 'is_not_null' },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates deeply nested combinators', () => {
    const result = filterClauseSchema.safeParse({
      or: [
        {
          and: [
            { field: { field: 'x' }, operator: 'eq', value: 1 },
            {
              or: [
                { field: { field: 'y' }, operator: 'lt', value: 5 },
                { field: { field: 'z' }, operator: 'like', value: '%test%' },
              ],
            },
          ],
        },
        { field: { field: 'w' }, operator: 'neq', value: 'deleted' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty and array', () => {
    const result = filterClauseSchema.safeParse({ and: [] });
    expect(result.success).toBe(false);
  });
});
