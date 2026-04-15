import { z } from 'zod';

import type { ToolDefinition } from '../provider/types';

/** Context provided to tool handlers for accessing services. */
export interface ToolContext {
  /** Get schema metadata for a data source. */
  getSchema: (sourceId: string) => Promise<Record<string, unknown>>;
  /** Execute raw SQL against a data source. */
  runSQL?: (sourceId: string, sql: string) => Promise<Record<string, unknown>>;
  /** Describe a single table: columns, types, and sample rows. */
  describeTable?: (sourceId: string, tableName: string) => Promise<Record<string, unknown>>;
  /** Get the current view state. */
  getCurrentView?: () => Record<string, unknown> | null;
  /** Execute DuckDB SQL on the session scratchpad for statistical analysis. */
  analyzeData?: (sql: string) => Promise<Record<string, unknown>>;
}

/** Result of a tool execution. */
export interface ToolExecutionResult {
  content: string;
  isError: boolean;
}

/** Input validation schemas for each tool. */
const toolInputSchemas = {
  get_schema: z.object({
    source_id: z.string().min(1),
  }),
  describe_table: z.object({
    source_id: z.string().min(1),
    table_name: z.string().min(1),
  }),
  create_view: z.object({
    title: z.string(),
    description: z.string().optional(),
    sql: z.string(),
    html: z.string(),
  }),
  modify_view: z.object({
    view_id: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    sql: z.string().optional(),
    html: z.string().optional(),
  }),
  run_sql: z.object({
    source_id: z.string().min(1),
    sql: z.string().min(1),
  }),
  analyze_data: z.object({
    sql: z.string().min(1),
    description: z.string().optional(),
  }),
};

/**
 * Routes tool calls from the LLM to the appropriate handler.
 * Accepts a dynamic set of tool definitions at construction time,
 * allowing different agents to use different tool subsets.
 */
export class ToolRouter {
  private context: ToolContext;
  private viewStore = new Map<string, Record<string, unknown>>();
  private allowedTools: Set<string>;

  constructor(context: ToolContext, toolDefinitions?: ToolDefinition[]) {
    this.context = context;
    this.allowedTools = toolDefinitions
      ? new Set(toolDefinitions.map((t) => t.name))
      : new Set(['get_schema', 'run_sql', 'describe_table', 'create_view', 'modify_view']);
  }

  /** Execute a tool call and return the result. Errors are returned, not thrown. */
  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    if (!this.allowedTools.has(toolName)) {
      return { content: `Tool "${toolName}" is not available for this agent`, isError: true };
    }

