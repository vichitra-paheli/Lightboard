import type { ToolDefinition } from '../provider/types';

/**
 * Tool definitions for scratchpad operations.
 *
 * These tools allow the leader agent to save, load, list, and query
 * intermediate data stored in the per-session scratchpad.
 */
export const scratchpadTools: ToolDefinition[] = [
  {
    name: 'save_scratchpad',
    description:
      'Save query result rows as a named table in the session scratchpad. ' +
      'Use this to store intermediate results that will be referenced in later analysis steps. ' +
      'Table names must be valid identifiers (letters, numbers, underscores, starting with a letter or underscore).',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'Name for the scratchpad table (valid identifier)',
        },
        rows: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of row objects to save',
        },
        description: {
          type: 'string',
          description: 'Human-readable description of what this table contains',
        },
      },
      required: ['table_name', 'rows'],
    },
  },
  {
    name: 'load_scratchpad',
    description:
      'Load data from a named scratchpad table. ' +
      'Use list_scratchpads first to see available tables.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'Name of the scratchpad table to load',
        },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'list_scratchpads',
    description:
      'List all tables in the session scratchpad with their metadata ' +
      '(name, description, columns, row count, creation time).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'query_scratchpad',
    description:
      'Run a SQL query across scratchpad tables. ' +
      'Requires DuckDB integration (not yet available). ' +
      'Use load_scratchpad to access individual tables by name instead.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SQL query to run against scratchpad tables',
        },
      },
      required: ['sql'],
    },
  },
];
