import { describe as desc, expect, it } from 'vitest';
import { describe } from './describe';
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

desc('describe', () => {
  it('describes a minimal SELECT *', () => {
    const result = describe(baseIR);
    expect(result).toContain('SELECT *');
    expect(result).toContain('FROM pg-main.events');
  });

  it('describes selected fields', () => {
    const ir: QueryIR = {
      ...baseIR,
      select: [
        { field: 'id' },
        { field: 'name', alias: 'user_name' },
        { field: 'email', table: 'u' },
      ],
    };
    const result = describe(ir);
    expect(result).toContain('SELECT id, name as user_name, u.email');
  });

  it('describes aggregations', () => {
    const ir: QueryIR = {
      ...baseIR,
      aggregations: [
        { function: 'sum', field: { field: 'amount' }, alias: 'total' },
        { function: 'count', field: { field: '*' } },
      ],
      groupBy: [{ field: 'category' }],
    };
    const result = describe(ir);
    expect(result).toContain('SUM(amount) as total');
    expect(result).toContain('COUNT(*)');
    expect(result).toContain('GROUP BY category');
  });

  it('describes filters', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: {
        and: [
          { field: { field: 'status' }, operator: 'eq', value: 'active' },
          { field: { field: 'age' }, operator: 'gte', value: 18 },
        ],
      },
    };
    const result = describe(ir);
    expect(result).toContain('WHERE (status EQ "active" AND age GTE 18)');
  });

  it('describes is_null filter', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: { field: { field: 'deleted_at' }, operator: 'is_null' },
    };
    const result = describe(ir);
    expect(result).toContain('WHERE deleted_at IS NULL');
  });

  it('describes OR filters', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: {
        or: [
          { field: { field: 'a' }, operator: 'eq', value: 1 },
          { field: { field: 'b' }, operator: 'eq', value: 2 },
        ],
      },
    };
    const result = describe(ir);
    expect(result).toContain('WHERE (a EQ 1 OR b EQ 2)');
  });

  it('describes IN filter with array', () => {
    const ir: QueryIR = {
      ...baseIR,
      filter: { field: { field: 'status' }, operator: 'in', value: ['a', 'b', 'c'] },
    };
    const result = describe(ir);
    expect(result).toContain('WHERE status IN (a, b, c)');
  });

  it('describes time range', () => {
    const ir: QueryIR = {
      ...baseIR,
      timeRange: { field: { field: 'created_at' }, from: 'now-1h', to: 'now' },
    };
    const result = describe(ir);
    expect(result).toContain('TIME created_at FROM now-1h TO now');
  });

  it('describes order by', () => {
    const ir: QueryIR = {
      ...baseIR,
      orderBy: [
        { field: { field: 'score' }, direction: 'desc' },
        { field: { field: 'name' }, direction: 'asc' },
      ],
    };
    const result = describe(ir);
    expect(result).toContain('ORDER BY score DESC, name ASC');
  });

  it('describes limit and offset', () => {
    const ir: QueryIR = { ...baseIR, limit: 50, offset: 100 };
    const result = describe(ir);
    expect(result).toContain('LIMIT 50');
    expect(result).toContain('OFFSET 100');
  });

  it('describes joins', () => {
    const ir: QueryIR = {
      ...baseIR,
      joins: [
        {
          type: 'left',
          table: 'users',
          alias: 'u',
          on: { field: { field: 'user_id' }, operator: 'eq', value: 'u.id' },
        },
      ],
    };
    const result = describe(ir);
    expect(result).toContain('LEFT JOIN users u ON');
  });

  it('describes table alias', () => {
    const ir: QueryIR = { ...baseIR, tableAlias: 'e' };
    const result = describe(ir);
    expect(result).toContain('FROM pg-main.events e');
  });
});
