import { describe, expect, it } from 'vitest';

import { DEFAULT_ROW_LIMIT, ensureLimit } from './constants';

describe('ensureLimit', () => {
  it('appends LIMIT when the statement has none', () => {
    expect(ensureLimit('SELECT * FROM orders')).toBe(
      `SELECT * FROM orders LIMIT ${DEFAULT_ROW_LIMIT}`,
    );
  });

  it('trims trailing semicolons before appending', () => {
    expect(ensureLimit('SELECT * FROM orders;')).toBe(
      `SELECT * FROM orders LIMIT ${DEFAULT_ROW_LIMIT}`,
    );
    expect(ensureLimit('SELECT * FROM orders;;;')).toBe(
      `SELECT * FROM orders LIMIT ${DEFAULT_ROW_LIMIT}`,
    );
  });

  it('leaves an explicit LIMIT untouched, even when larger than the cap', () => {
    const sql = 'SELECT * FROM orders LIMIT 1000';
    expect(ensureLimit(sql)).toBe(sql);
  });

  it('respects a LIMIT written in mixed case', () => {
    const sql = 'select * from orders limit 10';
    expect(ensureLimit(sql)).toBe(sql);
  });

  it('adds a LIMIT when the only existing LIMIT is inside a subquery', () => {
    const sql = 'SELECT * FROM (SELECT id FROM orders LIMIT 10) t ORDER BY id';
    expect(ensureLimit(sql)).toBe(
      `SELECT * FROM (SELECT id FROM orders LIMIT 10) t ORDER BY id LIMIT ${DEFAULT_ROW_LIMIT}`,
    );
  });

  it('respects a custom cap', () => {
    expect(ensureLimit('SELECT * FROM orders', 50)).toBe('SELECT * FROM orders LIMIT 50');
  });

  it('returns empty input verbatim', () => {
    expect(ensureLimit('')).toBe('');
  });
});
