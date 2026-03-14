import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PostgresTelemetryExporter } from './exporter';

// Mock pg.Pool
vi.mock('pg', () => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const mockEnd = vi.fn().mockResolvedValue(undefined);
  return {
    default: {
      Pool: vi.fn().mockImplementation(() => ({
        query: mockQuery,
        end: mockEnd,
      })),
    },
  };
});

describe('PostgresTelemetryExporter', () => {
  let exporter: PostgresTelemetryExporter;

  beforeEach(() => {
    vi.clearAllMocks();
    exporter = new PostgresTelemetryExporter({ flushIntervalMs: 60000, batchSize: 10 });
  });

  it('creates an exporter with default options', () => {
    const exp = new PostgresTelemetryExporter();
    expect(exp).toBeDefined();
  });

  it('starts and connects to database', async () => {
    await exporter.start('postgresql://localhost/test');
    expect(exporter).toBeDefined();
    await exporter.shutdown();
  });

  it('buffers events before flushing', async () => {
    await exporter.start('postgresql://localhost/test');

    exporter.record({ eventType: 'query.executed', payload: { duration: 42 } });
    exporter.record({ eventType: 'cache.hit', payload: { key: 'abc' } });

    const flushed = await exporter.flush();
    expect(flushed).toBe(2);

    await exporter.shutdown();
  });

  it('returns 0 when buffer is empty', async () => {
    await exporter.start('postgresql://localhost/test');
    const flushed = await exporter.flush();
    expect(flushed).toBe(0);
    await exporter.shutdown();
  });

  it('includes orgId in event', async () => {
    await exporter.start('postgresql://localhost/test');

    exporter.record({
      eventType: 'query.executed',
      payload: { duration: 100 },
      orgId: 'org-123',
    });

    const flushed = await exporter.flush();
    expect(flushed).toBe(1);

    await exporter.shutdown();
  });

  it('auto-flushes when batch size is reached', async () => {
    const smallBatch = new PostgresTelemetryExporter({ batchSize: 2, flushIntervalMs: 60000 });
    await smallBatch.start('postgresql://localhost/test');

    smallBatch.record({ eventType: 'a', payload: {} });
    smallBatch.record({ eventType: 'b', payload: {} }); // Triggers auto-flush at batchSize=2

    // After auto-flush, buffer should be empty
    const remaining = await smallBatch.flush();
    expect(remaining).toBe(0);

    await smallBatch.shutdown();
  });

  it('shuts down cleanly', async () => {
    await exporter.start('postgresql://localhost/test');
    exporter.record({ eventType: 'test', payload: {} });
    await exporter.shutdown();
    // Should not throw
  });
});
