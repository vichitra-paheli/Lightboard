import type { ConnectionConfig } from './types';
import pg from 'pg';

/** Enriched table metadata for LLM context. */
export interface EnrichedTable {
  name: string;
  schema: string;
  rowCount: number;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
  }[];
  sampleValues: Record<string, unknown[]>;
  dateRanges: Record<string, { min: string; max: string }>;
}

/** Foreign key relationship. */
export interface Relationship {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
}

/** Complete bootstrapped schema context. */
export interface SchemaContext {
  tables: EnrichedTable[];
  relationships: Relationship[];
  generatedAt: string;
}

/** SQL: tables with row counts from pg_class (more reliable than pg_stat which requires ANALYZE). */
const TABLES_WITH_COUNTS = `
  SELECT
    t.table_schema,
    t.table_name,
    COALESCE(c.reltuples, 0)::bigint AS row_count
  FROM information_schema.tables t
  LEFT JOIN pg_class c
    ON c.relname = t.table_name
  LEFT JOIN pg_namespace n
    ON n.oid = c.relnamespace AND n.nspname = t.table_schema
  WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
    AND t.table_type = 'BASE TABLE'
  ORDER BY c.reltuples DESC NULLS LAST
`;

/** SQL: columns with PKs. */
const COLUMNS = `
  SELECT
    c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable,
    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
  FROM information_schema.columns c
  LEFT JOIN (
    SELECT kcu.table_schema, kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
  ) pk ON c.table_schema = pk.table_schema
    AND c.table_name = pk.table_name AND c.column_name = pk.column_name
  WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY c.table_schema, c.table_name, c.ordinal_position
`;

/** SQL: foreign key relationships. */
const RELATIONSHIPS = `
  SELECT
    kcu.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
`;

/**
 * Generates an enriched schema context optimized for LLM consumption.
 * Collects: table/column metadata, row counts, foreign keys,
 * sample values for low-cardinality columns, and date ranges.
 */
export async function generateSchemaContext(connection: ConnectionConfig): Promise<SchemaContext> {
  const pool = new pg.Pool({
    ...connection,
    connectionTimeoutMillis: 5000,
    max: 2,
  });

  try {
    // Parallel: tables with counts, columns, relationships
    const [tablesResult, columnsResult, relsResult] = await Promise.all([
      pool.query(TABLES_WITH_COUNTS),
      pool.query(COLUMNS),
      pool.query(RELATIONSHIPS),
    ]);

    // Build table map
    const tableMap = new Map<string, EnrichedTable>();
    for (const row of tablesResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      tableMap.set(key, {
        name: row.table_name,
        schema: row.table_schema,
        rowCount: parseInt(row.row_count, 10) || 0,
        columns: [],
        sampleValues: {},
        dateRanges: {},
      });
    }

    // Attach columns
    for (const row of columnsResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      const table = tableMap.get(key);
      if (table) {
        table.columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          primaryKey: row.is_primary_key === true || row.is_primary_key === 't',
        });
      }
    }

    // Relationships
    const relationships: Relationship[] = relsResult.rows.map((r) => ({
      sourceTable: r.source_table,
      sourceColumn: r.source_column,
      targetTable: r.target_table,
      targetColumn: r.target_column,
    }));

    // Enrich tables with sample values and date ranges (parallel, bounded)
    const tables = [...tableMap.values()];
    await Promise.all(tables.map((t) => enrichTable(pool, t)));

    return {
      tables,
      relationships,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await pool.end();
  }
}

/**
 * Enriches a single table with sample values for low-cardinality text columns
 * and date ranges for timestamp columns.
 */
async function enrichTable(pool: pg.Pool, table: EnrichedTable): Promise<void> {
  if (table.rowCount === 0) return;

  const textCols = table.columns.filter(
    (c) => (c.type === 'text' || c.type === 'character varying' || c.type === 'USER-DEFINED') && !c.primaryKey,
  );
  const dateCols = table.columns.filter(
    (c) => c.type.includes('timestamp') || c.type === 'date',
  );

  if (textCols.length === 0 && dateCols.length === 0) return;

  const queries: Promise<void>[] = [];

  // Sample distinct values for text columns (up to 15 values each)
  for (const col of textCols.slice(0, 5)) {
    queries.push(
      pool
        .query(
          `SELECT DISTINCT "${col.name}" AS val FROM "${table.name}" WHERE "${col.name}" IS NOT NULL LIMIT 15`,
        )
        .then((r) => {
          if (r.rows.length > 0 && r.rows.length <= 15) {
            table.sampleValues[col.name] = r.rows.map((row) => row.val);
          }
        })
        .catch(() => {}),
    );
  }

  // Date ranges for timestamp columns
  for (const col of dateCols.slice(0, 3)) {
    queries.push(
      pool
        .query(
          `SELECT MIN("${col.name}") AS min_val, MAX("${col.name}") AS max_val FROM "${table.name}"`,
        )
        .then((r) => {
          if (r.rows[0]?.min_val && r.rows[0]?.max_val) {
            table.dateRanges[col.name] = {
              min: String(r.rows[0].min_val),
              max: String(r.rows[0].max_val),
            };
          }
        })
        .catch(() => {}),
    );
  }

  await Promise.all(queries);
}

/**
 * Renders a SchemaContext as a compact markdown document optimized for LLM system prompts.
 * Designed to stay under ~4K tokens for most schemas.
 */
export function renderSchemaContext(ctx: SchemaContext): string {
  const lines: string[] = ['## Database Schema\n'];

  // Relationship index for quick lookup
  const relsByTable = new Map<string, Relationship[]>();
  for (const rel of ctx.relationships) {
    const existing = relsByTable.get(rel.sourceTable) ?? [];
    existing.push(rel);
    relsByTable.set(rel.sourceTable, existing);
  }

  for (const table of ctx.tables) {
    lines.push(`### ${table.name} (${table.rowCount.toLocaleString()} rows)`);

    // Columns
    for (const col of table.columns) {
      const flags = [
        col.primaryKey ? 'PK' : '',
        col.nullable ? 'nullable' : '',
      ].filter(Boolean).join(', ');
      const flagStr = flags ? ` (${flags})` : '';
      lines.push(`- ${col.name}: ${col.type}${flagStr}`);
    }

    // Foreign keys from this table
    const rels = relsByTable.get(table.name);
    if (rels && rels.length > 0) {
      lines.push('Joins:');
      for (const rel of rels) {
        lines.push(`- ${table.name}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn}`);
      }
    }

    // Sample values
    const sampleEntries = Object.entries(table.sampleValues);
    if (sampleEntries.length > 0) {
      lines.push('Sample values:');
      for (const [col, vals] of sampleEntries) {
        const display = vals.slice(0, 10).map((v) => String(v)).join(', ');
        const suffix = vals.length > 10 ? `, ... (${vals.length} distinct)` : '';
        lines.push(`- ${col}: ${display}${suffix}`);
      }
    }

    // Date ranges
    const dateEntries = Object.entries(table.dateRanges);
    if (dateEntries.length > 0) {
      lines.push('Date ranges:');
      for (const [col, range] of dateEntries) {
        lines.push(`- ${col}: ${range.min} to ${range.max}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
