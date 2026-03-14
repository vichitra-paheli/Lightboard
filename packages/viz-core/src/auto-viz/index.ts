import type { ColumnType } from '../panel/types';

/** Column metadata used for auto-viz selection. */
export interface ColumnInfo {
  name: string;
  type: ColumnType;
}

/** Result of auto-viz selection. */
export interface VizRecommendation {
  pluginId: string;
  confidence: number;
  reason: string;
}

const TIME_TYPES = new Set<ColumnType>(['time']);
const NUMERIC_TYPES = new Set<ColumnType>(['numeric']);
const CATEGORICAL_TYPES = new Set<ColumnType>(['categorical']);

/**
 * Selects the best visualization type based on column metadata.
 * Uses heuristic rules, not ML. The agent can override by specifying chart type explicitly.
 */
export function selectVisualization(columns: ColumnInfo[]): VizRecommendation {
  if (columns.length === 0) {
    return { pluginId: 'data-table', confidence: 0.5, reason: 'No columns provided' };
  }

  const timeColumns = columns.filter((c) => TIME_TYPES.has(c.type));
  const numericColumns = columns.filter((c) => NUMERIC_TYPES.has(c.type));
  const categoricalColumns = columns.filter((c) => CATEGORICAL_TYPES.has(c.type));

  // 1 numeric only → StatCard
  if (columns.length === 1 && numericColumns.length === 1) {
    return { pluginId: 'stat-card', confidence: 0.9, reason: 'Single numeric value' };
  }

  // 1 time + 1+ numeric → TimeSeriesLine
  if (timeColumns.length >= 1 && numericColumns.length >= 1) {
    return {
      pluginId: 'time-series-line',
      confidence: 0.85,
      reason: `Time column (${timeColumns[0]!.name}) with ${numericColumns.length} numeric series`,
    };
  }

  // 1 categorical + 1+ numeric → BarChart
  if (categoricalColumns.length >= 1 && numericColumns.length >= 1) {
    return {
      pluginId: 'bar-chart',
      confidence: 0.8,
      reason: `Categorical column (${categoricalColumns[0]!.name}) with ${numericColumns.length} numeric values`,
    };
  }

  // Only numeric columns (2+) → could be stat or table
  if (numericColumns.length >= 2 && columns.length === numericColumns.length) {
    return {
      pluginId: 'data-table',
      confidence: 0.6,
      reason: 'Multiple numeric columns without clear axis pattern',
    };
  }

  // Fallback → DataTable
  return {
    pluginId: 'data-table',
    confidence: 0.5,
    reason: 'No clear visualization pattern detected',
  };
}
