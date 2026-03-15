import type { ToolDefinition } from '../provider/types';

/**
 * Tool definitions for the View Agent specialist.
 * These tools focus on creating and modifying visualizations.
 */
export const viewTools: ToolDefinition[] = [
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
