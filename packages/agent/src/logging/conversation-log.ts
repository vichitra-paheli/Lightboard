import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ToolContext } from '../tools/router';

/**
 * Events captured in the conversation log. Line-oriented JSON.
 *
 * The log is a passive capture for later eval / past-mistakes curation. It is
 * NOT consumed by the running agent. Keep events cheap to serialize; exclude
 * raw result rows, credentials, and chain-of-thought beyond what the tool
 * trace already reveals.
 */
export type ConversationLogEvent =
  | {
      t: 'session_start';
      ts: string;
      session_id: string;
      org_id: string;
      user_message: string;
      data_sources: Array<{ id: string; name: string; type: string }>;
    }
  | {
      t: 'schema_doc_snapshot';
      data_source_id: string;
      data_source_name: string;
      source: 'schemaDoc' | 'schemaContext' | 'cachedSchema' | 'none';
      chars: number;
      doc: string | null;
    }
  | { t: 'user_message'; text: string }
  | { t: 'agent_turn_start'; agent: string; task?: string }
  | { t: 'agent_turn_end'; agent: string; summary?: string }
  | { t: 'thinking'; text: string }
  | { t: 'agent_text'; preview: string; chars: number }
  | {
      t: 'tool_call';
      tool: string;
      call_id?: string;
      input: Record<string, unknown>;
    }
  | {
      t: 'tool_result';
      tool: string;
      call_id?: string;
      status: 'ok' | 'error';
      row_count?: number;
      column_count?: number;
      result_chars?: number;
      error?: string;
      duration_ms?: number;
    }
  | { t: 'task_dispatched'; task_id: string; agent: string; instruction: string }
  | { t: 'task_complete'; task_id: string; agent: string; summary: string; is_error: boolean }
  | { t: 'task_cancelled'; task_id: string }
  | { t: 'session_end'; ts: string; duration_ms: number; stop_reason?: string };

/** Metadata fixed at session start. */
export interface ConversationLogMeta {
  sessionId: string;
  orgId: string;
  userMessage: string;
  dataSources: Array<{ id: string; name: string; type: string }>;
}

/**
 * Buffers conversation events in memory and writes a single JSONL file on
 * flush. Failure to write the log never propagates — the agent response must
 * never be blocked by logging.
 */
export class ConversationLog {
  private events: ConversationLogEvent[] = [];
  private meta: ConversationLogMeta;
  private startedAt: number;
  private filename: string;

  constructor(meta: ConversationLogMeta) {
    this.meta = meta;
    this.startedAt = Date.now();
    const ts = new Date(this.startedAt).toISOString().replace(/[:.]/g, '-');
    this.filename = `${ts}_${meta.sessionId}.jsonl`;

    this.push({
      t: 'session_start',
      ts: new Date(this.startedAt).toISOString(),
      session_id: meta.sessionId,
      org_id: meta.orgId,
      user_message: meta.userMessage,
      data_sources: meta.dataSources,
    });
  }

  /** Append an event. */
  push(event: ConversationLogEvent): void {
    this.events.push(event);
  }

  /**
   * Record a schema-doc snapshot for each data source that has one, so we can
   * later correlate doc quality with query quality.
   */
  snapshotSchemaDocs(
    sources: Array<{
      id: string;
      name: string;
      schemaDoc?: string | null;
      schemaContext?: Record<string, unknown> | null;
      cachedSchema?: Record<string, unknown> | null;
    }>,
  ): void {
    for (const s of sources) {
      let source: 'schemaDoc' | 'schemaContext' | 'cachedSchema' | 'none' = 'none';
      let doc: string | null = null;
      if (s.schemaDoc) {
        source = 'schemaDoc';
        doc = s.schemaDoc;
      } else if (s.schemaContext) {
        source = 'schemaContext';
        doc = JSON.stringify(s.schemaContext);
      } else if (s.cachedSchema) {
        source = 'cachedSchema';
        doc = JSON.stringify(s.cachedSchema);
      }
      this.push({
        t: 'schema_doc_snapshot',
        data_source_id: s.id,
        data_source_name: s.name,
        source,
        chars: doc?.length ?? 0,
        doc,
      });
    }
  }

