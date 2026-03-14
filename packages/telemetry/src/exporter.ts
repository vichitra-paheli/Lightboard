import pg from 'pg';
import type { TelemetryEvent } from './types';

/**
 * Local telemetry exporter that writes structured events to the
 * `telemetry.telemetry_events` table in Postgres.
 * Used in all deployment modes for local observability.
 */
export class PostgresTelemetryExporter {
  private pool: pg.Pool | null = null;
  private buffer: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly flushIntervalMs: number;
  private readonly batchSize: number;

  constructor(options?: { flushIntervalMs?: number; batchSize?: number }) {
    this.flushIntervalMs = options?.flushIntervalMs ?? 5000;
    this.batchSize = options?.batchSize ?? 100;
  }

  /** Connects to Postgres and starts the flush timer. */
  async start(databaseUrl: string): Promise<void> {
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  /** Queues a telemetry event for batch writing. */
  record(event: TelemetryEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  /** Flushes buffered events to Postgres. */
  async flush(): Promise<number> {
    if (this.buffer.length === 0 || !this.pool) return 0;

    const events = this.buffer.splice(0, this.batchSize);

    try {
      const values = events.map((e, i) => {
        const base = i * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      }).join(', ');

      const params = events.flatMap((e) => [
        e.orgId ?? null,
        e.eventType,
        JSON.stringify(e.payload),
      ]);

      await this.pool.query(
        `INSERT INTO telemetry.telemetry_events (org_id, event_type, payload) VALUES ${values}`,
        params,
      );

      return events.length;
    } catch (err) {
      // Re-buffer events on failure (best effort)
      this.buffer.unshift(...events);
      console.error('[telemetry] Failed to flush events:', err);
      return 0;
    }
  }

  /** Stops the flush timer and drains remaining events. */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
