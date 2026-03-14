import { describe, expect, it } from 'vitest';
import { selectVisualization, type ColumnInfo } from './index';

describe('selectVisualization', () => {
  it('returns data-table for no columns', () => {
    const result = selectVisualization([]);
    expect(result.pluginId).toBe('data-table');
  });

  it('returns stat-card for single numeric column', () => {
    const cols: ColumnInfo[] = [{ name: 'count', type: 'numeric' }];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('stat-card');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('returns time-series-line for time + numeric', () => {
    const cols: ColumnInfo[] = [
      { name: 'timestamp', type: 'time' },
      { name: 'value', type: 'numeric' },
    ];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('time-series-line');
  });

  it('returns time-series-line for time + multiple numerics', () => {
    const cols: ColumnInfo[] = [
      { name: 'ts', type: 'time' },
      { name: 'cpu', type: 'numeric' },
      { name: 'memory', type: 'numeric' },
    ];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('time-series-line');
  });

  it('returns bar-chart for categorical + numeric', () => {
    const cols: ColumnInfo[] = [
      { name: 'country', type: 'categorical' },
      { name: 'population', type: 'numeric' },
    ];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('bar-chart');
  });

  it('returns bar-chart for categorical + multiple numerics', () => {
    const cols: ColumnInfo[] = [
      { name: 'product', type: 'categorical' },
      { name: 'sales', type: 'numeric' },
      { name: 'profit', type: 'numeric' },
    ];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('bar-chart');
  });

  it('prefers time-series-line over bar-chart when time + categorical + numeric', () => {
    const cols: ColumnInfo[] = [
      { name: 'ts', type: 'time' },
      { name: 'category', type: 'categorical' },
      { name: 'value', type: 'numeric' },
    ];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('time-series-line');
  });

  it('returns data-table for multiple numerics without pattern', () => {
    const cols: ColumnInfo[] = [
      { name: 'a', type: 'numeric' },
      { name: 'b', type: 'numeric' },
      { name: 'c', type: 'numeric' },
    ];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('data-table');
  });

  it('returns data-table for all categorical columns', () => {
    const cols: ColumnInfo[] = [
      { name: 'name', type: 'categorical' },
      { name: 'city', type: 'categorical' },
    ];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('data-table');
  });

  it('returns data-table for unknown types', () => {
    const cols: ColumnInfo[] = [
      { name: 'x', type: 'unknown' },
      { name: 'y', type: 'unknown' },
    ];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('data-table');
  });

  it('returns data-table for single categorical column', () => {
    const cols: ColumnInfo[] = [{ name: 'name', type: 'categorical' }];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('data-table');
  });

  it('returns data-table for boolean only', () => {
    const cols: ColumnInfo[] = [{ name: 'active', type: 'boolean' }];
    const result = selectVisualization(cols);
    expect(result.pluginId).toBe('data-table');
  });

  it('always returns a confidence score', () => {
    const cases: ColumnInfo[][] = [
      [],
      [{ name: 'x', type: 'numeric' }],
      [{ name: 'ts', type: 'time' }, { name: 'v', type: 'numeric' }],
    ];
    for (const cols of cases) {
      const result = selectVisualization(cols);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('always returns a reason', () => {
    const result = selectVisualization([{ name: 'x', type: 'numeric' }]);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