  /**
   * Close the log with a session_end event and write to disk. Swallows write
   * errors — the log is advisory. Returns the written path (or null on error)
   * for tests.
   */
  async flush(dir: string, stopReason?: string): Promise<string | null> {
    this.push({
      t: 'session_end',
      ts: new Date().toISOString(),
      duration_ms: Date.now() - this.startedAt,
      stop_reason: stopReason,
    });

    try {
      await fs.mkdir(dir, { recursive: true });
      const fullPath = path.join(dir, this.filename);
      const body = this.events.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await fs.writeFile(fullPath, body, 'utf8');
      return fullPath;
    } catch (err) {
      console.warn('[ConversationLog] Failed to flush log:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /** Accessor for tests — returns a shallow copy. */
  getEvents(): ConversationLogEvent[] {
    return [...this.events];
  }
}

/**
 * Wraps a ToolContext so every SQL execution and schema call is recorded with
 * its input and a sanitized summary of the output. Rows are stripped; only
 * column count and row count survive.
 */
export function wrapToolContext(ctx: ToolContext, log: ConversationLog): ToolContext {
  return {
    ...ctx,
    getSchema: async (sourceId) => {
      const start = Date.now();
      log.push({ t: 'tool_call', tool: 'get_schema', input: { source_id: sourceId } });
      try {
        const result = await ctx.getSchema(sourceId);
        log.push({
          t: 'tool_result',
          tool: 'get_schema',
          status: 'ok',
          duration_ms: Date.now() - start,
          result_chars: JSON.stringify(result).length,
        });
        return result;
      } catch (err) {
        log.push({
          t: 'tool_result',
          tool: 'get_schema',
          status: 'error',
          duration_ms: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    runSQL: ctx.runSQL
      ? async (sourceId, sql) => {
          const start = Date.now();
          log.push({ t: 'tool_call', tool: 'run_sql', input: { source_id: sourceId, sql } });
          try {
            const result = await ctx.runSQL!(sourceId, sql);
            const cols = (result as { columns?: unknown[] }).columns;
            const rows = (result as { rows?: unknown[]; rowCount?: number }).rows;
            log.push({
              t: 'tool_result',
              tool: 'run_sql',
              status: 'ok',
              duration_ms: Date.now() - start,
              row_count: (result as { rowCount?: number }).rowCount ?? rows?.length ?? 0,
              column_count: Array.isArray(cols) ? cols.length : undefined,
            });
            return result;
          } catch (err) {
            log.push({
              t: 'tool_result',
              tool: 'run_sql',
              status: 'error',
              duration_ms: Date.now() - start,
              error: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        }
      : undefined,
    describeTable: ctx.describeTable
      ? async (sourceId, tableName) => {
          const start = Date.now();
          log.push({
            t: 'tool_call',
            tool: 'describe_table',
            input: { source_id: sourceId, table_name: tableName },
          });
          try {
            const result = await ctx.describeTable!(sourceId, tableName);
            log.push({
              t: 'tool_result',
              tool: 'describe_table',
              status: 'ok',
              duration_ms: Date.now() - start,
              result_chars: JSON.stringify(result).length,
            });
            return result;
          } catch (err) {
            log.push({
              t: 'tool_result',
              tool: 'describe_table',
              status: 'error',
              duration_ms: Date.now() - start,
              error: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        }
      : undefined,
  };
}

/**
 * Default log directory: `<repo-root>/.agent-logs/`.
 *
 * Walks up from `process.cwd()` looking for a workspace marker
 * (`pnpm-workspace.yaml`, `.git`) so logs land at the repo root even when
 * the caller is a monorepo app with `cwd = apps/web` (as Next.js does in
 * `next dev`). Falls back to cwd if no marker is found.
 */
export function defaultLogDir(): string {
  return path.join(resolveRepoRoot(), '.agent-logs');
}

/** Internal: find the nearest ancestor containing a workspace marker. */
function resolveRepoRoot(start: string = process.cwd()): string {
  const markers = ['pnpm-workspace.yaml', '.git'];
  let dir = start;
  for (let i = 0; i < 10; i++) {
    for (const m of markers) {
      if (existsSync(path.join(dir, m))) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
