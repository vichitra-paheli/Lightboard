import type { Message, ToolCallResult } from '../provider/types';
import { buildQueryPrompt } from '../prompt/query-prompt';
import { queryTools } from '../tools/query-tools';
import type { AgentTask, SubAgent, SubAgentConfig, SubAgentResult } from './types';

/**
 * Query specialist sub-agent.
 * Handles schema exploration and data retrieval via get_schema, describe_table, and run_sql.
 * Receives full schema in task context. Does NOT create views — that is the ViewAgent's job.
 */
export class QueryAgent implements SubAgent {
  readonly role = 'query' as const;
  readonly tools = queryTools;
  private config: SubAgentConfig;

  constructor(config: SubAgentConfig) {
    this.config = config;
  }

  /** Execute a query task and yield the result. */
  async *execute(task: AgentTask): AsyncIterable<SubAgentResult> {
    const result = await this.run(task);
    yield result;
  }

  /** Run a query task and return the structured result. */
  async run(task: AgentTask): Promise<SubAgentResult> {
    const dataSources = (task.context.dataSources ?? []) as Array<{
      id: string;
      name: string;
      type: string;
      cachedSchema?: { tables: { name: string; schema: string; columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[] }[] } | null;
    }>;

    const systemPrompt = buildQueryPrompt({ dataSources });
    const messages: Message[] = [
      { role: 'user', content: task.instruction },
    ];

    const maxRounds = this.config.maxToolRounds ?? 5;
    let lastQueryResult: Record<string, unknown> | undefined;

    for (let round = 0; round < maxRounds; round++) {
      const toolCalls: ToolCallResult[] = [];
      const toolInputBuffers = new Map<string, string>();
      let textContent = '';
      let hasToolCalls = false;

      const stream = this.config.provider.chat(messages, this.tools, {
        system: systemPrompt,
        maxTokens: this.config.maxTokens,
      });

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            textContent += event.text;
            break;
          case 'tool_call_start':
            hasToolCalls = true;
            toolInputBuffers.set(event.id, '');
            toolCalls.push({ id: event.id, name: event.name, input: {} });
            break;
          case 'tool_call_delta':
            toolInputBuffers.set(event.id, (toolInputBuffers.get(event.id) ?? '') + event.input);
            break;
          case 'tool_call_end': {
            const tc = toolCalls.find((t) => t.id === event.id);
            if (tc) tc.input = event.input;
            break;
          }
          case 'message_end':
            if (hasToolCalls) {
              for (const tc of toolCalls) {
                if (Object.keys(tc.input).length === 0) {
                  const raw = toolInputBuffers.get(tc.id);
                  if (raw) {
                    try { tc.input = JSON.parse(raw); } catch { /* ignore */ }
                  }
                }
              }
            }
            break;
        }
      }

      messages.push({
        role: 'assistant',
        content: textContent,
        toolCalls: hasToolCalls ? toolCalls : undefined,
      });

      if (!hasToolCalls) {
        return {
          role: 'query',
          success: true,
          data: lastQueryResult ?? { text: textContent },
          explanation: textContent,
        };
      }

      // Execute tool calls
      const toolResults = [];
      for (const tc of toolCalls) {
        this.emitStatus(describeQueryToolCall(tc.name, tc.input));
        const result = await this.config.toolRouter.execute(tc.name, tc.input);
        toolResults.push({
          toolCallId: tc.id,
          content: result.content,
          isError: result.isError,
        });

        if (result.isError) {
          // Surface timeout/error hints so the UI (and the model on the next
          // turn) both see why this round failed.
          this.emitStatus(describeQueryError(tc.name, result.content));
        } else {
          try {
            lastQueryResult = JSON.parse(result.content) as Record<string, unknown>;
            this.emitStatus(describeQueryResult(tc.name, lastQueryResult));
          } catch {
            lastQueryResult = { raw: result.content };
          }
        }
      }

      messages.push({
        role: 'user',
        content: '',
        toolResults,
      });
    }

    return {
      role: 'query',
      success: false,
      data: lastQueryResult ?? {},
      explanation: 'Exceeded maximum tool rounds',
      error: 'max_tool_rounds',
    };
  }

  /** Safely emit a progress string if a callback is wired. */
  private emitStatus(message: string): void {
    this.config.onStatus?.(message);
  }
}

/** Produce a short "about to call X" status string for a query-agent tool call. */
function describeQueryToolCall(name: string, input: Record<string, unknown>): string {
  if (name === 'run_sql') {
    const sql = String(input.sql ?? '').replace(/\s+/g, ' ').trim();
    return `Running query: ${sql.length > 80 ? `${sql.slice(0, 77)}...` : sql}`;
  }
  if (name === 'describe_table') {
    return `Inspecting table: ${String(input.table_name ?? 'unknown')}`;
  }
  if (name === 'check_query_hints') {
    return 'Validating query against sampled values…';
  }
  if (name === 'get_schema') {
    return 'Fetching schema…';
  }
  return `Calling ${name}…`;
}

/**
 * Produce a compact status string for a failed tool call. Tries to extract
 * the useful piece of a long error (timeouts, parser errors, undefined cols).
 */
function describeQueryError(name: string, errorContent: string): string {
  if (/timed out/i.test(errorContent)) {
    return 'Query timed out — retrying with a sample or narrower filter';
  }
  if (/does not exist|undefined|unknown column/i.test(errorContent)) {
    return `Column or table not found — will verify with describe_table`;
  }
  const firstLine = errorContent.split('\n')[0] ?? errorContent;
  const compact = firstLine.replace(/\s+/g, ' ').slice(0, 90);
  return `${name} failed: ${compact}`;
}

/** Produce a short "returned X" status string from a tool result payload. */
function describeQueryResult(name: string, result: Record<string, unknown>): string {
  if (name === 'run_sql') {
    const rowCount = (result.rowCount as number | undefined)
      ?? (Array.isArray(result.rows) ? (result.rows as unknown[]).length : undefined);
    if (typeof rowCount === 'number') {
      return `Got ${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'}`;
    }
  }
  if (name === 'check_query_hints') {
    const warnings = Array.isArray(result.warnings) ? (result.warnings as unknown[]).length : 0;
    return warnings === 0 ? 'Query passed validation' : `Query validation: ${warnings} warning(s)`;
  }
  if (name === 'describe_table') {
    return 'Table inspected';
  }
  return `${name} finished`;
}
