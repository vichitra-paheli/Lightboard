import { dataSources } from '@lightboard/db/schema';
import { decryptCredentials } from '@lightboard/db/crypto';
import { translateIR } from '@lightboard/connector-postgres';
import { queryIRSchema } from '@lightboard/query-ir';
import { eq, and } from 'drizzle-orm';
import pg from 'pg';
import type { Database } from '@lightboard/db';

/** Connection configuration for a data source. */
export interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/** Schema introspection result. */
export interface SchemaInfo {
  tables: {
    name: string;
    schema: string;
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      primaryKey: boolean;
    }[];
  }[];
}

/** Query execution result. */
export interface QueryResult {
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

/** DDL keywords that should be rejected for safety. */
const DDL_KEYWORDS = ['DROP', 'ALTER', 'TRUNCATE', 'DELETE', 'UPDATE', 'INSERT', 'CREATE', 'GRANT', 'REVOKE'];

/** Default row limit for unbounded queries. */
const DEFAULT_LIMIT = 1000;

/** Maximum rows returned before truncation. */
const MAX_ROWS = 10000;

/** Statement timeout in seconds. */
const STATEMENT_TIMEOUT_MS = 30000;

const INTROSPECT_COLUMNS = `
  SELECT
    c.table_schema,
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
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

/**
 * Resolves a data source record from the database and decrypts its connection credentials.
 * Throws if the data source is not found or credentials cannot be decrypted.
 */
export async function getDataSourceConnection(
  db: Database,
  orgId: string,
  sourceId: string,
): Promise<ConnectionConfig> {
  const results = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.id, sourceId), eq(dataSources.orgId, orgId)));

  const source = results[0];
  if (!source) {
    throw new DataSourceError('Data source not found', 'not_found');
  }

  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new DataSourceError('Encryption key not configured', 'config');
  }

  let connection: Record<string, string | undefined>;
  try {
    connection = JSON.parse(decryptCredentials(masterKey, orgId, source.credentials));
  } catch {
    throw new DataSourceError('Failed to decrypt credentials', 'config');
  }

  return {
    host: connection.host ?? 'localhost',
    port: parseInt(connection.port ?? '5432', 10),
    database: connection.database ?? '',
    user: connection.user ?? '',
    password: connection.password ?? '',
  };
}

/**
 * Introspects a data source schema, returning tables and columns.
 * Creates a short-lived connection pool for the introspection query.
 */
export async function introspectSchema(connection: ConnectionConfig): Promise<SchemaInfo> {
  const pool = new pg.Pool({
    ...connection,
    connectionTimeoutMillis: 5000,
    max: 1,
  });

  try {
    const columnsResult = await pool.query(INTROSPECT_COLUMNS);

    const tableMap = new Map<string, SchemaInfo['tables'][0]>();

    for (const row of columnsResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, {
          name: row.table_name,
          schema: row.table_schema,
          columns: [],
        });
      }
      tableMap.get(key)!.columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        primaryKey: row.is_primary_key === true || row.is_primary_key === 't',
      });
    }

    return { tables: [...tableMap.values()] };
  } catch (err) {
    throw classifyConnectionError(err);
  } finally {
    await pool.end();
  }
}

/**
 * Validates and executes a QueryIR against a data source.
 * Enforces safety guardrails: read-only transactions, statement timeouts,
 * default limits, and DDL rejection.
 */
export async function executeQueryIR(
  connection: ConnectionConfig,
  rawQueryIR: Record<string, unknown>,
): Promise<QueryResult> {
  // Validate QueryIR with zod
  const parseResult = queryIRSchema.safeParse(rawQueryIR);
  if (!parseResult.success) {
    throw new DataSourceError(
      `Invalid QueryIR: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      'validation',
    );
  }

  const queryIR = parseResult.data;

  // Safety: inject default limit if no limit and no aggregation
  if (queryIR.limit === undefined && queryIR.aggregations.length === 0) {
    queryIR.limit = DEFAULT_LIMIT;
  }

  // Translate to SQL
  const { sql, params } = translateIR(queryIR);

  // Safety: check for DDL keywords in the generated SQL
  checkForDDL(sql);

  const pool = new pg.Pool({
    ...connection,
    connectionTimeoutMillis: 5000,
    max: 1,
  });

  const startTime = performance.now();
  const client = await pool.connect();

  try {
    // Read-only transaction with timeout
    await client.query('BEGIN READ ONLY');
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    const result = await client.query(sql, params);

    await client.query('COMMIT');

    const executionTimeMs = Math.round(performance.now() - startTime);

    // Column metadata
    const columns = result.fields.map((f) => ({
      name: f.name,
      type: mapPgDataTypeId(f.dataTypeID),
    }));

    // Truncate if too many rows
    const rows = result.rows.length > MAX_ROWS
      ? result.rows.slice(0, MAX_ROWS)
      : result.rows;

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore rollback errors */ }
    throw classifyConnectionError(err);
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Executes a raw SELECT SQL query with safety guardrails.
 * Used as a fallback when QueryIR can't express complex joins.
 * Enforces: read-only transaction, statement timeout, DDL rejection, row limit.
 */
