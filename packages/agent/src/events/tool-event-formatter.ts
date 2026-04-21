/**
 * Pure classification and label/result formatters for tool call events.
 *
 * The editorial trace UI wants three things on every tool row:
 *   1. a `kind` bucket so it can color-code the row (SCHEMA teal, QUERY warm,
 *      VIZ butter, etc.);
 *   2. a compact human-friendly `label` like `sql(SELECT batter, SUM(runs)…)`
 *      instead of the tool name + a dump of its JSON arguments;
 *   3. a terminal `result_summary` like `→ 412 rows` or `→ view created` so
 *      the row reads at a glance.
 *
 * These functions are intentionally pure — no logger, no I/O, no timers — so
 * they are trivial to test and cheap to call from both the leader and
 * monolithic agent paths.
 */

/**
 * Bucket a tool name falls into for display purposes. The UI maps each kind
 * to a CSS token (`--kind-schema`, `--kind-query`, etc.). New tools should
 * land in one of these six buckets — grow the union only if a new bucket
 * genuinely cannot fit.
 */
export type ToolKind =
  | 'SCHEMA'
  | 'QUERY'
  | 'COMPUTE'
  | 'FILTER'
  | 'VIZ'
  | 'NARRATE';

/** Max length of a compact single-line tool label before we truncate. */
const LABEL_MAX_LEN = 60;

/** Tools that introspect the data source and return schema metadata. */
const SCHEMA_TOOLS = new Set([
  'get_schema',
  'describe_table',
  'introspect_schema',
  'propose_schema_doc',
]);

/** Tools that actually execute a query and return rows. */
const QUERY_TOOLS = new Set(['run_sql', 'execute_query']);

/** Tools that validate / shape a query without executing it on the source. */
const FILTER_TOOLS = new Set(['check_query_hints', 'apply_filter']);

/** Tools that produce or mutate a visualization. */
const VIZ_TOOLS = new Set(['create_view', 'modify_view']);

/**
 * Tools that perform scratchpad / DuckDB-side computation or explicitly
 * touch the in-memory scratchpad. Control-plane dispatch/await calls also
 * land here — they aren't direct data work but they're "the agent doing
 * something" in the COMPUTE sense the UI renders as a neutral lavender.
 */
const COMPUTE_TOOLS = new Set([
  'analyze_data',
  'list_scratchpads',
  'load_scratchpad',
]);

/**
 * Map a tool name to its {@link ToolKind}. Unknown tools fall through to
 * `COMPUTE` so the UI always has a color to render — better than a blank
 * row or a runtime error.
 */
export function classifyTool(name: string): ToolKind {
  if (SCHEMA_TOOLS.has(name)) return 'SCHEMA';
  if (QUERY_TOOLS.has(name)) return 'QUERY';
  if (FILTER_TOOLS.has(name)) return 'FILTER';
  if (VIZ_TOOLS.has(name)) return 'VIZ';
  if (COMPUTE_TOOLS.has(name)) return 'COMPUTE';
  if (name === 'narrate_summary') return 'NARRATE';
  // dispatch_* / delegate_* / await_tasks / cancel_task — control plane.
  if (
    name.startsWith('dispatch_') ||
    name.startsWith('delegate_') ||
    name === 'await_tasks' ||
    name === 'cancel_task'
  ) {
    return 'COMPUTE';
  }
  return 'COMPUTE';
}

/**
 * Collapse runs of whitespace into a single space and trim both ends.
 * Used on SQL bodies so multi-line statements render on one line.
 */
function compactWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Truncate a string to `max` characters, appending a single-char ellipsis
 * (`…`) when truncation happened. Leaves short strings untouched.
 */
function truncate(s: string, max: number = LABEL_MAX_LEN): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/**
 * Reduce a SQL body to its SELECT clause (up to but not including FROM),
 * then truncate to the label ceiling. Falls back to a plain truncate when
 * the SQL has no FROM clause (subqueries with only CTEs, `SELECT 1`, etc.).
 */
function summarizeSql(sql: string): string {
  const compact = compactWhitespace(sql);
  const fromMatch = /\bfrom\b/i.exec(compact);
  const body = fromMatch ? compact.slice(0, fromMatch.index).trim() : compact;
  return truncate(body);
}

/**
 * Build the compact single-line label for a tool call as it starts.
 *
 * Shape mimics the design reference: `toolname(<short arg hint>)`. The
 * shape stays consistent across tools so the UI renders a uniform column
 * regardless of which specialist is running.
 */
