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
  {
    name: 'create_view',
    description:
      'Create an interactive visualization view from query results. ' +
      'Specify the chart type, configuration, and interactive controls. ' +
      'Controls should include dropdowns for categorical columns and date range pickers for time columns.',
    inputSchema: {
      type: 'object',
      properties: {
        view_spec: {
          type: 'object',
          description: 'The ViewSpec document describing the view',
          properties: {
            title: { type: 'string', description: 'Title for the view' },
            description: { type: 'string', description: 'Description of what the view shows' },
            query: { type: 'object', description: 'QueryIR for the view data' },
            chart: {
              type: 'object',
              properties: {
                type: { type: 'string', description: 'Panel plugin ID (time-series-line, bar-chart, stat-card, data-table)' },
                config: { type: 'object', description: 'Chart-specific configuration' },
              },
              required: ['type', 'config'],
            },
            controls: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['dropdown', 'multi_select', 'date_range', 'text_input', 'toggle'] },
                  label: { type: 'string' },
                  variable: { type: 'string', description: 'Template variable name (without $)' },
                  defaultValue: {},
                },
                required: ['type', 'label', 'variable'],
              },
            },
          },
          required: ['query', 'chart'],
        },
      },
      required: ['view_spec'],
    },
  },
  {
    name: 'modify_view',
    description:
      'Modify an existing view — change chart type, add/remove controls, update filters, adjust configuration. ' +
      'Use this for follow-up requests like "show it as a bar chart" or "add a filter for region".',
    inputSchema: {
      type: 'object',
      properties: {
        view_id: {
          type: 'string',
          description: 'The ID of the view to modify',
        },
        patch: {
          type: 'object',
          description: 'Partial ViewSpec with only the fields to change',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            query: { type: 'object' },
            chart: { type: 'object' },
            controls: { type: 'array' },
          },
        },
      },
      required: ['view_id', 'patch'],
    },
  },
];
