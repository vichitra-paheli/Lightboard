import { queryIRSchema } from '@lightboard/query-ir';
import { z } from 'zod';

/** Context provided to tool handlers for accessing services. */
export interface ToolContext {
  /** Get schema metadata for a data source. */
  getSchema: (sourceId: string) => Promise<Record<string, unknown>>;
  /** Execute a query against a data source. */
  executeQuery: (sourceId: string, queryIR: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Get the current view state. */
  getCurrentView?: () => Record<string, unknown> | null;
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
  execute_query: z.object({
    source_id: z.string().min(1),
    query_ir: z.record(z.unknown()),
  }),
  create_view: z.object({
    view_spec: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      query: z.record(z.unknown()),
      chart: z.object({
        type: z.string(),
        config: z.record(z.unknown()),
      }),
      controls: z.array(z.record(z.unknown())).optional(),
    }),
  }),
  modify_view: z.object({
    view_id: z.string().min(1),
    patch: z.record(z.unknown()),
  }),
};

/**
 * Routes tool calls from the LLM to the appropriate handler.
 * Each handler validates inputs, delegates to services, and returns
 * structured results (or errors for agent self-correction).
 */
export class ToolRouter {
  private context: ToolContext;
  private viewStore = new Map<string, Record<string, unknown>>();

  constructor(context: ToolContext) {
    this.context = context;
  }

  /** Execute a tool call and return the result. Errors are returned, not thrown. */
  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    // Auto-parse stringified JSON values — local models often send nested objects as strings
    const normalizedInput = this.normalizeInput(input);
    try {
      switch (toolName) {
        case 'get_schema':
          return await this.handleGetSchema(normalizedInput);
        case 'execute_query':
          return await this.handleExecuteQuery(normalizedInput);
        case 'create_view':
          return await this.handleCreateView(normalizedInput);
        case 'modify_view':
          return await this.handleModifyView(normalizedInput);
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

  /** Handle execute_query tool call. */
  private async handleExecuteQuery(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.execute_query.safeParse(input);
    if (!parsed.success) {
      return {
        content: `Invalid input for execute_query. Expected: {"source_id": "<id>", "query_ir": {"source": "<id>", "table": "<name>", ...}}. Got: ${JSON.stringify(input).slice(0, 200)}. Error: ${parsed.error.message}`,
        isError: true,
      };
    }

    const result = await this.context.executeQuery(parsed.data.source_id, parsed.data.query_ir);
    return { content: JSON.stringify(result, null, 2), isError: false };
  }

  /** Handle create_view tool call. */
  private async handleCreateView(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.create_view.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const viewId = `view_${Date.now()}`;
    const viewSpec = parsed.data.view_spec;
    this.viewStore.set(viewId, viewSpec);

    return {
      content: JSON.stringify({ viewId, viewSpec }),
      isError: false,
    };
  }

  /** Handle modify_view tool call. */
  private async handleModifyView(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const parsed = toolInputSchemas.modify_view.safeParse(input);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const existing = this.viewStore.get(parsed.data.view_id);
    if (!existing) {
      return { content: `View "${parsed.data.view_id}" not found`, isError: true };
    }

    const updated = { ...existing, ...parsed.data.patch };
    this.viewStore.set(parsed.data.view_id, updated);

    return {
      content: JSON.stringify({ viewId: parsed.data.view_id, viewSpec: updated }),
      isError: false,
    };
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
