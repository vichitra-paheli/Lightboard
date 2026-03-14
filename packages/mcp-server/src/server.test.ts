import { describe, expect, it, vi } from 'vitest';
import { createMCPServer } from './server';
import type { MCPContext } from './types';

function mockContext(): MCPContext {
  return {
    listDataSources: vi.fn().mockResolvedValue([]),
    getSchema: vi.fn().mockResolvedValue({ tables: [], relationships: [] }),
    executeQuery: vi.fn().mockResolvedValue({ rowCount: 0, columnNames: [], rows: [] }),
    createView: vi.fn().mockResolvedValue({ viewId: 'v1', chartType: 'table' }),
    getCurrentState: vi.fn().mockResolvedValue({ dataSources: [], currentView: null, user: null }),
  };
}

describe('createMCPServer', () => {
  it('creates a server instance', () => {
    const server = createMCPServer(mockContext());
    expect(server).toBeDefined();
  });

  it('server has tool registration capabilities', () => {
    const server = createMCPServer(mockContext());
    // The server should have registered tools via server.tool()
    expect(typeof server.tool).toBe('function');
  });
});
