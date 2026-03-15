import type { ToolDefinition } from '../provider/types';

/**
 * Tool definitions available to the Insights Agent specialist.
 * Single tool for running DuckDB analytics on the scratchpad.
 */
export const insightsTools: ToolDefinition[] = [
  {
    name: 'analyze_data',
    description:
      'Execute a DuckDB SQL query on the session scratchpad for statistical analysis. ' +
      'Use this for computing aggregations, distributions, correlations, and other analytics. ' +
      'Only read-only SELECT queries are allowed. The scratchpad contains intermediate data ' +
      'saved by previous query steps.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description:
            'A read-only DuckDB SELECT query for statistical analysis. ' +
            'DuckDB supports PERCENTILE_CONT, HISTOGRAM, CORR, and other advanced analytics functions.',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this analysis computes',
        },
      },
      required: ['sql'],
    },
  },
];
