import type { ToolDefinition } from '../provider/types';

/**
 * Tool definitions for the View Agent specialist.
 * These tools focus on creating and modifying HTML visualizations.
 */
export const viewTools: ToolDefinition[] = [
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
