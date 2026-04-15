import { describe, expect, it, vi } from 'vitest';
import { ToolRouter, type ToolContext } from './router';

function createMockContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({
      tables: [{ name: 'events', columns: [{ name: 'id', type: 'integer' }] }],
    }),
    runSQL: vi.fn().mockResolvedValue({
      rows: [{ count: 42 }],
      rowCount: 1,
    }),
    describeTable: vi.fn().mockResolvedValue({
      columns: [{ name: 'id', type: 'integer' }],
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

  it('routes describe_table calls', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    const result = await router.execute('describe_table', {
      source_id: 'pg-main',
      table_name: 'events',
    });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('id');
    expect(ctx.describeTable).toHaveBeenCalledWith('pg-main', 'events');
  });

  it('routes create_view calls', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    const result = await router.execute('create_view', {
      title: 'Events by Category',
      sql: 'SELECT category, COUNT(*) FROM events GROUP BY category',
      html: '<html><body><h1>Chart</h1></body></html>',
    });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.viewId).toBeDefined();
    expect(parsed.viewSpec.html).toContain('<html>');
  });

  it('routes modify_view calls', async () => {
    const ctx = createMockContext();
    const router = new ToolRouter(ctx);

    // First create a view
    const createResult = await router.execute('create_view', {
      title: 'Original',
      sql: 'SELECT * FROM events',
      html: '<html><body>chart</body></html>',
    });
    const { viewId } = JSON.parse(createResult.content);

    // Then modify it
    const modifyResult = await router.execute('modify_view', {
      view_id: viewId,
      title: 'Updated Title',
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
      title: 'x',
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
