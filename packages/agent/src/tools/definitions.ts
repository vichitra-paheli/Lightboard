import type { ToolDefinition } from '../provider/types';

/** Tool definitions in a format compatible with Claude's tool use and OpenAI's function calling. */
export const agentTools: ToolDefinition[] = [
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
    name: 'run_sql',
    description:
      'Execute a read-only SELECT SQL query against a data source. ' +
      'This is the primary tool for retrieving data. Write standard PostgreSQL SELECT statements. ' +
      'Only SELECT queries are allowed. Results are limited to 500 rows.',
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
    name: 'create_view',
    description:
      'Create a visualization from query results. ' +
      'Generate a complete, self-contained HTML document that renders the chart or table. ' +
      'The HTML will be displayed in a sandboxed iframe.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title for the view' },
        description: { type: 'string', description: 'Description of what the view shows' },
        sql: { type: 'string', description: 'The SQL query that produced the data (for re-execution)' },
        html: { type: 'string', description: 'Complete self-contained HTML document with embedded data and chart rendering' },
      },
      required: ['title', 'sql', 'html'],
    },
  },
  {
    name: 'modify_view',
    description:
      'Modify an existing view — change the visualization, update the data query, or adjust the layout. ' +
      'Use this for follow-up requests like "show it as a bar chart" or "add a trend line".',
    inputSchema: {
      type: 'object',
      properties: {
        view_id: {
          type: 'string',
          description: 'The ID of the view to modify',
        },
        title: { type: 'string', description: 'New title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        sql: { type: 'string', description: 'Updated SQL query (optional)' },
        html: { type: 'string', description: 'Updated HTML document (optional)' },
      },
      required: ['view_id'],
    },
  },
];
