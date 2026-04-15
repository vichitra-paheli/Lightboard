import type { QueryIR } from '@lightboard/query-ir';

/** Configuration for connecting to a data source. */
export interface ConnectorConfig {
  /** Connector type identifier (e.g. 'postgres', 'mysql'). */
  type: string;
  /** Display name for the connection. */
  name: string;
  /** Connection-specific configuration (host, port, database, etc.). */
  connection: Record<string, unknown>;
  /** Connection pool settings. */
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMs?: number;
    connectionTimeoutMs?: number;
  };
}

/** Column metadata from schema introspection. */
export interface ColumnMetadata {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string | null;
}

/** Foreign key relationship metadata. */
export interface RelationshipMetadata {
  constraintName: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
}

/** Table metadata from schema introspection. */
export interface TableMetadata {
  name: string;
  schema: string;
  columns: ColumnMetadata[];
  rowCount?: number;
}

/** Full schema metadata returned by introspection. */
export interface SchemaMetadata {
  tables: TableMetadata[];
  relationships: RelationshipMetadata[];
}

/** Options for query execution. */
export interface QueryOptions {
  /** Query timeout in milliseconds. */
  timeoutMs?: number;
  /** Maximum rows to return. */
  limit?: number;
  /** Template variables to interpolate before execution. */
  variables?: Record<string, string | number | boolean | null>;
}

/** Result of a health check. */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  message?: string;
}

/** Declares what operations a connector supports. */
export interface ConnectorCapabilities {
  /** Supports filtering (WHERE). */
  filter: boolean;
  /** Supports aggregation (GROUP BY + aggregate functions). */
  aggregation: boolean;
  /** Supports ordering (ORDER BY). */
  ordering: boolean;
  /** Supports LIMIT/OFFSET. */
  pagination: boolean;
  /** Supports JOINs. */
  joins: boolean;
  /** Supports time range filtering. */
  timeRange: boolean;
  /** Supports streaming results. */
  streaming: boolean;
}

/** Query result as JSON rows — simpler alternative to Arrow for small result sets. */
export interface JsonResult {
  /** Column metadata. */
  columns: { name: string; type: string }[];
  /** Result rows as key-value objects. */
  rows: Record<string, unknown>[];
  /** Total number of rows returned. */
  rowCount: number;
}

/** Query result as serialized Arrow IPC buffer. */
export interface ArrowResult {
  /** Arrow IPC buffer containing the result data. */
  buffer: Uint8Array;
  /** Number of rows in the result. */
  rowCount: number;
  /** Number of columns in the result. */
  columnCount: number;
}

/** A single Arrow record batch for streaming. */
export interface ArrowRecordBatch {
  /** Arrow IPC buffer for this batch. */
  buffer: Uint8Array;
  /** Number of rows in this batch. */
  rowCount: number;
}

/**
 * The Connector interface — the adapter contract for all data sources.
 * Every data source (Postgres, MySQL, ClickHouse, REST, etc.) implements this.
 */
export interface Connector {
  /** Connector type identifier. */
  readonly type: string;

  /** Establish the connection and initialize the pool. */
  connect(config: ConnectorConfig): Promise<void>;

  /** Return schema metadata (tables, columns, relationships). */
  introspect(): Promise<SchemaMetadata>;

  /** Execute a QueryIR and return the full result as Arrow IPC. */
  query(ir: QueryIR, options?: QueryOptions): Promise<ArrowResult>;

  /** Execute a QueryIR and stream results as Arrow record batches. */
  stream(ir: QueryIR, options?: QueryOptions): AsyncIterable<ArrowRecordBatch>;

  /** Execute a raw SQL query and return JSON rows. Optional — not all connectors support raw SQL. */
  querySQL?(sql: string, params?: unknown[], options?: QueryOptions): Promise<JsonResult>;

  /** Check if the connection is alive. */
  healthCheck(): Promise<HealthCheckResult>;

  /** Declare what operations this connector supports. */
  capabilities(): ConnectorCapabilities;

  /** Close the connection and release resources. */
  disconnect(): Promise<void>;
}
