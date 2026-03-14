import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TelemetryConnector } from './connector';

// Mock pg.Pool
const mockQuery = vi.fn();
const mockEnd = vi.fn().mockResolvedValue(undefined);

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(() => ({
      query: mockQuery,
      end: mockEnd,
    })),
  },
}));

describe('TelemetryConnector', () => {
  let connector: TelemetryConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new TelemetryConnector();
  });

  it('has type "telemetry"', () => {
    expect(connector.type).toBe('telemetry');
  });

  it('connects to database', async () => {
    await connector.connect({
      type: 'telemetry',
      name: 'Telemetry',
      connection: { databaseUrl: 'postgresql://localhost/lightboard' },
    });
    // Should not throw
  });

  it('throws when querying before connecting', async () => {
    await expect(
      connector.query({
        source: 'telemetry',
        table: 'telemetry_events',
        select: [],
        aggregations: [],
        groupBy: [],
        orderBy: [],
        joins: [],
      }),
    ).rejects.toThrow('not connected');
  });

  it('introspects the telemetry schema', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'event_type', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'payload', data_type: 'jsonb', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ],
    });

    await connector.connect({
      type: 'telemetry',
      name: 'Telemetry',
      connection: { databaseUrl: 'postgresql://localhost/lightboard' },
    });

    const schema = await connector.introspect();
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0]!.name).toBe('telemetry_events');
    expect(schema.tables[0]!.columns).toHaveLength(4);
  });

  it('executes a query with filter', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ event_type: 'query.executed', payload: '{}' }],
      fields: [{ name: 'event_type' }, { name: 'payload' }],
    });

    await connector.connect({
      type: 'telemetry',
      name: 'Telemetry',
      connection: { databaseUrl: 'postgresql://localhost/lightboard' },
    });

    const result = await connector.query({
      source: 'telemetry',
      table: 'telemetry_events',
      select: [{ field: 'event_type' }, { field: 'payload' }],
      filter: { field: { field: 'event_type' }, operator: 'eq', value: 'query.executed' },
      aggregations: [],
      groupBy: [],
      orderBy: [],
      joins: [],
      limit: 100,
    });

    expect(result.rowCount).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE'),
      expect.arrayContaining(['query.executed']),
    );
  });

  it('declares capabilities correctly', async () => {
    const caps = connector.capabilities();
    expect(caps.filter).toBe(true);
    expect(caps.aggregation).toBe(true);
    expect(caps.joins).toBe(false);
    expect(caps.streaming).toBe(false);
    expect(caps.timeRange).toBe(true);
  });

  it('health check returns unhealthy when not connected', async () => {
    const result = await connector.healthCheck();
    expect(result.status).toBe('unhealthy');
  });

  it('disconnects cleanly', async () => {
    await connector.connect({
      type: 'telemetry',
      name: 'Telemetry',
      connection: { databaseUrl: 'postgresql://localhost/lightboard' },
    });
    await connector.disconnect();
    // Should not throw
  });
});
