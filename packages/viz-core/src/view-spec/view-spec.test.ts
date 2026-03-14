import { describe, expect, it } from 'vitest';
import { viewSpecSchema, controlSpecSchema } from './schema';

describe('viewSpecSchema', () => {
  it('validates a minimal ViewSpec', () => {
    const result = viewSpecSchema.safeParse({
      query: { source: 'pg', table: 'events' },
      chart: { type: 'data-table', config: {} },
    });
    expect(result.success).toBe(true);
  });

  it('validates a full ViewSpec with controls', () => {
    const result = viewSpecSchema.safeParse({
      title: 'Sales by Region',
      description: 'Bar chart showing total sales per region',
      query: {
        source: 'pg-main',
        table: 'orders',
        select: [{ field: 'region' }],
        aggregations: [{ function: 'sum', field: { field: 'amount' }, alias: 'total' }],
        groupBy: [{ field: 'region' }],
        filter: { field: { field: 'status' }, operator: 'eq', value: '$status' },
      },
      chart: {
        type: 'bar-chart',
        config: { xField: 'region', yFields: ['total'] },
      },
      controls: [
        {
          type: 'dropdown',
          label: 'Status',
          variable: 'status',
          options: [
            { label: 'Active', value: 'active' },
            { label: 'Completed', value: 'completed' },
          ],
          defaultValue: 'active',
        },
        {
          type: 'date_range',
          label: 'Time Period',
          variable: 'time_range',
          defaultValue: { from: 'now-30d', to: 'now' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects ViewSpec without query', () => {
    const result = viewSpecSchema.safeParse({
      chart: { type: 'bar-chart', config: {} },
    });
    expect(result.success).toBe(false);
  });

  it('rejects ViewSpec without chart', () => {
    const result = viewSpecSchema.safeParse({
      query: { source: 'pg', table: 'events' },
    });
    expect(result.success).toBe(false);
  });

  it('defaults controls to empty array', () => {
    const result = viewSpecSchema.safeParse({
      query: { source: 'pg', table: 'events' },
      chart: { type: 'data-table', config: {} },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.controls).toEqual([]);
    }
  });
});

describe('controlSpecSchema', () => {
  it('validates dropdown control', () => {
    const result = controlSpecSchema.safeParse({
      type: 'dropdown',
      label: 'Region',
      variable: 'region',
      options: [{ label: 'North', value: 'north' }],
    });
    expect(result.success).toBe(true);
  });

  it('validates date_range control', () => {
    const result = controlSpecSchema.safeParse({
      type: 'date_range',
      label: 'Period',
      variable: 'period',
      defaultValue: { from: 'now-7d', to: 'now' },
    });
    expect(result.success).toBe(true);
  });

  it('validates text_input control', () => {
    const result = controlSpecSchema.safeParse({
      type: 'text_input',
      label: 'Search',
      variable: 'search_term',
    });
    expect(result.success).toBe(true);
  });

  it('validates toggle control', () => {
    const result = controlSpecSchema.safeParse({
      type: 'toggle',
      label: 'Include archived',
      variable: 'include_archived',
      defaultValue: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid control type', () => {
    const result = controlSpecSchema.safeParse({
      type: 'slider',
      label: 'Value',
      variable: 'val',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing variable', () => {
    const result = controlSpecSchema.safeParse({
      type: 'dropdown',
      label: 'Region',
    });
    expect(result.success).toBe(false);
  });
});