    // Auto-parse stringified JSON values — local models often send nested objects as strings
    const normalizedInput = this.normalizeInput(input);
    // Debug: log normalization for troubleshooting local model issues
    for (const [key, val] of Object.entries(input)) {
      if (typeof val === 'string' && typeof normalizedInput[key] !== 'string') {
        console.log(`[ToolRouter] Normalized "${key}" from string to ${typeof normalizedInput[key]}`);
      }
      if (typeof val === 'string' && typeof normalizedInput[key] === 'string' && val.includes('{')) {
        console.log(`[ToolRouter] WARNING: "${key}" is still a string after normalization. First 100 chars: ${val.slice(0, 100)}`);
      }
    }
    try {
      switch (toolName) {
        case 'get_schema':
          return await this.handleGetSchema(normalizedInput);
        case 'describe_table':
          return await this.handleDescribeTable(normalizedInput);
        case 'run_sql':
          return await this.handleRunSQL(normalizedInput);
        case 'create_view':
          return await this.handleCreateView(normalizedInput);
        case 'modify_view':
          return await this.handleModifyView(normalizedInput);
        case 'analyze_data':
          return await this.handleAnalyzeData(normalizedInput);
        default:
          return { content: `Unknown tool: ${toolName}`, isError: true };
      }
    } catch (err) {
      return {
        content: `Tool "${toolName}" failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }

  /** Handle get_schema tool call. */
  private async handleGetSchema(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.get_schema.safeParse(input);
    if (!parsed.success) {
      return {
        content: `Invalid input for get_schema. Expected: {"source_id": "<data-source-id>"}. Got: ${JSON.stringify(input)}. Error: ${parsed.error.message}`,
        isError: true,
      };
    }

    const schema = await this.context.getSchema(parsed.data.source_id);
    return { content: JSON.stringify(schema, null, 2), isError: false };
  }

  /** Handle describe_table tool call — returns column details and sample rows. */
  private async handleDescribeTable(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.describe_table.safeParse(input);
    if (!parsed.success) {
      return {
        content: `Invalid input for describe_table. Expected: {"source_id": "<id>", "table_name": "<name>"}. Error: ${parsed.error.message}`,
        isError: true,
      };
    }

    if (!this.context.describeTable) {
      return { content: 'describe_table is not available', isError: true };
    }

    const result = await this.context.describeTable(parsed.data.source_id, parsed.data.table_name);
    return { content: JSON.stringify(result, null, 2), isError: false };
  }

  /** Handle create_view tool call — stores an HTML view. */
  private async handleCreateView(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.create_view.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const viewId = `view_${Date.now()}`;
    const viewSpec = {
      title: parsed.data.title,
      description: parsed.data.description,
      sql: parsed.data.sql,
      html: parsed.data.html,
    };
    this.viewStore.set(viewId, viewSpec);

    return {
      content: JSON.stringify({ viewId, viewSpec }),
      isError: false,
    };
  }

  /** Handle modify_view tool call — patches an existing HTML view. */
  private async handleModifyView(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.modify_view.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const existing = this.viewStore.get(parsed.data.view_id);
    if (!existing) {
      return { content: `View "${parsed.data.view_id}" not found`, isError: true };
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.title) patch.title = parsed.data.title;
    if (parsed.data.description) patch.description = parsed.data.description;
    if (parsed.data.sql) patch.sql = parsed.data.sql;
    if (parsed.data.html) patch.html = parsed.data.html;

    const updated = { ...existing, ...patch };
    this.viewStore.set(parsed.data.view_id, updated);

    return {
      content: JSON.stringify({ viewId: parsed.data.view_id, viewSpec: updated }),
      isError: false,
    };
  }

  /** Handle run_sql tool call — raw SQL for complex joins. */
  private async handleRunSQL(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.run_sql.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input for run_sql: ${parsed.error.message}`, isError: true };
    }

    if (!this.context.runSQL) {
      return { content: 'run_sql is not available', isError: true };
    }

    const result = await this.context.runSQL(parsed.data.source_id, parsed.data.sql);
    return { content: JSON.stringify(result, null, 2), isError: false };
  }

  /** Handle analyze_data tool call — DuckDB analytics on the scratchpad. */
  private async handleAnalyzeData(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.analyze_data.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input for analyze_data: ${parsed.error.message}`, isError: true };
    }

    if (!this.context.analyzeData) {
      return { content: 'analyze_data is not available — no scratchpad configured', isError: true };
    }

    const result = await this.context.analyzeData(parsed.data.sql);
    return { content: JSON.stringify(result, null, 2), isError: false };
  }

  /** Get a stored view by ID (for testing). */
  getView(viewId: string): Record<string, unknown> | undefined {
    return this.viewStore.get(viewId);
  }

  /**
   * Normalizes tool input by auto-parsing stringified JSON values.
   * Local LLMs often send nested objects as JSON strings rather than parsed objects.
   * Handles double-escaped strings (string of a string of JSON).
   */
  private normalizeInput(input: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        result[key] = this.tryParseJSON(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** Attempts to parse a string as JSON, handling double-escaping. */
  private tryParseJSON(value: string): unknown {
    let current = value.trim();
    // Try up to 2 levels of unescaping (double-encoded strings)
    for (let i = 0; i < 2; i++) {
      if ((current.startsWith('{') && current.endsWith('}')) ||
          (current.startsWith('[') && current.endsWith(']'))) {
        try {
          return JSON.parse(current);
        } catch {
          return value; // Not valid JSON
        }
      }
      // Try unquoting — model may send '"{ ... }"' (quoted JSON string)
      if (current.startsWith('"') && current.endsWith('"')) {
        try {
          current = JSON.parse(current) as string;
          if (typeof current !== 'string') return current; // Already parsed to object
        } catch {
          return value;
        }
      } else {
        break;
      }
    }
    return value;
  }
}
