import type { ToolDefinition } from '../provider/types';

/**
 * Tool definitions available to the Leader Agent.
 * Delegation tools for sub-agents + lightweight scratchpad inspection.
 *
 * Two dispatch modes are available:
 *   - `dispatch_*`: asynchronous. Returns a task_id immediately so multiple
 *     sub-agents can run in parallel. Collect results with `await_tasks`.
 *   - `delegate_*`: synchronous (legacy). Blocks until the sub-agent finishes.
 *
 * Data stays server-side: query tasks auto-save results to the scratchpad.
 * The LLM only sees compact summaries (columns, row count, sample rows).
 */
export const leaderTools: ToolDefinition[] = [
  {
    name: 'dispatch_query',
    description:
      'Dispatch a query task to the Query specialist and return immediately with a task_id. ' +
      'The task runs in the background — use `await_tasks` to collect the result. ' +
      'Call this multiple times in a single turn to run queries in parallel. ' +
      'Results are auto-saved to the scratchpad once the task completes.',
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
    name: 'dispatch_view',
    description:
      'Dispatch a visualization task to the View specialist and return immediately with a task_id. ' +
      'Use `await_tasks` to collect the result. ' +
      'You may dispatch this before a `dispatch_query` result is available by referencing a scratchpad table — ' +
      'just wait on the query task first with `await_tasks`.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'What visualization to create (e.g., "Create a bar chart of sales by region")',
        },
        scratchpad_table: {
          type: 'string',
          description: 'Name of the scratchpad table containing the data',
        },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'dispatch_insights',
    description:
      'Dispatch a statistical analysis task to the Insights specialist and return immediately with a task_id. ' +
      'Use `await_tasks` to collect the result.',
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
    name: 'await_tasks',
    description:
      'Wait for one or more dispatched tasks to complete and collect their results. ' +
      'Returns a map of task_id → { success, summary, data_summary (for queries), explanation }. ' +
      'Unknown or timed-out task ids come back as errors — the others complete normally.',
    inputSchema: {
      type: 'object',
      properties: {
        task_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Task ids returned from dispatch_* calls',
        },
        timeout_ms: {
          type: 'number',
          description: 'Optional timeout in milliseconds (default: wait indefinitely)',
        },
      },
      required: ['task_ids'],
    },
  },
  {
    name: 'cancel_task',
    description:
      'Cooperatively cancel a running task. Returns { cancelled: boolean }. ' +
      'The task\'s final state will be "cancelled" — await_tasks will still return it as an error result.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Task id to cancel',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'delegate_query',
    description:
      '[LEGACY — prefer dispatch_query + await_tasks for parallelism] ' +
      'Synchronously delegate a data retrieval task to the Query specialist. ' +
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
      '[LEGACY — prefer dispatch_view + await_tasks for parallelism] ' +
      'Synchronously delegate visualization creation to the View specialist. ' +
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
      '[LEGACY — prefer dispatch_insights + await_tasks for parallelism] ' +
      'Synchronously delegate statistical analysis to the Insights specialist. ' +
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
