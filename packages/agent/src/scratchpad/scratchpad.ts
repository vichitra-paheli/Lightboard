/** Metadata for a table stored in the session scratchpad. */
export interface ScratchpadTable {
  /** Table name (used as identifier). */
  name: string;
  /** Human-readable description of what this table contains. */
  description: string;
  /** Column definitions inferred from the data. */
  columns: { name: string; type: string }[];
  /** Number of rows in the table. */
  rowCount: number;
  /** When the table was created. */
  createdAt: Date;
}

/** Resource limits for a session scratchpad. */
export interface ScratchpadLimits {
  /** Maximum number of tables allowed (default: 10). */
  maxTables: number;
  /** Maximum rows per table (default: 100,000). */
  maxRowsPerTable: number;
  /** Maximum total size in bytes (default: 100MB). */
  maxSizeBytes: number;
}

/** Default limits for a session scratchpad. */
const DEFAULT_LIMITS: ScratchpadLimits = {
  maxTables: 10,
  maxRowsPerTable: 100_000,
  maxSizeBytes: 100 * 1024 * 1024,
};

/** Internal storage entry for a scratchpad table. */
interface TableEntry {
  rows: Record<string, unknown>[];
  metadata: ScratchpadTable;
}

/**
 * Per-session in-memory scratchpad for storing intermediate query results.
 *
 * Agents save named tables during multi-step analysis so that later steps
 * can reference earlier results. This implementation uses an in-memory
 * Map-based store; DuckDB-backed SQL queries will be added later.
 */
export class SessionScratchpad {
  /** Unique session identifier. */
  readonly sessionId: string;
  /** Resource limits. */
  private readonly limits: ScratchpadLimits;
  /** Table storage. */
  private tables = new Map<string, TableEntry>();
  /** Timestamp of the last write operation (used for staleness checks). */
  private _lastAccess: Date;
  /** Whether this scratchpad has been destroyed. */
  private destroyed = false;

  constructor(sessionId: string, limits?: Partial<ScratchpadLimits>) {
    this.sessionId = sessionId;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this._lastAccess = new Date();
  }

  /** Timestamp of the last write operation. */
  get lastAccess(): Date {
    return this._lastAccess;
  }

  /**
   * Save an array of row objects as a named table.
   *
   * @param name - Table name (must be a valid identifier).
   * @param rows - Array of row objects to store.
   * @param description - Optional human-readable description.
   * @returns Metadata about the saved table.
   * @throws If limits are exceeded or scratchpad is destroyed.
   */
  async saveTable(
    name: string,
    rows: Record<string, unknown>[],
    description?: string,
  ): Promise<ScratchpadTable> {
    this.ensureAlive();

    if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(
        `Invalid table name "${name}". Must start with a letter or underscore and contain only alphanumeric characters and underscores.`,
      );
    }

    // Check row limit
    if (rows.length > this.limits.maxRowsPerTable) {
      throw new Error(
        `Row count ${rows.length} exceeds limit of ${this.limits.maxRowsPerTable} rows per table.`,
      );
    }

    // Check table count (only if this is a new table)
    if (!this.tables.has(name) && this.tables.size >= this.limits.maxTables) {
      throw new Error(
        `Table count would exceed limit of ${this.limits.maxTables}. Drop a table first.`,
      );
    }

    // Estimate size and check limit
    const serialized = JSON.stringify(rows);
    const newSize = this.getSizeEstimateExcluding(name) + serialized.length;
    if (newSize > this.limits.maxSizeBytes) {
      throw new Error(
        `Total size would exceed limit of ${this.limits.maxSizeBytes} bytes. Drop a table first.`,
      );
    }

    // Infer columns from the first row (or empty array if no rows)
    const columns = rows.length > 0 ? this.inferColumns(rows[0]!) : [];

    const metadata: ScratchpadTable = {
      name,
      description: description ?? '',
      columns,
      rowCount: rows.length,
      createdAt: new Date(),
    };

    this.tables.set(name, { rows: [...rows], metadata });
    this._lastAccess = new Date();

    return metadata;
  }

  /**
   * Load all rows from a named table.
   *
   * @param name - The table name to load.
   * @returns Array of row objects.
   * @throws If the table does not exist or scratchpad is destroyed.
   */
  async loadTable(name: string): Promise<Record<string, unknown>[]> {
    this.ensureAlive();

    const entry = this.tables.get(name);
    if (!entry) {
      throw new Error(`Table "${name}" not found in scratchpad.`);
    }
    this._lastAccess = new Date();
    return [...entry.rows];
  }

  /**
   * List all tables with their metadata.
   *
   * @returns Array of table metadata objects.
   */
  listTables(): ScratchpadTable[] {
    this.ensureAlive();
    return [...this.tables.values()].map((e) => ({ ...e.metadata }));
  }

  /**
   * Run a SQL query across scratchpad tables.
   *
   * Note: SQL queries require a DuckDB backend which is not yet integrated.
   * This method currently throws an error indicating that SQL is unavailable.
   *
   * @param _sql - The SQL query string.
   * @throws Always throws — DuckDB integration pending.
   */
  async query(_sql: string): Promise<Record<string, unknown>[]> {
    this.ensureAlive();
    throw new Error(
      'SQL queries on the scratchpad require DuckDB, which is not yet integrated. ' +
        'Use loadTable() to access data by table name.',
    );
  }

  /**
   * Check whether a table with the given name exists.
   *
   * @param name - The table name to check.
   * @returns True if the table exists.
   */
  hasTable(name: string): boolean {
    this.ensureAlive();
    return this.tables.has(name);
  }

  /**
   * Drop a table from the scratchpad.
   *
   * @param name - The table name to drop.
   * @throws If the table does not exist or scratchpad is destroyed.
   */
  async dropTable(name: string): Promise<void> {
    this.ensureAlive();

    if (!this.tables.has(name)) {
      throw new Error(`Table "${name}" not found in scratchpad.`);
    }

    this.tables.delete(name);
    this._lastAccess = new Date();
  }

  /**
   * Estimate the total size of all tables in bytes.
   *
   * Uses JSON serialization length as a rough proxy for memory consumption.
   *
   * @returns Estimated size in bytes.
   */
  getSizeEstimate(): number {
    let total = 0;
    for (const entry of this.tables.values()) {
      total += JSON.stringify(entry.rows).length;
    }
    return total;
  }

  /**
   * Destroy the scratchpad, releasing all stored data.
   * After destruction, all methods will throw.
   */
  async destroy(): Promise<void> {
    this.tables.clear();
    this.destroyed = true;
  }

  /** Whether this scratchpad has been destroyed. */
  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Throw if the scratchpad has been destroyed. */
  private ensureAlive(): void {
    if (this.destroyed) {
      throw new Error(`Scratchpad for session "${this.sessionId}" has been destroyed.`);
    }
  }

  /** Estimate total size excluding a specific table. */
  private getSizeEstimateExcluding(tableName: string): number {
    let total = 0;
    for (const [name, entry] of this.tables.entries()) {
      if (name !== tableName) {
        total += JSON.stringify(entry.rows).length;
      }
    }
    return total;
  }

  /** Infer column names and types from a sample row. */
  private inferColumns(row: Record<string, unknown>): { name: string; type: string }[] {
    return Object.entries(row).map(([name, value]) => ({
      name,
      type: this.inferType(value),
    }));
  }

  /** Infer a simple type string from a JS value. */
  private inferType(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return 'string';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    return 'object';
  }
}
