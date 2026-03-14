import { describe, expect, it } from 'vitest';
import { ConnectorRegistry } from './registry';
import type { Connector } from './types';

function mockConnector(): Connector {
  return {
    type: 'mock',
    connect: async () => {},
    introspect: async () => ({ tables: [], relationships: [] }),
    query: async () => ({ buffer: new Uint8Array(), rowCount: 0, columnCount: 0 }),
    stream: async function* () {},
    healthCheck: async () => ({ status: 'healthy', latencyMs: 1 }),
    capabilities: () => ({
      filter: true,
      aggregation: true,
      ordering: true,
      pagination: true,
      joins: false,
      timeRange: false,
      streaming: false,
    }),
    disconnect: async () => {},
  };
}

describe('ConnectorRegistry', () => {
  it('registers and creates a connector', () => {
    const registry = new ConnectorRegistry();
    registry.register('mock', mockConnector);
    const connector = registry.create({ type: 'mock', name: 'test', connection: {} });
    expect(connector.type).toBe('mock');
  });

  it('throws on duplicate registration', () => {
    const registry = new ConnectorRegistry();
    registry.register('mock', mockConnector);
    expect(() => registry.register('mock', mockConnector)).toThrow('already registered');
  });

  it('throws on unknown type', () => {
    const registry = new ConnectorRegistry();
    expect(() => registry.create({ type: 'unknown', name: 'test', connection: {} })).toThrow(
      'Unknown connector type',
    );
  });

  it('checks if type exists', () => {
    const registry = new ConnectorRegistry();
    expect(registry.has('mock')).toBe(false);
    registry.register('mock', mockConnector);
    expect(registry.has('mock')).toBe(true);
  });

  it('lists registered types', () => {
    const registry = new ConnectorRegistry();
    registry.register('postgres', mockConnector);
    registry.register('mysql', mockConnector);
    expect(registry.types()).toEqual(['postgres', 'mysql']);
  });

  it('unregisters a type', () => {
    const registry = new ConnectorRegistry();
    registry.register('mock', mockConnector);
    expect(registry.unregister('mock')).toBe(true);
    expect(registry.has('mock')).toBe(false);
    expect(registry.unregister('mock')).toBe(false);
  });
});
