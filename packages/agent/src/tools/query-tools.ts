import type { ToolDefinition } from '../provider/types';

import { DEFAULT_ROW_LIMIT } from './constants';

/**
 * Tool definitions for the Query Agent specialist.
 * These tools focus on schema exploration and data retrieval via raw SQL.
 */
export const queryTools: ToolDefinition[] = [
  {
    name: 'get_schema',
    description:
      'Get the schema (tables, columns, types, relationships) of a connected data source. ' +
      'Only call this if the schema is not already provided in the system prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'The ID of the data source to introspect',
        },
      },
      required: ['source_id'],
    },
  },
  {
    name: 'describe_table',
    description:
      'Get detailed information about a specific table including column names, types, and sample rows. ' +
      'Use this before writing queries to understand what data is available and what values columns contain.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'The data source containing the table',
        },
        table_name: {
          type: 'string',
          description: 'The name of the table to describe',
        },
      },
      required: ['source_id', 'table_name'],
    },
  },
  {
    name: 'check_query_hints',
    description:
      'Lint a proposed SQL statement against the sampled enum values captured during schema bootstrap. ' +
      'Returns `{ ok, warnings }` where each warning names a column + literal value that was not seen in the samples, ' +
      'plus suggested alternatives. Call this BEFORE `run_sql` whenever you are filtering on a column whose allowed ' +
      'values you are not 100% sure of — it is cheap and catches typos (\'T-20\' vs \'T20\', wrong case, stale enums).',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'The data source whose schema context to validate against',
        },
        sql: {
          type: 'string',
          description: 'The proposed SQL statement to lint (same string you would pass to run_sql)',
        },
      },
      required: ['source_id', 'sql'],
    },
  },
  {
    name: 'run_sql',
    description:
      'Execute a read-only SELECT SQL query against a data source. ' +
      'This is the primary tool for retrieving data. Write standard PostgreSQL SELECT statements. ' +
      `Only SELECT queries are allowed. Results are capped at ${DEFAULT_ROW_LIMIT} rows — ` +
      `the router appends \`LIMIT ${DEFAULT_ROW_LIMIT}\` automatically if you omit one.`,
    inputSchema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'The data source to query',
        },
        sql: {
          type: 'string',
          description: 'A read-only SELECT SQL query',
        },
      },
      required: ['source_id', 'sql'],
    },
  },
];
