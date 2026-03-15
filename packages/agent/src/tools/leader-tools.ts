import type { ToolDefinition } from '../provider/types';
import { scratchpadTools } from './scratchpad-tools';

/**
 * Delegation tool definitions for the Leader Agent.
 * These tools allow the leader to route tasks to specialist sub-agents.
 */
const delegationTools: ToolDefinition[] = [
  {
    name: 'delegate_query',
    description:
      'Delegate a data retrieval task to the Query specialist. ' +
      'The query agent can explore schemas, execute QueryIR queries, and run raw SQL. ' +
      'Provide a clear instruction about what data to retrieve.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'Clear instruction for the query agent (e.g., "Get total sales by region from the orders table")',
        },
        source_id: {
          type: 'string',
          description: 'The data source ID to query against',
        },
      },
      required: ['instruction', 'source_id'],
    },
  },
  {
    name: 'delegate_view',
    description:
      'Delegate visualization creation to the View specialist. ' +
      'The view agent selects the best chart type and generates a ViewSpec. ' +
      'Provide the data summary (columns, types, sample rows) and instruction.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'What visualization to create (e.g., "Create a bar chart of sales by region")',
        },
        data_summary: {
          type: 'object',
          description: 'Summary of the data: columns, types, row count, sample rows',
        },
      },
      required: ['instruction', 'data_summary'],
    },
  },
  {
    name: 'delegate_insights',
    description:
      'Delegate statistical analysis to the Insights specialist. ' +
      'The insights agent computes statistics, finds patterns, and identifies outliers. ' +
      'Provide a question and optionally the scratchpad table name to analyze.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'What analysis to perform (e.g., "Find outliers in the sales data")',
        },
        table_name: {
          type: 'string',
          description: 'Optional scratchpad table name to analyze',
        },
      },
      required: ['instruction'],
    },
  },
];

/**
 * All tools available to the Leader Agent:
 * delegation tools + scratchpad tools.
 */
export const leaderTools: ToolDefinition[] = [
  ...delegationTools,
  ...scratchpadTools,
];