export async function executeRawSQL(
  connection: ConnectionConfig,
  sql: string,
): Promise<QueryResult> {
  const trimmed = sql.trim();
  if (!trimmed.toUpperCase().startsWith('SELECT')) {
    throw new DataSourceError('Only SELECT queries are allowed', 'validation');
  }
  checkForDDL(trimmed);

  // Inject LIMIT if not present
  if (!trimmed.toUpperCase().includes('LIMIT')) {
    const limited = `${trimmed} LIMIT ${DEFAULT_LIMIT}`;
    return executeRawSQLInternal(connection, limited);
  }
  return executeRawSQLInternal(connection, trimmed);
}

async function executeRawSQLInternal(
  connection: ConnectionConfig,
  sql: string,
): Promise<QueryResult> {
  const pool = new pg.Pool({ ...connection, connectionTimeoutMillis: 5000, max: 1 });
  const startTime = performance.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await client.query(sql);
    await client.query('COMMIT');

    const executionTimeMs = Math.round(performance.now() - startTime);
    const columns = result.fields.map((f) => ({ name: f.name, type: mapPgDataTypeId(f.dataTypeID) }));
    const rows = result.rows.length > MAX_ROWS ? result.rows.slice(0, MAX_ROWS) : result.rows;
    return { columns, rows, rowCount: rows.length, executionTimeMs };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw classifyConnectionError(err);
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Checks SQL for DDL keywords as a secondary safety measure.
 * The read-only transaction is the primary defense.
 */
function checkForDDL(sql: string): void {
  const upper = sql.toUpperCase();
  for (const keyword of DDL_KEYWORDS) {
    // Check for standalone keyword (not as part of a column name)
    const regex = new RegExp(`\\b${keyword}\\b`);
    if (regex.test(upper) && !upper.startsWith('SELECT')) {
      throw new DataSourceError(
        `Query contains disallowed operation: ${keyword}`,
        'validation',
      );
    }
  }
}

/**
 * Maps PostgreSQL OID data type IDs to human-readable type names.
 * Falls back to 'text' for unknown types.
 */
function mapPgDataTypeId(oid: number): string {
  const typeMap: Record<number, string> = {
    16: 'boolean',
    20: 'bigint',
    21: 'smallint',
    23: 'integer',
    25: 'text',
    700: 'real',
    701: 'double precision',
    1042: 'character',
    1043: 'character varying',
    1082: 'date',
    1114: 'timestamp without time zone',
    1184: 'timestamp with time zone',
    1700: 'numeric',
  };
  return typeMap[oid] ?? 'text';
}

/** Error types for data source operations. */
export type DataSourceErrorType =
  | 'not_found'
  | 'config'
  | 'validation'
  | 'connection'
  | 'auth'
  | 'timeout'
  | 'query';

/** Structured error for data source operations with user-friendly messages. */
export class DataSourceError extends Error {
  constructor(
    message: string,
    public readonly type: DataSourceErrorType,
  ) {
    super(message);
    this.name = 'DataSourceError';
  }
}

/**
 * Classifies a raw database/connection error into a structured DataSourceError
 * with a user-friendly message.
 */
function classifyConnectionError(err: unknown): DataSourceError {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('ECONNREFUSED') || message.includes('connect ETIMEDOUT')) {
    return new DataSourceError(
      'Could not connect to data source. Check that it is running and accessible.',
      'connection',
    );
  }

  if (message.includes('password authentication failed') || message.includes('no pg_hba.conf entry')) {
    return new DataSourceError(
      'Authentication failed for data source. Check credentials in Data Sources settings.',
      'auth',
    );
  }

  if (message.includes('statement timeout') || message.includes('canceling statement')) {
    return new DataSourceError(
      'Query timed out after 30 seconds. Try a simpler query or add filters.',
      'timeout',
    );
  }

  if (message.includes('column') && message.includes('does not exist')) {
    return new DataSourceError(message, 'query');
  }

  if (message.includes('relation') && message.includes('does not exist')) {
    return new DataSourceError(message, 'query');
  }

  return new DataSourceError(
    `Query failed: ${message}`,
    'query',
  );
}
