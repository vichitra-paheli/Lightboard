import { describe, expect, it } from 'vitest';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { ComputeEngine } from './engine';

const engine = new ComputeEngine();

describe('ComputeEngine', () => {
  describe('query', () => {
    it('executes a simple SQL query', async () => {
      const result = await engine.query('SELECT 1 AS value, 2 AS other');
      expect(result.rowCount).toBe(1);
      expect(result.columnNames).toEqual(['value', 'other']);
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it('executes range query', async () => {
      const result = await engine.query('SELECT * FROM range(10) t(id)');
      expect(result.rowCount).toBe(10);
      expect(result.columnNames).toEqual(['id']);
    });

    it('executes aggregation query', async () => {
      const result = await engine.query(
        "SELECT COUNT(*) AS cnt, SUM(i) AS total FROM range(100) t(i)",
      );
      expect(result.rowCount).toBe(1);
      expect(result.columnNames).toContain('cnt');
      expect(result.columnNames).toContain('total');
    });

    it('returns empty result for no rows', async () => {
      const result = await engine.query('SELECT 1 WHERE false');
      expect(result.rowCount).toBe(0);
    });
  });

  describe('crossSourceJoin', () => {
    it('joins two Arrow tables', async () => {
      const usersTable = tableFromArrays({
        id: [1, 2, 3],
        name: ['Alice', 'Bob', 'Charlie'],
      });
      const ordersTable = tableFromArrays({
        user_id: [1, 1, 2],
        amount: [100, 200, 50],
      });

      const result = await engine.crossSourceJoin(
        [
          { name: 'users', buffer: new Uint8Array(tableToIPC(usersTable)) },
          { name: 'orders', buffer: new Uint8Array(tableToIPC(ordersTable)) },
        ],
        `SELECT u.name, SUM(o.amount) AS total
         FROM users u
         JOIN orders o ON u.id = o.user_id
         GROUP BY u.name
         ORDER BY total DESC`,
      );

      expect(result.rowCount).toBe(2);
      expect(result.columnNames).toEqual(['name', 'total']);
    });

    it('handles empty Arrow table input', async () => {
      const emptyTable = tableFromArrays({ id: new Int32Array(0) });
      const result = await engine.crossSourceJoin(
        [{ name: 'empty', buffer: new Uint8Array(tableToIPC(emptyTable)) }],
        'SELECT COUNT(*) AS cnt FROM empty',
      );
      expect(result.rowCount).toBe(1);
    });
  });
});
