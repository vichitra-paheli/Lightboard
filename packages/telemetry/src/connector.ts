import type {
  ArrowRecordBatch,
  ArrowResult,
  Connector,
  ConnectorCapabilities,
  ConnectorConfig,
  HealthCheckResult,
  QueryOptions,
  SchemaMetadata,
} from '@lightboard/connector-sdk';
import { interpolateVariables, type QueryIR } from '@lightboard/query-ir';
import pg from 'pg';

/**
 * Built-in connector that queries the `telemetry` schema in Postgres.
 * This is Lightboard's dogfooding data source — visualize your own performance.
 */
export class TelemetryConnector implements Connector {
  readonly type = 'telemetry';
  private pool: pg.Pool | null = null;

  /** Connect to the Postgres database containing telemetry data. */
  async connect(config: ConnectorConfig): Promise<void> {
    const conn = config.connection as { databaseUrl: string };
    this.pool = new pg.Pool({
      connectionString: conn.databaseUrl,
      max: config.pool?.max ?? 3,
    });
  }

  /** Introspect the telemetry schema. */
  async introspect(): Promise<SchemaMetadata> {
    this.ensureConnected();

    const columnsResult = await this.pool!.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'telemetry' AND table_name = 'telemetry_events'
      ORDER BY ordinal_position
    `);

    return {
      tables: [{
        name: 'telemetry_events',
        schema: 'telemetry',
        columns: columnsResult.rows.map((row: Record<string, unknown>) => ({
          name: String(row.column_name),
          type: String(row.data_type),
          nullable: row.is_nullable === 'YES',
          primaryKey: row.column_name === 'id',
        })),
      }],
      relationships: [],
    };
  }

  /**
   * Execute a query against the telemetry schema.
   * Supports a subset of QueryIR — primarily filtering by event_type, org_id, and time range.
   */
  async query(ir: QueryIR, options?: QueryOptions): Promise<ArrowResult> {
    this.ensureConnected();

    const resolved = options?.variables
      ? interpolateVariables(ir, options.variables)
      : ir;

    const { sql, params } = this.buildSQL(resolved, options?.limit);
    const result = await this.pool!.query(sql, params);

    // Return raw JSON result wrapped as a simple Arrow-compatible structure
    // (Full Arrow conversion would use the postgres connector's arrow module)
    const buffer = new TextEncoder().encode(JSON.stringify(result.rows));
    return {
      buffer: new Uint8Array(buffer),
      rowCount: result.rows.length,
      columnCount: result.fields.length,
    };
  }

  /** Streaming is not supported for the telemetry connector. */
  async *stream(_ir: QueryIR, _options?: QueryOptions): AsyncIterable<ArrowRecordBatch> {
    throw new Error('TelemetryConnector does not support streaming');
  }

  /** Health check: verify the telemetry schema exists. */
  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.pool) {
      return { status: 'unhealthy', latencyMs: 0, message: 'Not connected' };
    }

    const start = performance.now();
    try {
      await this.pool.query('SELECT 1 FROM telemetry.telemetry_events LIMIT 0');
      return { status: 'healthy', latencyMs: Math.round(performance.now() - start) };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - start),
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Declare limited capabilities (no joins, basic filtering). */
  capabilities(): ConnectorCapabilities {
    return {
      filter: true,
      aggregation: true,
      ordering: true,
      pagination: true,
      joins: false,
      timeRange: true,
      streaming: false,
    };
  }

  /** Close the connection pool. */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /** Builds a SQL query for the telemetry schema from a QueryIR. */
  private buildSQL(ir: QueryIR, limit?: number): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    let paramIdx = 0;
    const addParam = (v: unknown) => { params.push(v); return `$${++paramIdx}`; };

    // SELECT
    const selectFields = ir.select.length > 0
      ? ir.select.map((f) => `"${f.field}"`).join(', ')
      : '*';

    let sql = `SELECT ${selectFields} FROM telemetry.telemetry_events`;

    // WHERE
    const conditions: string[] = [];
    if (ir.filter && 'field' in ir.filter) {
      if (ir.filter.operator === 'eq') {
        conditions.push(`"${ir.filter.field.field}" = ${addParam(ir.filter.value)}`);
      }
    }
    if (ir.timeRange) {
      conditions.push(`"${ir.timeRange.field.field}" >= ${addParam(ir.timeRange.from)}`);
      conditions.push(`"${ir.timeRange.field.field}" <= ${addParam(ir.timeRange.to)}`);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    // ORDER BY
    if (ir.orderBy.length > 0) {
      const orders = ir.orderBy.map((o) => `"${o.field.field}" ${o.direction.toUpperCase()}`);
      sql += ` ORDER BY ${orders.join(', ')}`;
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    // LIMIT
    const effectiveLimit = ir.limit ?? limit;
    if (effectiveLimit) {
      sql += ` LIMIT ${addParam(effectiveLimit)}`;
    }

    return { sql, params };
  }

  /** Throws if not connected. */
  private ensureConnected(): void {
    if (!this.pool) {
      throw new Error('TelemetryConnector is not connected. Call connect() first.');
    }
  }
}
