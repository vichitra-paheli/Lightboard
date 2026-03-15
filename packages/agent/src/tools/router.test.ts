import { describe, expect, it, vi } from 'vitest';
import { ToolRouter, type ToolContext } from './router';

function createMockContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({
      tables: [{ name: 'events', columns: [{ name: 'id', type: 'integer' }] }],
    }),
    executeQuery: vi.fn().mockResolvedValue({
      rows: [{ count: 42 }],
      rowCount: 1,
    }),
  };
}

describe('ToolRouter', () => {
  it('routes get_schema calls', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    const result = await router.execute('get_schema', { source_id: 'pg-main' });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('events');
    expect(ctx.getSchema).toHaveBeenCalledWith('pg-main');
  });

  it('routes execute_query calls', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    const result = await router.execute('execute_query', {
      source_id: 'pg-main',
      query_ir: { source: 'pg-main', table: 'events' },
    });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('42');
  });

  it('routes create_view calls', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    const result = await router.execute('create_view', {
      view_spec: {
        query: { source: 'pg-main', table: 'events' },
        chart: { type: 'bar-chart', config: { xField: 'category', yFields: ['count'] } },
      },
    });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.viewId).toBeDefined();
    expect(parsed.viewSpec.chart.type).toBe('bar-chart');
  });

  it('routes modify_view calls', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    // First create a view
    const createResult = await router.execute('create_view', {
      view_spec: {
        query: { source: 'pg-main', table: 'events' },
        chart: { type: 'bar-chart', config: {} },
        title: 'Original',
      },
    });
    const { viewId } = JSON.parse(createResult.content);

    // Then modify it
    const modifyResult = await router.execute('modify_view', {
      view_id: viewId,
      patch: { title: 'Updated Title' },
    });
    expect(modifyResult.isError).toBe(false);
    const parsed = JSON.parse(modifyResult.content);
    expect(parsed.viewSpec.title).toBe('Updated Title');
  });

  it('returns error for modify_view with unknown view', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    const result = await router.execute('modify_view', {
      view_id: 'nonexistent',
      patch: { title: 'x' },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not found');
  });

  it('returns error for unknown tool', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    const result = await router.execute('unknown_tool', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not available');
  });

  it('returns error for invalid get_schema input', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    const result = await router.execute('get_schema', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Invalid input');
  });

  it('catches handler errors and returns them', async () => {
    const ctx = createMockContext();
    (ctx.getSchema as any).mockRejectedValue(new Error('Connection failed'));
    const router = new ToolRouter(ctx);

    const result = await router.execute('get_schema', { source_id: 'broken' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Connection failed');
  });
});
