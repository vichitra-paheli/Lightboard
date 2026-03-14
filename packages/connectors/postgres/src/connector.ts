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
import { postgresConnectionSchema } from '@lightboard/connector-sdk';
import { interpolateVariables, type QueryIR } from '@lightboard/query-ir';
import pg from 'pg';
import Cursor from 'pg-cursor';
import { rowsToArrow, rowsToArrowBatch } from './arrow';
import { translateIR } from './translator';

const PG_TYPE_QUERY = `
  SELECT t.oid, t.typname
  FROM pg_type t
  JOIN pg_namespace n ON t.typnamespace = n.oid
  WHERE n.nspname = 'pg_catalog'
`;

const INTROSPECT_TABLES = `
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    AND table_type = 'BASE TABLE'
  ORDER BY table_schema, table_name
`;

const INTROSPECT_COLUMNS = `
  SELECT
    c.table_schema,
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
  FROM information_schema.columns c
  LEFT JOIN (
    SELECT kcu.table_schema, kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
  ) pk ON c.table_schema = pk.table_schema
    AND c.table_name = pk.table_name
    AND c.column_name = pk.column_name
  WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY c.table_schema, c.table_name, c.ordinal_position
`;

const INTROSPECT_RELATIONSHIPS = `
  SELECT
    tc.constraint_name,
    kcu.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
`;

const DEFAULT_BATCH_SIZE = 1000;

/** PostgreSQL connector implementing the Connector interface. */
export class PostgresConnector implements Connector {
  readonly type = 'postgres';
  private pool: pg.Pool | null = null;
  private typeMap = new Map<number, string>();

  /** Establish the connection pool and load type mappings. */
  async connect(config: ConnectorConfig): Promise<void> {
    const conn = postgresConnectionSchema.parse(config.connection);
    this.pool = new pg.Pool({
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      password: conn.password,
      ssl: conn.ssl ? { rejectUnauthorized: false } : false,
      min: config.pool?.min ?? 1,
      max: config.pool?.max ?? 10,
      idleTimeoutMillis: config.pool?.idleTimeoutMs ?? 30000,
      connectionTimeoutMillis: config.pool?.connectionTimeoutMs ?? 5000,
    });

    // Load pg type OID → name mapping for Arrow type conversion
    const result = await this.pool.query(PG_TYPE_QUERY);
    for (const row of result.rows) {
      this.typeMap.set(row.oid as number, row.typname as string);
    }
  }

  /** Return schema metadata from information_schema. */
  async introspect(): Promise<SchemaMetadata> {
    const pool = this.getPool();

    const [tablesResult, columnsResult, relsResult] = await Promise.all([
      pool.query(INTROSPECT_TABLES),
      pool.query(INTROSPECT_COLUMNS),
      pool.query(INTROSPECT_RELATIONSHIPS),
    ]);

    const tableMap = new Map<string, { name: string; schema: string; columns: any[] }>();

    for (const row of tablesResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      tableMap.set(key, {
        name: row.table_name,
        schema: row.table_schema,
        columns: [],
      });
    }

    for (const row of columnsResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      const table = tableMap.get(key);
      if (table) {
        table.columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          primaryKey: row.is_primary_key === true || row.is_primary_key === 't',
          defaultValue: row.column_default ?? null,
        });
      }
    }

    const relationships = relsResult.rows.map((row) => ({
      constraintName: row.constraint_name,
      sourceTable: row.source_table,
      sourceColumn: row.source_column,
      targetTable: row.target_table,
      targetColumn: row.target_column,
    }));

    return {
      tables: [...tableMap.values()],
      relationships,
    };
  }

  /** Execute a QueryIR and return the full result as Arrow IPC. */
  async query(ir: QueryIR, options?: QueryOptions): Promise<ArrowResult> {
    const pool = this.getPool();

    const resolved = options?.variables
      ? interpolateVariables(ir, options.variables)
      : ir;

    const { sql, params } = translateIR(resolved);
    const client = await pool.connect();

    try {
      if (options?.timeoutMs) {
        await client.query(`SET statement_timeout = ${options.timeoutMs}`);
      }

      const result = await client.query(sql, params);
      const fields = result.fields.map((f) => ({
        name: f.name,
        dataTypeID: f.dataTypeID,
        pgType: this.typeMap.get(f.dataTypeID) ?? 'text',
      }));

      return rowsToArrow(result.rows, fields);
    } finally {
      client.release();
    }
  }

  /** Stream QueryIR results as Arrow record batches. */
  async *stream(ir: QueryIR, options?: QueryOptions): AsyncIterable<ArrowRecordBatch> {
    const pool = this.getPool();

    const resolved = options?.variables
      ? interpolateVariables(ir, options.variables)
      : ir;

    const { sql, params } = translateIR(resolved);
    const client = await pool.connect();

    try {
      const cursor = client.query(new Cursor(sql, params));
      let fields: { name: string; dataTypeID: number; pgType: string }[] | null = null;
      const batchSize = DEFAULT_BATCH_SIZE;

      while (true) {
        const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
          cursor.read(batchSize, (err: Error | undefined, result: Record<string, unknown>[], pgResult: any) => {
            if (err) return reject(err);
            if (!fields && pgResult?.fields) {
              fields = pgResult.fields.map((f: any) => ({
                name: f.name,
                dataTypeID: f.dataTypeID,
                pgType: this.typeMap.get(f.dataTypeID) ?? 'text',
              }));
            }
            resolve(result);
          });
        });

        if (rows.length === 0) break;
        if (fields) {
          yield rowsToArrowBatch(rows, fields);
        }
      }

      cursor.close(() => {});
    } finally {
      client.release();
    }
  }

  /** Check if the connection is alive with SELECT 1. */
  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.pool) {
      return { status: 'unhealthy', latencyMs: 0, message: 'Not connected' };
    }

    const start = performance.now();
    try {
      await this.pool.query('SELECT 1');
      return { status: 'healthy', latencyMs: Math.round(performance.now() - start) };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - start),
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Declare full SQL pushdown capabilities. */
  capabilities(): ConnectorCapabilities {
    return {
      filter: true,
      aggregation: true,
      ordering: true,
      pagination: true,
      joins: true,
      timeRange: true,
      streaming: true,
    };
  }

  /** Close the connection pool. */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.typeMap.clear();
    }
  }

  /** Throws if not connected. */
  private ensureConnected(): void {
    if (!this.pool) {
      throw new Error('PostgresConnector is not connected. Call connect() first.');
    }
  }

  /** Returns the pool, throwing if not connected. */
  private getPool(): pg.Pool {
    this.ensureConnected();
    return this.pool!;
  }
}
