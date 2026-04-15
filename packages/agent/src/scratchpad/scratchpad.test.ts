import { describe, expect, it } from 'vitest';
import { SessionScratchpad } from './scratchpad';

const sampleRows = [
  { id: 1, name: 'Alice', score: 95.5 },
  { id: 2, name: 'Bob', score: 87.0 },
  { id: 3, name: 'Charlie', score: 92.3 },
];

describe('SessionScratchpad', () => {
  it('saves and loads a table', async () => {
    const sp = new SessionScratchpad('session-1');
    const meta = await sp.saveTable('results', sampleRows, 'Test results');

    expect(meta.name).toBe('results');
    expect(meta.description).toBe('Test results');
    expect(meta.rowCount).toBe(3);
    expect(meta.columns).toEqual([
      { name: 'id', type: 'integer' },
      { name: 'name', type: 'string' },
      { name: 'score', type: 'float' },
    ]);

    const loaded = await sp.loadTable('results');
    expect(loaded).toEqual(sampleRows);

    await sp.destroy();
  });

  it('returns a copy of rows (no mutation leakage)', async () => {
    const sp = new SessionScratchpad('session-2');
    await sp.saveTable('data', sampleRows);

    const loaded = await sp.loadTable('data');
    loaded.push({ id: 4, name: 'Diana', score: 88 });

    const reloaded = await sp.loadTable('data');
    expect(reloaded).toHaveLength(3);

    await sp.destroy();
  });

  it('lists tables with metadata', async () => {
    const sp = new SessionScratchpad('session-3');
    await sp.saveTable('table_a', [{ x: 1 }], 'First table');
    await sp.saveTable('table_b', [{ y: 2 }], 'Second table');

    const tables = sp.listTables();
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name).sort()).toEqual(['table_a', 'table_b']);

    await sp.destroy();
  });

  it('checks table existence with hasTable', async () => {
    const sp = new SessionScratchpad('session-4');
    expect(sp.hasTable('missing')).toBe(false);

    await sp.saveTable('present', [{ a: 1 }]);
    expect(sp.hasTable('present')).toBe(true);
    expect(sp.hasTable('missing')).toBe(false);

    await sp.destroy();
  });

  it('drops a table', async () => {
    const sp = new SessionScratchpad('session-5');
    await sp.saveTable('temp', [{ val: 42 }]);
    expect(sp.hasTable('temp')).toBe(true);

    await sp.dropTable('temp');
    expect(sp.hasTable('temp')).toBe(false);
    expect(sp.listTables()).toHaveLength(0);

    await sp.destroy();
  });

  it('throws when dropping a non-existent table', async () => {
    const sp = new SessionScratchpad('session-6');
    await expect(sp.dropTable('ghost')).rejects.toThrow('not found');
    await sp.destroy();
  });

  it('throws when loading a non-existent table', async () => {
    const sp = new SessionScratchpad('session-7');
    await expect(sp.loadTable('ghost')).rejects.toThrow('not found');
    await sp.destroy();
  });

  it('enforces maxTables limit', async () => {
    const sp = new SessionScratchpad('session-8', { maxTables: 2 });
    await sp.saveTable('t1', [{ a: 1 }]);
    await sp.saveTable('t2', [{ b: 2 }]);

    await expect(sp.saveTable('t3', [{ c: 3 }])).rejects.toThrow('limit');

    await sp.destroy();
  });

  it('enforces maxRowsPerTable limit', async () => {
    const sp = new SessionScratchpad('session-9', { maxRowsPerTable: 5 });
    const bigRows = Array.from({ length: 6 }, (_, i) => ({ i }));

    await expect(sp.saveTable('big', bigRows)).rejects.toThrow('limit');

    await sp.destroy();
  });

  it('enforces maxSizeBytes limit', async () => {
    const sp = new SessionScratchpad('session-10', { maxSizeBytes: 50 });
    // Each row serialized is well over 50 bytes total
    const rows = Array.from({ length: 10 }, (_, i) => ({ key: `value_${i}_padding` }));

    await expect(sp.saveTable('fat', rows)).rejects.toThrow('limit');

    await sp.destroy();
  });

  it('allows overwriting an existing table without hitting maxTables', async () => {
    const sp = new SessionScratchpad('session-11', { maxTables: 1 });
    await sp.saveTable('only', [{ v: 1 }]);

    // Overwriting the same table should succeed even though maxTables is 1
    const meta = await sp.saveTable('only', [{ v: 2 }, { v: 3 }]);
    expect(meta.rowCount).toBe(2);

    await sp.destroy();
  });

  it('rejects invalid table names', async () => {
    const sp = new SessionScratchpad('session-12');
    await expect(sp.saveTable('123bad', [{ a: 1 }])).rejects.toThrow('Invalid table name');
    await expect(sp.saveTable('has space', [{ a: 1 }])).rejects.toThrow('Invalid table name');
    await expect(sp.saveTable('', [{ a: 1 }])).rejects.toThrow('Invalid table name');
    await sp.destroy();
  });

  it('throws on query (DuckDB not integrated)', async () => {
    const sp = new SessionScratchpad('session-13');
    await expect(sp.query('SELECT 1')).rejects.toThrow('DuckDB');
    await sp.destroy();
  });

  it('reports size estimate', async () => {
    const sp = new SessionScratchpad('session-14');
    expect(sp.getSizeEstimate()).toBe(0);

    await sp.saveTable('data', sampleRows);
    expect(sp.getSizeEstimate()).toBeGreaterThan(0);

    await sp.destroy();
  });

  it('throws after destroy', async () => {
    const sp = new SessionScratchpad('session-15');
    await sp.saveTable('data', [{ a: 1 }]);
    await sp.destroy();

    expect(sp.isDestroyed).toBe(true);
    expect(() => sp.hasTable('data')).toThrow('destroyed');
    await expect(sp.loadTable('data')).rejects.toThrow('destroyed');
    await expect(sp.saveTable('x', [])).rejects.toThrow('destroyed');
  });

  it('handles empty rows gracefully', async () => {
    const sp = new SessionScratchpad('session-16');
    const meta = await sp.saveTable('empty', []);
    expect(meta.rowCount).toBe(0);
    expect(meta.columns).toEqual([]);

    const loaded = await sp.loadTable('empty');
    expect(loaded).toEqual([]);

    await sp.destroy();
  });
});
