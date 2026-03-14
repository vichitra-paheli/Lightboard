import { DuckDBInstance } from '@duckdb/node-api';
import { tableFromArrays, tableFromIPC, tableToIPC } from 'apache-arrow';

/** Result from a compute query. */
export interface ComputeResult {
  /** Arrow IPC buffer containing the result data. */
  buffer: Uint8Array;
  /** Number of rows in the result. */
  rowCount: number;
  /** Column names in the result. */
  columnNames: string[];
}

/** Input for cross-source join: a named Arrow table. */
export interface ArrowTableInput {
  /** Table name to register in DuckDB. */
  name: string;
  /** Arrow IPC buffer containing the table data. */
  buffer: Uint8Array;
}

/**
 * DuckDB-based compute engine for Tier 2 computation.
 * Creates ephemeral in-memory instances per request for tenant isolation.
 * Input/output is always Apache Arrow IPC — no JSON data processing.
 */
export class ComputeEngine {
  /**
   * Executes a SQL query against an ephemeral DuckDB instance.
   * The instance is created and destroyed within this call.
   */
  async query(sql: string): Promise<ComputeResult> {
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();

    try {
      const reader = await connection.runAndReadAll(sql);
      return this.readerToResult(reader);
    } finally {
      connection.closeSync();
    }
  }

  /**
   * Registers Arrow IPC tables in DuckDB and executes a join query.
   * Useful for cross-source joins where data comes from different connectors.
   */
  async crossSourceJoin(tables: ArrowTableInput[], sql: string): Promise<ComputeResult> {
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();

    try {
      for (const table of tables) {
        await this.registerArrowTable(connection, table.name, table.buffer);
      }

      const reader = await connection.runAndReadAll(sql);
      return this.readerToResult(reader);
    } finally {
      connection.closeSync();
    }
  }

  /**
   * Loads a CSV file into DuckDB and returns the result as Arrow IPC.
   * Optionally executes a query against the loaded data.
   */
  async queryCSV(csvPath: string, sql?: string): Promise<ComputeResult> {
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();

    try {
      await connection.run(
        `CREATE TABLE csv_data AS SELECT * FROM read_csv_auto('${escapePath(csvPath)}')`,
      );

      const querySQL = sql ?? 'SELECT * FROM csv_data';
      const reader = await connection.runAndReadAll(querySQL);
      return this.readerToResult(reader);
    } finally {
      connection.closeSync();
    }
  }

  /**
   * Loads a Parquet file into DuckDB and returns the result as Arrow IPC.
   * Optionally executes a query against the loaded data.
   */
  async queryParquet(parquetPath: string, sql?: string): Promise<ComputeResult> {
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();

    try {
      await connection.run(
        `CREATE TABLE parquet_data AS SELECT * FROM read_parquet('${escapePath(parquetPath)}')`,
      );

      const querySQL = sql ?? 'SELECT * FROM parquet_data';
      const reader = await connection.runAndReadAll(querySQL);
      return this.readerToResult(reader);
    } finally {
      connection.closeSync();
    }
  }

  /**
   * Introspects a CSV file and returns its schema (column names and types).
   */
  async introspectCSV(csvPath: string): Promise<{ name: string; type: string }[]> {
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();

    try {
      const reader = await connection.runAndReadAll(
        `DESCRIBE SELECT * FROM read_csv_auto('${escapePath(csvPath)}')`,
      );
      const rows = reader.getRowObjects() as Record<string, unknown>[];
      return rows.map((row) => ({
        name: String(row['column_name'] ?? ''),
        type: String(row['column_type'] ?? ''),
      }));
    } finally {
      connection.closeSync();
    }
  }

  /**
   * Registers an Arrow IPC buffer as a named table in a DuckDB connection.
   * Converts Arrow data to SQL INSERT statements for DuckDB ingestion.
   */
  private async registerArrowTable(
    connection: Awaited<ReturnType<DuckDBInstance['connect']>>,
    name: string,
    buffer: Uint8Array,
  ): Promise<void> {
    const arrowTable = tableFromIPC(buffer);
    const fields = arrowTable.schema.fields;
    const numRows = arrowTable.numRows;

    if (numRows === 0 || fields.length === 0) {
      const colDefs = fields.length > 0
        ? fields.map((f) => `"${f.name}" VARCHAR`).join(', ')
        : '"_empty" VARCHAR';
      await connection.run(`CREATE TABLE "${name}" (${colDefs})`);
      return;
    }

    // Build CREATE TABLE + INSERT using VALUES
    const rows = arrowTable.toArray();
    const columns = fields.map((f) => f.name);

    // Infer SQL types from first row
    const firstRow = rows[0] as Record<string, unknown>;
    const colDefs = columns.map((col) => {
      const val = firstRow[col];
      let type = 'VARCHAR';
      if (typeof val === 'number') type = 'DOUBLE';
      else if (typeof val === 'bigint') type = 'BIGINT';
      else if (typeof val === 'boolean') type = 'BOOLEAN';
      return `"${col}" ${type}`;
    }).join(', ');

    await connection.run(`CREATE TABLE "${name}" (${colDefs})`);

    // Insert in batches using VALUES clause
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const valueRows = batch.map((row) => {
        const obj = row as Record<string, unknown>;
        const vals = columns.map((col) => {
          const v = obj[col];
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'number' || typeof v === 'bigint') return String(v);
          if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        return `(${vals.join(', ')})`;
      });

      await connection.run(
        `INSERT INTO "${name}" VALUES ${valueRows.join(', ')}`,
      );
    }
  }

  /** Converts a DuckDB reader result to a ComputeResult with Arrow IPC. */
  private readerToResult(reader: { getRowObjects: () => unknown[]; columnNames: () => string[] }): ComputeResult {
    const rows = reader.getRowObjects() as Record<string, unknown>[];
    const columnNames = reader.columnNames();

    if (rows.length === 0) {
      return { buffer: new Uint8Array(), rowCount: 0, columnNames };
    }

    // Build column arrays for Arrow table
    const columnData: Record<string, unknown[]> = {};
    for (const col of columnNames) {
      columnData[col] = rows.map((row) => {
        const val = row[col];
        if (val instanceof Date) return val.getTime();
        if (typeof val === 'bigint') return Number(val);
        return val ?? null;
      });
    }

    const table = tableFromArrays(columnData);
    const ipcBuffer = tableToIPC(table);

    return {
      buffer: new Uint8Array(ipcBuffer),
      rowCount: rows.length,
      columnNames,
    };
  }
}

/** Escapes a file path for use in DuckDB SQL (prevents injection). */
function escapePath(path: string): string {
  return path.replace(/'/g, "''");
}
