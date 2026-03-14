import { describe, expect, it } from 'vitest';
import type { QueryIR } from '@lightboard/query-ir';
import { translateIR } from './translator';

const base: QueryIR = {
  source: 'pg-main',
  table: 'events',
  select: [],
  aggregations: [],
  groupBy: [],
  orderBy: [],
  joins: [],
};

describe('translateIR', () => {
  it('translates SELECT *', () => {
    const { sql, params } = translateIR(base);
    expect(sql).toBe('SELECT * FROM "events"');
    expect(params).toEqual([]);
  });

  it('translates selected fields', () => {
    const { sql } = translateIR({
      ...base,
      select: [{ field: 'id' }, { field: 'name', alias: 'user_name' }],
    });
    expect(sql).toContain('SELECT "id", "name" AS "user_name"');
  });

  it('translates table alias', () => {
    const { sql } = translateIR({ ...base, tableAlias: 'e' });
    expect(sql).toContain('FROM "events" "e"');
  });

  it('translates qualified field references', () => {
    const { sql } = translateIR({
      ...base,
      select: [{ field: 'id', table: 'e' }],
    });
    expect(sql).toContain('"e"."id"');
  });

  // Filter operators
  it('translates eq filter', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: { field: { field: 'status' }, operator: 'eq', value: 'active' },
    });
    expect(sql).toContain('WHERE "status" = $1');
    expect(params).toEqual(['active']);
  });

  it('translates neq filter', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: { field: { field: 'status' }, operator: 'neq', value: 'deleted' },
    });
    expect(sql).toContain('"status" != $1');
    expect(params).toEqual(['deleted']);
  });

  it('translates gt/gte/lt/lte filters', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: {
        and: [
          { field: { field: 'age' }, operator: 'gt', value: 18 },
          { field: { field: 'score' }, operator: 'gte', value: 50 },
          { field: { field: 'rank' }, operator: 'lt', value: 100 },
          { field: { field: 'level' }, operator: 'lte', value: 5 },
        ],
      },
    });
    expect(sql).toContain('"age" > $1');
    expect(sql).toContain('"score" >= $2');
    expect(sql).toContain('"rank" < $3');
    expect(sql).toContain('"level" <= $4');
    expect(params).toEqual([18, 50, 100, 5]);
  });

  it('translates like filter', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: { field: { field: 'name' }, operator: 'like', value: '%test%' },
    });
    expect(sql).toContain('"name" LIKE $1');
    expect(params).toEqual(['%test%']);
  });

  it('translates is_null filter', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: { field: { field: 'deleted_at' }, operator: 'is_null' },
    });
    expect(sql).toContain('"deleted_at" IS NULL');
    expect(params).toEqual([]);
  });

  it('translates is_not_null filter', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: { field: { field: 'email' }, operator: 'is_not_null' },
    });
    expect(sql).toContain('"email" IS NOT NULL');
    expect(params).toEqual([]);
  });

  it('translates in filter', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: { field: { field: 'status' }, operator: 'in', value: ['a', 'b', 'c'] },
    });
    expect(sql).toContain('"status" IN ($1, $2, $3)');
    expect(params).toEqual(['a', 'b', 'c']);
  });

  it('translates not_in filter', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: { field: { field: 'type' }, operator: 'not_in', value: [1, 2] },
    });
    expect(sql).toContain('"type" NOT IN ($1, $2)');
    expect(params).toEqual([1, 2]);
  });

  // Boolean combinators
  it('translates AND combinator', () => {
    const { sql } = translateIR({
      ...base,
      filter: {
        and: [
          { field: { field: 'a' }, operator: 'eq', value: 1 },
          { field: { field: 'b' }, operator: 'eq', value: 2 },
        ],
      },
    });
    expect(sql).toContain('("a" = $1 AND "b" = $2)');
  });

  it('translates OR combinator', () => {
    const { sql } = translateIR({
      ...base,
      filter: {
        or: [
          { field: { field: 'a' }, operator: 'eq', value: 1 },
          { field: { field: 'b' }, operator: 'eq', value: 2 },
        ],
      },
    });
    expect(sql).toContain('("a" = $1 OR "b" = $2)');
  });

  it('translates nested AND/OR', () => {
    const { sql, params } = translateIR({
      ...base,
      filter: {
        and: [
          { field: { field: 'x' }, operator: 'eq', value: 1 },
          {
            or: [
              { field: { field: 'y' }, operator: 'gt', value: 10 },
              { field: { field: 'z' }, operator: 'is_null' },
            ],
          },
        ],
      },
    });
    expect(sql).toContain('("x" = $1 AND ("y" > $2 OR "z" IS NULL))');
    expect(params).toEqual([1, 10]);
  });

  // Aggregations
  it('translates SUM aggregation', () => {
    const { sql } = translateIR({
      ...base,
      aggregations: [{ function: 'sum', field: { field: 'amount' }, alias: 'total' }],
    });
    expect(sql).toContain('SUM("amount") AS "total"');
  });

  it('translates COUNT(*)', () => {
    const { sql } = translateIR({
      ...base,
      aggregations: [{ function: 'count', field: { field: '*' } }],
    });
    expect(sql).toContain('COUNT(*)');
  });

  it('translates COUNT(DISTINCT)', () => {
    const { sql } = translateIR({
      ...base,
      aggregations: [{ function: 'count_distinct', field: { field: 'user_id' }, alias: 'unique_users' }],
    });
    expect(sql).toContain('COUNT(DISTINCT "user_id") AS "unique_users"');
  });

  it('translates AVG, MIN, MAX', () => {
    const { sql } = translateIR({
      ...base,
      aggregations: [
        { function: 'avg', field: { field: 'score' } },
        { function: 'min', field: { field: 'created_at' } },
        { function: 'max', field: { field: 'updated_at' } },
      ],
    });
    expect(sql).toContain('AVG("score")');
    expect(sql).toContain('MIN("created_at")');
    expect(sql).toContain('MAX("updated_at")');
  });

  it('translates PERCENTILE_CONT', () => {
    const { sql } = translateIR({
      ...base,
      aggregations: [
        { function: 'percentile', field: { field: 'latency' }, params: { p: 0.99 }, alias: 'p99' },
      ],
    });
    expect(sql).toContain('PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "latency") AS "p99"');
  });

  // GROUP BY
  it('translates GROUP BY', () => {
    const { sql } = translateIR({
      ...base,
      select: [{ field: 'category' }],
      aggregations: [{ function: 'count', field: { field: '*' }, alias: 'cnt' }],
      groupBy: [{ field: 'category' }],
    });
    expect(sql).toContain('GROUP BY "category"');
  });

  // ORDER BY
  it('translates ORDER BY', () => {
    const { sql } = translateIR({
      ...base,
      orderBy: [
        { field: { field: 'score' }, direction: 'desc' },
        { field: { field: 'name' }, direction: 'asc' },
      ],
    });
    expect(sql).toContain('ORDER BY "score" DESC, "name" ASC');
  });

  // LIMIT & OFFSET
  it('translates LIMIT and OFFSET', () => {
    const { sql, params } = translateIR({ ...base, limit: 50, offset: 100 });
    expect(sql).toContain('LIMIT $1 OFFSET $2');
    expect(params).toEqual([50, 100]);
  });

  // Time range
  it('translates time range', () => {
    const { sql, params } = translateIR({
      ...base,
      timeRange: { field: { field: 'created_at' }, from: '2024-01-01', to: '2024-12-31' },
    });
    expect(sql).toContain('"created_at" >= $1 AND "created_at" <= $2');
    expect(params).toEqual(['2024-01-01', '2024-12-31']);
  });

  // Joins
  it('translates LEFT JOIN', () => {
    const { sql, params } = translateIR({
      ...base,
      joins: [{
        type: 'left',
        table: 'users',
        alias: 'u',
        on: { field: { field: 'user_id', table: 'events' }, operator: 'eq', value: 'u.id' },
      }],
    });
    expect(sql).toContain('LEFT JOIN "users" "u" ON "events"."user_id" = $1');
    expect(params).toContain('u.id');
  });

  // Complex query
  it('translates a complex multi-operation query', () => {
    const { sql, params } = translateIR({
      source: 'pg-main',
      table: 'orders',
      tableAlias: 'o',
      select: [{ field: 'customer_id', table: 'o' }],
      filter: { field: { field: 'status' }, operator: 'eq', value: 'completed' },
      aggregations: [
        { function: 'sum', field: { field: 'total' }, alias: 'revenue' },
        { function: 'count', field: { field: '*' }, alias: 'order_count' },
      ],
      groupBy: [{ field: 'customer_id', table: 'o' }],
      orderBy: [{ field: { field: 'revenue' }, direction: 'desc' }],
      timeRange: { field: { field: 'created_at' }, from: '2024-01-01', to: '2024-06-30' },
      joins: [],
      limit: 10,
    });

    expect(sql).toContain('SELECT "o"."customer_id"');
    expect(sql).toContain('SUM("total") AS "revenue"');
    expect(sql).toContain('COUNT(*)');
    expect(sql).toContain('FROM "orders" "o"');
    expect(sql).toContain('WHERE "status" = $1');
    expect(sql).toContain('"created_at" >= $2');
    expect(sql).toContain('GROUP BY "o"."customer_id"');
    expect(sql).toContain('ORDER BY "revenue" DESC');
    expect(sql).toContain('LIMIT $4');
    expect(params[0]).toBe('completed');
  });

  // Edge cases
  it('handles empty filter (no WHERE)', () => {
    const { sql } = translateIR(base);
    expect(sql).not.toContain('WHERE');
  });

  it('handles filter + time range together', () => {
    const { sql } = translateIR({
      ...base,
      filter: { field: { field: 'active' }, operator: 'eq', value: true },
      timeRange: { field: { field: 'ts' }, from: 'now-1h', to: 'now' },
    });
    expect(sql).toContain('WHERE "active" = $1 AND "ts" >= $2 AND "ts" <= $3');
  });
});