export function formatStart(
  name: string,
  input: unknown,
): { kind: ToolKind; label: string } {
  const kind = classifyTool(name);
  const obj = (input && typeof input === 'object' ? (input as Record<string, unknown>) : {});

  // run_sql / execute_query — summarize the SQL body.
  if (name === 'run_sql' || name === 'execute_query') {
    const sql = typeof obj.sql === 'string' ? obj.sql : '';
    if (sql) {
      return { kind, label: `sql(${summarizeSql(sql)})` };
    }
    return { kind, label: `${name}()` };
  }

  // describe_table — prefer the table name directly so the row reads
  // `describe_table(cricket.ball_by_ball)` not a JSON blob.
  if (name === 'describe_table') {
    const source = typeof obj.source_id === 'string' ? obj.source_id : '';
    const table = typeof obj.table_name === 'string'
      ? obj.table_name
      : typeof obj.table === 'string'
      ? obj.table
      : '';
    if (table) {
      const qualified = source ? `${source}.${table}` : table;
      return { kind, label: `describe_table(${truncate(qualified)})` };
    }
    return { kind, label: 'describe_table()' };
  }

  // create_view / modify_view — title is the most useful identifier.
  if (name === 'create_view' || name === 'modify_view') {
    const title = typeof obj.title === 'string' ? obj.title : '';
    if (title) {
      return { kind, label: `${name}(${truncate(title, 40)})` };
    }
    return { kind, label: `${name}()` };
  }

  // dispatch_* / delegate_* — instruction first ~40 chars.
  if (name.startsWith('dispatch_') || name.startsWith('delegate_')) {
    const instr = typeof obj.instruction === 'string' ? obj.instruction : '';
    if (instr) {
      return { kind, label: `${name}(${truncate(compactWhitespace(instr), 40)})` };
    }
    return { kind, label: `${name}()` };
  }

  // await_tasks — count the tasks the leader is waiting on.
  if (name === 'await_tasks') {
    const ids = Array.isArray(obj.task_ids) ? obj.task_ids.length : 0;
    const plural = ids === 1 ? '' : 's';
    return { kind, label: `await_tasks(${ids} task${plural})` };
  }

  // analyze_data — the description is the human-friendly hint.
  if (name === 'analyze_data') {
    const desc = typeof obj.description === 'string' ? obj.description : '';
    if (desc) {
      return { kind, label: `analyze_data(${truncate(compactWhitespace(desc), 40)})` };
    }
    return { kind, label: 'analyze_data()' };
  }

  // propose_schema_doc — no meaningful inputs to display.
  if (name === 'propose_schema_doc') {
    const source = typeof obj.source_id === 'string' ? obj.source_id : '';
    return {
      kind,
      label: source ? `propose_schema_doc(${truncate(source, 40)})` : 'propose_schema_doc()',
    };
  }

  // Default: tool name + parenthesized empty body so the UI stays uniform.
  return { kind, label: `${name}()` };
}

/**
 * Try to parse a tool's raw string output as JSON, returning `undefined`
 * if the content isn't valid JSON. Kept loose because tools commonly
 * return plain strings on error paths.
 */
function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Derive a terminal `→ ...` summary for a completed tool call.
 *
 * The UI falls back to a plain duration when `resultSummary` is undefined,
 * so returning `{ }` on unknown shapes is a valid and expected outcome —
 * do not invent a fake summary.
 */
export function formatEnd(
  name: string,
  output: string,
  isError: boolean,
  _durationMs: number,
): { resultSummary?: string } {
  if (isError) {
    return { resultSummary: '→ error' };
  }

  // run_sql / execute_query — report the row count.
  if (name === 'run_sql' || name === 'execute_query') {
    const parsed = safeParseJson(output);
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      const rowCount = typeof p.rowCount === 'number'
        ? p.rowCount
        : Array.isArray(p.rows)
        ? p.rows.length
        : undefined;
      if (typeof rowCount === 'number') {
        return { resultSummary: `→ ${rowCount.toLocaleString()} rows` };
      }
    }
    return {};
  }

  if (name === 'create_view') {
    return { resultSummary: '→ view created' };
  }
  if (name === 'modify_view') {
    return { resultSummary: '→ view updated' };
  }

  // analyze_data — prefer the count of structured findings.
  if (name === 'analyze_data') {
    const parsed = safeParseJson(output);
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (Array.isArray(p.findings)) {
        const n = p.findings.length;
        return { resultSummary: `→ ${n} finding${n === 1 ? '' : 's'}` };
      }
      // Fall through to rows-style summary for analyses that return rows.
      const rowCount = typeof p.rowCount === 'number'
        ? p.rowCount
        : Array.isArray(p.rows)
        ? p.rows.length
        : undefined;
      if (typeof rowCount === 'number') {
        return { resultSummary: `→ ${rowCount.toLocaleString()} rows` };
      }
    }
    return {};
  }

  // await_tasks — count of tasks returned.
  if (name === 'await_tasks') {
    const parsed = safeParseJson(output);
    if (parsed && typeof parsed === 'object') {
      const n = Object.keys(parsed as Record<string, unknown>).length;
      return { resultSummary: `→ ${n} task${n === 1 ? '' : 's'}` };
    }
    return {};
  }

  if (name === 'propose_schema_doc') {
    return { resultSummary: '→ proposed' };
  }

  return {};
}
