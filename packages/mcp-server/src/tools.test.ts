import { describe, expect, it, vi } from 'vitest';
import { createToolDefinitions } from './tools';
import type { MCPContext } from './types';

function mockContext(): MCPContext {
  return {
    listDataSources: vi.fn().mockResolvedValue([
      { id: 'pg-1', name: 'Production DB', type: 'postgres', status: 'healthy' },
      { id: 'pg-2', name: 'Analytics', type: 'postgres', status: 'unhealthy' },
    ]),
    getSchema: vi.fn().mockResolvedValue({
      tables: [
        {
          name: 'orders',
          schema: 'public',
          columns: [
            { name: 'id', type: 'integer', nullable: false, primaryKey: true },
            { name: 'amount', type: 'numeric', nullable: false, primaryKey: false },
            { name: 'status', type: 'varchar', nullable: true, primaryKey: false },
          ],
        },
      ],
      relationships: [],
    }),
    executeQuery: vi.fn().mockResolvedValue({
      rowCount: 3,
      columnNames: ['region', 'total'],
      rows: [
        { region: 'North', total: 5000 },
        { region: 'South', total: 3200 },
        { region: 'East', total: 4100 },
      ],
    }),
    createView: vi.fn().mockResolvedValue({
      viewId: 'view_123',
      title: 'Sales by Region',
      chartType: 'bar-chart',
    }),
    getCurrentState: vi.fn().mockResolvedValue({
      dataSources: [{ id: 'pg-1', name: 'Production DB', type: 'postgres', status: 'healthy' }],
      currentView: null,
      user: { id: 'user-1', email: 'admin@test.com', role: 'admin' },
    }),
  };
}

describe('MCP tools', () => {
  it('list_data_sources returns all sources', async () => {
    const tools = createToolDefinitions(mockContext());
    const result = await tools.list_data_sources.handler();

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('Production DB');
    expect(data[1].status).toBe('unhealthy');
  });

  it('get_schema returns table metadata', async () => {
    const ctx = mockContext();
    const tools = createToolDefinitions(ctx);
    const result = await tools.get_schema.handler({ source_id: 'pg-1' });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.tables).toHaveLength(1);
    expect(data.tables[0].name).toBe('orders');
    expect(data.tables[0].columns).toHaveLength(3);
    expect(ctx.getSchema).toHaveBeenCalledWith('pg-1');
  });

  it('execute_query returns results', async () => {
    const ctx = mockContext();
    const tools = createToolDefinitions(ctx);
    const queryIR = { source: 'pg-1', table: 'orders' };
    const result = await tools.execute_query.handler({ source_id: 'pg-1', query_ir: queryIR });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.rowCount).toBe(3);
    expect(data.rows).toHaveLength(3);
    expect(data.columnNames).toContain('region');
    expect(ctx.executeQuery).toHaveBeenCalledWith('pg-1', queryIR);
  });

  it('execute_query limits response to 50 rows', async () => {
    const ctx = mockContext();
    const bigResult = {
      rowCount: 100,
      columnNames: ['id'],
      rows: Array.from({ length: 100 }, (_, i) => ({ id: i })),
    };
    (ctx.executeQuery as ReturnType<typeof vi.fn>).mockResolvedValue(bigResult);

    const tools = createToolDefinitions(ctx);
    const result = await tools.execute_query.handler({ source_id: 'pg-1', query_ir: { source: 'pg-1', table: 'big' } });

    const data = JSON.parse(result.content[0]!.text);
    expect(data.rows).toHaveLength(50);
    expect(data.rowCount).toBe(100);
  });

  it('create_view returns view info', async () => {
    const ctx = mockContext();
    const tools = createToolDefinitions(ctx);
    const viewSpec = {
      query: { source: 'pg-1', table: 'orders' },
      chart: { type: 'bar-chart', config: { xField: 'region', yFields: ['total'] } },
    };
    const result = await tools.create_view.handler({ view_spec: viewSpec });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.viewId).toBe('view_123');
    expect(data.chartType).toBe('bar-chart');
    expect(ctx.createView).toHaveBeenCalledWith(viewSpec);
  });

  it('get_current_state returns app state', async () => {
    const tools = createToolDefinitions(mockContext());
    const result = await tools.get_current_state.handler();

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.dataSources).toHaveLength(1);
    expect(data.user.email).toBe('admin@test.com');
    expect(data.currentView).toBeNull();
  });

  it('handles errors gracefully in list_data_sources', async () => {
    const ctx = mockContext();
    (ctx.listDataSources as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection failed'));

    const tools = createToolDefinitions(ctx);
    const result = await tools.list_data_sources.handler();

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('DB connection failed');
  });

  it('handles errors gracefully in get_schema', async () => {
    const ctx = mockContext();
    (ctx.getSchema as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Source not found'));

    const tools = createToolDefinitions(ctx);
    const result = await tools.get_schema.handler({ source_id: 'bad' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Source not found');
  });

  it('handles errors gracefully in execute_query', async () => {
    const ctx = mockContext();
    (ctx.executeQuery as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Syntax error'));

    const tools = createToolDefinitions(ctx);
    const result = await tools.execute_query.handler({ source_id: 'pg-1', query_ir: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Syntax error');
  });

  it('all tools have descriptions', () => {
    const tools = createToolDefinitions(mockContext());
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.description.length, `${name} should have description`).toBeGreaterThan(10);
    }
  });

  it('all tools have input schemas', () => {
    const tools = createToolDefinitions(mockContext());
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.inputSchema, `${name} should have inputSchema`).toBeDefined();
    }
  });
});
