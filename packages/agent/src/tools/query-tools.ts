import type { ToolDefinition } from '../provider/types';

/**
 * Tool definitions for the Query Agent specialist.
 * These tools focus on schema exploration and data retrieval.
 */
export const queryTools: ToolDefinition[] = [
  {
    name: 'get_schema',
    description:
      'Get the schema (tables, columns, types, relationships) of a connected data source. ' +
      'Always call this before writing a query to understand what data is available.',
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
    name: 'execute_query',
    description:
      'Execute a query against a data source using QueryIR (not raw SQL). ' +
      'Returns the query results. Use get_schema first to understand the available tables and columns.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'The data source to query',
        },
        query_ir: {
          type: 'object',
          description: 'The QueryIR document describing the query',
          properties: {
            source: { type: 'string' },
            table: { type: 'string' },
            select: { type: 'array', items: { type: 'object' } },
            filter: { type: 'object' },
            aggregations: { type: 'array', items: { type: 'object' } },
            groupBy: { type: 'array', items: { type: 'object' } },
            orderBy: { type: 'array', items: { type: 'object' } },
            timeRange: { type: 'object' },
            joins: { type: 'array', items: { type: 'object' } },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
          required: ['source', 'table'],
        },
      },
      required: ['source_id', 'query_ir'],
    },
  },
  {
    name: 'run_sql',
    description:
      'Execute a read-only SELECT SQL query directly against a data source. ' +
      'Use this for complex queries involving JOINs that are hard to express in QueryIR. ' +
      'Only SELECT queries are allowed. Results are limited to 1000 rows.',
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
