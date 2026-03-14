import { describe, expect, it } from 'vitest';
import { hash } from './hash';
import type { QueryIR } from './types';

describe('hash', () => {
  const ir: QueryIR = {
    source: 'pg-main',
    table: 'events',
    select: [{ field: 'id' }, { field: 'name' }],
    aggregations: [],
    groupBy: [],
    orderBy: [],
    joins: [],
  };

  it('produces a hex string', () => {
    const h = hash(ir);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hash(ir)).toBe(hash(ir));
  });

  it('changes when IR changes', () => {
    const modified = { ...ir, table: 'users' };
    expect(hash(ir)).not.toBe(hash(modified));
  });

  it('is stable regardless of property order', () => {
    const a: QueryIR = { source: 'x', table: 'y', select: [], aggregations: [], groupBy: [], orderBy: [], joins: [] };
    const b: QueryIR = { table: 'y', source: 'x', select: [], joins: [], orderBy: [], groupBy: [], aggregations: [] };
    expect(hash(a)).toBe(hash(b));
  });
});
