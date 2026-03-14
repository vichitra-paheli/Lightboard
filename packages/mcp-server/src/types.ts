/** Context provided to MCP tool handlers for accessing Lightboard services. */
export interface MCPContext {
  /** List all configured data sources for the current org. */
  listDataSources: () => Promise<DataSourceInfo[]>;
  /** Get schema metadata for a data source. */
  getSchema: (sourceId: string) => Promise<SchemaInfo>;
  /** Execute a query against a data source. */
  executeQuery: (sourceId: string, queryIR: Record<string, unknown>) => Promise<QueryResultInfo>;
  /** Create a new view from a ViewSpec. */
  createView: (viewSpec: Record<string, unknown>) => Promise<ViewInfo>;
  /** Get the current application state. */
  getCurrentState: () => Promise<AppStateInfo>;
}

/** Data source summary returned by list_data_sources. */
export interface DataSourceInfo {
  id: string;
  name: string;
  type: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
}

/** Schema metadata returned by get_schema. */
export interface SchemaInfo {
  tables: {
    name: string;
    schema: string;
    columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[];
  }[];
  relationships: {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
  }[];
}

/** Query result summary returned by execute_query. */
export interface QueryResultInfo {
  rowCount: number;
  columnNames: string[];
  rows: Record<string, unknown>[];
}

/** View info returned by create_view. */
export interface ViewInfo {
  viewId: string;
  title?: string;
  chartType: string;
}

/** Application state returned by get_current_state. */
export interface AppStateInfo {
  dataSources: DataSourceInfo[];
  currentView: Record<string, unknown> | null;
  user: { id: string; email: string; role: string } | null;
}
