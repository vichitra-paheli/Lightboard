import type { ToolDefinition } from '../provider/types';

/**
 * Tool definitions available to the Leader Agent.
 * Delegation tools for sub-agents + lightweight scratchpad inspection.
 *
 * Data stays server-side: delegate_query auto-saves results to the scratchpad.
 * The LLM only sees compact summaries (columns, row count, sample rows).
 */
export const leaderTools: ToolDefinition[] = [
  {
    name: 'delegate_query',
    description:
      'Delegate a data retrieval task to the Query specialist. ' +
      'Results are automatically saved to the scratchpad — you will receive a compact summary ' +
      '(columns, row count, sample rows) and the scratchpad table name for reference.',
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
      'Provide the scratchpad table name from a previous query and the desired visualization. ' +
      'The view agent receives the data summary automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'What visualization to create (e.g., "Create a bar chart of sales by region with a team filter")',
        },
        scratchpad_table: {
          type: 'string',
          description: 'Name of the scratchpad table containing the data (from a previous delegate_query result)',
        },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'delegate_insights',
    description:
      'Delegate statistical analysis to the Insights specialist. ' +
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
  {
    name: 'list_scratchpads',
    description:
      'List all tables saved in the session scratchpad with metadata ' +
      '(name, description, row count). Use this to see what data is available.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'propose_schema_doc',
    description:
      'Propose schema documentation for the user to review and edit before saving. ' +
      'The document will be shown in an editor — it is NOT saved automatically. ' +
      'IMPORTANT: Before calling this, you MUST ask the user questions about the domain. ' +
      'The document should be a concise, LLM-optimized markdown reference covering: ' +
      'table descriptions, key columns, join patterns, filtering gotchas, enum values, and example queries. ' +
      'Keep it under 6000 characters.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'The data source to save documentation for',
        },
        document: {
          type: 'string',
          description: 'The complete schema documentation as markdown',
        },
      },
      required: ['source_id', 'document'],
    },
  },
  {
    name: 'load_scratchpad',
    description:
      'Load a summary of a scratchpad table (columns, row count, sample rows). ' +
      'Use this to inspect data from a previous query before visualizing or analyzing.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'Name of the scratchpad table to inspect',
        },
      },
      required: ['table_name'],
    },
  },
];
