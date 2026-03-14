import { z } from 'zod';
import type { MCPContext } from './types';

/** Tool handler result. */
interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** All MCP tool definitions with their handlers. */
export function createToolDefinitions(ctx: MCPContext) {
  return {
    list_data_sources: {
      description:
        'List all configured data sources in the current organization. ' +
        'Returns the ID, name, type, and health status of each source. ' +
        'Call this first to discover what data is available.',
      inputSchema: z.object({}),
      handler: async (): Promise<ToolResult> => {
        try {
          const sources = await ctx.listDataSources();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(sources, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error listing data sources: ${errMsg(err)}` }],
            isError: true,
          };
        }
      },
    },

    get_schema: {
      description:
        'Get the schema (tables, columns, types, relationships) of a connected data source. ' +
        'Always call this before writing queries to understand what data is available. ' +
        'Returns table names, column names with types, nullability, primary keys, and foreign key relationships.',
      inputSchema: z.object({
        source_id: z.string().describe('The ID of the data source to introspect'),
      }),
      handler: async (input: { source_id: string }): Promise<ToolResult> => {
        try {
          const schema = await ctx.getSchema(input.source_id);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(schema, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error getting schema: ${errMsg(err)}` }],
            isError: true,
          };
        }
      },
    },

    execute_query: {
      description:
        'Execute a query against a data source using QueryIR format (not raw SQL). ' +
        'The QueryIR specifies the table, fields, filters, aggregations, ordering, and limits. ' +
        'Returns the query results as rows with column names. ' +
        'Use get_schema first to understand available tables and columns.',
      inputSchema: z.object({
        source_id: z.string().describe('The data source to query'),
        query_ir: z.record(z.unknown()).describe(
          'QueryIR document with: source, table, select, filter, aggregations, groupBy, orderBy, limit',
        ),
      }),
      handler: async (input: { source_id: string; query_ir: Record<string, unknown> }): Promise<ToolResult> => {
        try {
          const result = await ctx.executeQuery(input.source_id, input.query_ir);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                rowCount: result.rowCount,
                columnNames: result.columnNames,
                rows: result.rows.slice(0, 50), // Limit to 50 rows in MCP response
              }, null, 2),
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error executing query: ${errMsg(err)}` }],
            isError: true,
          };
        }
      },
    },

    create_view: {
      description:
        'Create an interactive visualization view from a ViewSpec. ' +
        'The ViewSpec includes a QueryIR for data, a chart type and config, ' +
        'and optional interactive controls (dropdowns, date pickers). ' +
        'Returns the view ID and summary.',
      inputSchema: z.object({
        view_spec: z.record(z.unknown()).describe(
          'ViewSpec with: query (QueryIR), chart (type + config), controls (optional), title, description',
        ),
      }),
      handler: async (input: { view_spec: Record<string, unknown> }): Promise<ToolResult> => {
        try {
          const view = await ctx.createView(input.view_spec);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(view, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error creating view: ${errMsg(err)}` }],
            isError: true,
          };
        }
      },
    },

    get_current_state: {
      description:
        'Get the current application state including: ' +
        'configured data sources, the currently displayed view (if any), ' +
        'and the authenticated user. Useful for understanding context before taking actions.',
      inputSchema: z.object({}),
      handler: async (): Promise<ToolResult> => {
        try {
          const state = await ctx.getCurrentState();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error getting state: ${errMsg(err)}` }],
            isError: true,
          };
        }
      },
    },
  };
}

/** Extracts error message from unknown error. */
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
