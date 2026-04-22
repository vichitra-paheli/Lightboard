import { formatEnd } from '../events/tool-event-formatter';
import type { Message } from '../provider/types';

/** Cap on raw tool output size for tools without an explicit rule. */
const FALLBACK_MAX_BYTES = 16_384;
/** Row cap for query-shaped tool results kept on resume. */
const QUERY_ROW_CAP = 20;
/** Sample row cap for table-analysis-shaped results. */
const ANALYZE_SAMPLE_CAP = 5;

/**
 * A persisted tool result — the shape we store on
 * `conversation_messages.tool_results` rows.
 *
 * Distinct from the live-agent `ToolResult` (`packages/agent/src/provider/types.ts`)
 * in two ways:
 *
 * 1. `content` is not guaranteed to be the full tool output. For big payloads
 *    (rowsets, scratchpad loads) it is a shrunk replay payload — enough for
 *    the LLM to understand what happened on resume, without dragging the full
 *    multi-megabyte history into the next context window.
 * 2. Carries a `summary` string derived from
 *    {@link formatEnd} so the UI can render the terminal `→ 412 rows`-style
 *    suffix without re-parsing the JSON payload.
 */
export interface PersistedToolResult {
  /** Matches the live {@link Message.toolResults} `toolCallId`. */
  toolCallId: string;
  /** Tool name — needed when summarizing on resume so we know which rule to apply. */
  toolName: string;
  /** Propagates error state into the message row. */
  isError?: boolean;
  /** Replay payload — JSON-stringified. May be a truncated view of the original. */
  content: string;
  /** Human-readable tail like `→ 412 rows`, mirroring the SSE `resultSummary`. */
  summary?: string;
  /** Set when {@link content} had data dropped. */
  truncated?: boolean;
}

/**
 * One append-ready row for {@link conversationMessages}. `conversationId`,
 * `orgId`, `id`, and `createdAt` are supplied by the writer — this shape
 * carries only the per-turn fields we derive from the in-memory leader state.
 */
export interface PersistedRow {
  sequence: number;
  role: Message['role'];
  content: string;
  toolCalls: Message['toolCalls'] | null;
  toolResults: PersistedToolResult[] | null;
  viewSpec: Record<string, unknown> | null;
}

/**
 * Shrink a tool-result content string per the per-tool rules documented in
 * the conversation persistence plan. Big rowsets collapse to 20 rows, HTML
 * views are kept intact, scratchpad loads are replaced with a stub, and
 * everything else falls through to a 16 KB cap to prevent runaway storage.
 *
 * The returned {@link PersistedToolResult.summary} is derived from
 * {@link formatEnd} so replays match the live UI's `→ N rows`-style tails.
 */
export function summarizeToolResult(
  name: string,
  rawContent: string,
  isError?: boolean,
): PersistedToolResult {
  const { resultSummary } = formatEnd(name, rawContent, !!isError, 0);
  const base: Pick<PersistedToolResult, 'toolCallId' | 'toolName' | 'isError' | 'summary'> = {
    toolCallId: '', // filled in by caller
    toolName: name,
    ...(isError ? { isError: true } : {}),
    ...(resultSummary ? { summary: resultSummary } : {}),
  };

  // Errors are usually short and diagnostic — keep as-is up to the fallback cap.
  if (isError) {
    return withFallbackCap(base, rawContent);
  }

  // Rowset tools — collapse rows to QUERY_ROW_CAP.
  if (name === 'run_sql' || name === 'execute_query') {
    const shrunk = shrinkRowset(rawContent, QUERY_ROW_CAP);
    if (shrunk) {
      return {
        ...base,
        content: shrunk.content,
        ...(shrunk.truncated ? { truncated: true } : {}),
      };
    }
    return withFallbackCap(base, rawContent);
  }

  // View tools — keep intact, callers hoist the HTML into `viewSpec`.
  if (name === 'create_view' || name === 'modify_view') {
    return { ...base, content: rawContent };
  }

  // Delegate / await — strip bulky data payloads, keep control-plane summary.
  if (
    name === 'delegate_query' ||
    name === 'delegate_view' ||
    name === 'delegate_analyst' ||
    name === 'delegate_insights' ||
    name === 'await_tasks'
  ) {
    return { ...base, content: stripDelegatePayload(rawContent) };
  }

  // analyze_data / analyze_table style — keep schema + findings, trim samples.
  if (name === 'analyze_data' || name === 'analyze_table') {
    return { ...base, content: shrinkAnalysis(rawContent) };
  }

  // Scratchpad load on a resumed session can't return real data — stub it
  // so the LLM doesn't think the row count/samples are still live.
  if (name === 'load_scratchpad') {
    const requestedId = extractScratchpadId(rawContent);
    const stub = {
      note: 'scratchpad_not_restored',
      ...(requestedId ? { requestedId } : {}),
    };
    return { ...base, content: JSON.stringify(stub) };
  }

  // Schema-shaped tools — small and fully useful on resume.
  if (
    name === 'get_schema' ||
    name === 'describe_table' ||
    name === 'check_query_hints' ||
    name === 'propose_schema_doc' ||
    name === 'narrate_summary'
  ) {
    return withFallbackCap(base, rawContent);
  }

  // Unknown tool — fall through to the generic byte cap.
  return withFallbackCap(base, rawContent);
}

/**
 * Convert an in-memory leader history slice into rows ready to insert into
 * `conversation_messages`. `priorSeq` is the highest existing sequence for
 * the conversation (0 on first turn) — new rows start at `priorSeq + 1` and
 * climb from there.
 *
 * Each tool result is routed through {@link summarizeToolResult} so we never
 * persist multi-megabyte rowsets. When an assistant message calls
 * `create_view` or `modify_view`, the row that carries its tool results also
 * surfaces the rendered HTML in `viewSpec` for cheap filmstrip rendering.
 */
export function toPersistedMessages(msgs: Message[], priorSeq: number): PersistedRow[] {
  return msgs.map((m, i) => {
    const toolResults = m.toolResults
      ? m.toolResults.map((tr) => {
          // The live `ToolResult` only carries `toolCallId`, `content`, and
          // `isError` — we don't have the original tool name at this layer.
          // Fall back to a generic label; tools we care about (create_view,
          // run_sql, ...) are recognized by the caller via `viewSpec` hoist
          // and by the replay path that re-infers from the paired toolCalls.
          const persisted = summarizeToolResult('unknown', tr.content, tr.isError);
          return { ...persisted, toolCallId: tr.toolCallId };
        })
      : null;

    return {
      sequence: priorSeq + i + 1,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls ?? null,
      toolResults,
      viewSpec: null,
    };
  });
}

/**
 * Like {@link toPersistedMessages}, but uses the preceding assistant
 * message's `toolCalls` array to recover the tool name for each result so
 * per-tool summarization rules fire correctly. Also hoists the HTML payload
 * from `create_view` / `modify_view` outputs onto the row's `viewSpec`.
 *
 * This is the writer the SSE route uses — the plain `toPersistedMessages`
 * exists for callers that only have the raw history without adjacent tool
 * metadata (tests, utilities).
 */
export function toPersistedMessagesWithNames(
  msgs: Message[],
  priorSeq: number,
): PersistedRow[] {
  const toolNamesById = new Map<string, string>();

  // Pre-scan: every `toolCalls` entry gives us an `id → name` mapping so the
  // matching `toolResults` (one message later) can look up its source tool.
  for (const m of msgs) {
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        toolNamesById.set(tc.id, tc.name);
      }
    }
  }

  return msgs.map((m, i) => {
    let viewSpec: Record<string, unknown> | null = null;
    const toolResults = m.toolResults
      ? m.toolResults.map((tr) => {
          const toolName = toolNamesById.get(tr.toolCallId) ?? 'unknown';
          const persisted = summarizeToolResult(toolName, tr.content, tr.isError);
          if (
            !tr.isError &&
            (toolName === 'create_view' || toolName === 'modify_view')
          ) {
            const hoisted = hoistViewSpec(tr.content);
            if (hoisted) viewSpec = hoisted;
          }
          return { ...persisted, toolCallId: tr.toolCallId };
        })
      : null;

    return {
      sequence: priorSeq + i + 1,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls ?? null,
      toolResults,
      viewSpec,
    };
  });
}

/**
 * Cheap rehydration — a persisted row back into the live
 * `Message` shape the leader's {@link ConversationManager} expects. The
 * resulting `toolResults` are the summarized `content` strings, not the
 * original rowsets; follow-ups that need fresh data should re-run the query.
 */
export function hydratePersistedMessage(row: {
  role: Message['role'];
  content: string;
  toolCalls: unknown;
  toolResults: unknown;
}): Message {
  const msg: Message = {
    role: row.role,
    content: row.content,
  };
  if (Array.isArray(row.toolCalls) && row.toolCalls.length > 0) {
    msg.toolCalls = row.toolCalls as Message['toolCalls'];
  }
  if (Array.isArray(row.toolResults) && row.toolResults.length > 0) {
    msg.toolResults = (row.toolResults as PersistedToolResult[]).map((r) => ({
      toolCallId: r.toolCallId,
      content: r.content,
      ...(r.isError ? { isError: true } : {}),
    }));
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Apply the generic 16 KB cap + attach `truncated` when a trim happens. */
function withFallbackCap(
  base: Omit<PersistedToolResult, 'content' | 'truncated'>,
  raw: string,
): PersistedToolResult {
  if (raw.length <= FALLBACK_MAX_BYTES) {
    return { ...base, content: raw };
  }
  return {
    ...base,
    content: raw.slice(0, FALLBACK_MAX_BYTES) + '...[truncated]',
    truncated: true,
  };
}

/**
 * Parse a rowset payload (`{columns, rows, rowCount}`) and keep the first
 * `cap` rows. Returns null if the payload doesn't look like a rowset — the
 * caller should fall through to the generic byte cap.
 */
function shrinkRowset(
  raw: string,
  cap: number,
): { content: string; truncated: boolean } | null {
  const parsed = safeParseObject(raw);
  if (!parsed) return null;
  const rows = Array.isArray(parsed.rows) ? parsed.rows : null;
  if (!rows) return null;
  const keptRows = rows.slice(0, cap);
  const truncated = rows.length > cap;
  const out: Record<string, unknown> = {
    ...parsed,
    rows: keptRows,
  };
  if (truncated) out.truncatedRowCount = rows.length;
  return { content: JSON.stringify(out), truncated };
}

/**
 * Strip the bulky `data.rows` payload from a delegate/await result while
 * keeping `success`, `role`, `summary`, and `viewSpec` — everything a resumed
 * leader needs to understand what each sub-agent actually produced.
 */
function stripDelegatePayload(raw: string): string {
  const parsed = safeParseObject(raw);
  if (!parsed) return truncateBytes(raw);

  // await_tasks returns a map of taskId → entry — strip each entry individually.
  // We detect this shape by the absence of a top-level `success` / `role` and
  // the presence of at least one value that itself looks like a delegate result.
  const looksLikeAwaitMap = !(
    'success' in parsed || 'role' in parsed || 'summary' in parsed
  ) && Object.values(parsed).some((v) => isDelegateEntry(v));

  if (looksLikeAwaitMap) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = isDelegateEntry(v) ? stripSingleDelegateEntry(v as Record<string, unknown>) : v;
    }
    return JSON.stringify(out);
  }

  return JSON.stringify(stripSingleDelegateEntry(parsed));
}

/** True when a value has the shape of a single delegate result entry. */
function isDelegateEntry(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return 'success' in obj || 'role' in obj || 'summary' in obj || 'viewSpec' in obj || 'data' in obj;
}

/** Build a shrunken copy of a single delegate entry. */
function stripSingleDelegateEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const keep: Record<string, unknown> = {};
  if ('success' in entry) keep.success = entry.success;
  if ('role' in entry) keep.role = entry.role;
  if ('summary' in entry) keep.summary = entry.summary;
  if ('error' in entry) keep.error = entry.error;
  if ('scratchpad_table' in entry) keep.scratchpad_table = entry.scratchpad_table;
  if ('scratchpadTable' in entry) keep.scratchpadTable = entry.scratchpadTable;
  if ('viewSpec' in entry) keep.viewSpec = entry.viewSpec;
  if ('data_summary' in entry) keep.data_summary = entry.data_summary;
  // Note: we drop `data.rows` but keep the rest of `data` (e.g. findings)
  if (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
    const data = { ...(entry.data as Record<string, unknown>) };
    delete data.rows;
    keep.data = data;
  }
  return keep;
}

/**
 * Keep `columns`, `rowCount`, `findings`, and the first N sample rows from an
 * analyze_* result; drop the rest. Falls through to the generic byte cap if
 * the payload isn't shaped as expected.
 */
function shrinkAnalysis(raw: string): string {
  const parsed = safeParseObject(raw);
  if (!parsed) return truncateBytes(raw);
  const out: Record<string, unknown> = {};
  if ('columns' in parsed) out.columns = parsed.columns;
  if ('rowCount' in parsed) out.rowCount = parsed.rowCount;
  if ('findings' in parsed) out.findings = parsed.findings;
  if (Array.isArray(parsed.sampleRows)) {
    out.sampleRows = parsed.sampleRows.slice(0, ANALYZE_SAMPLE_CAP);
  }
  return JSON.stringify(out);
}

/**
 * Pull the requested scratchpad table id out of a load_scratchpad result if
 * the tool left one in its output. Best-effort — returns null when the shape
 * doesn't match, which is fine because the stub is already minimal.
 */
function extractScratchpadId(raw: string): string | null {
  const parsed = safeParseObject(raw);
  if (!parsed) return null;
  if (typeof parsed.id === 'string') return parsed.id;
  if (typeof parsed.name === 'string') return parsed.name;
  if (typeof parsed.table === 'string') return parsed.table;
  return null;
}

/**
 * Pull the HTML view payload out of a create_view / modify_view result for
 * the denormalized `viewSpec` column. Expected shape is `{viewSpec: {...}}`;
 * we also accept a top-level view object for tools that flatten the shape.
 */
function hoistViewSpec(raw: string): Record<string, unknown> | null {
  const parsed = safeParseObject(raw);
  if (!parsed) return null;
  const candidate =
    parsed.viewSpec && typeof parsed.viewSpec === 'object'
      ? (parsed.viewSpec as Record<string, unknown>)
      : parsed;
  if (!candidate || typeof candidate !== 'object') return null;
  // Only keep the fields the UI actually renders. Avoid accidentally
  // hoisting something that isn't a view.
  if (!('html' in candidate) && !('viewId' in candidate)) return null;
  const keep: Record<string, unknown> = {};
  if ('html' in candidate) keep.html = candidate.html;
  if ('title' in candidate) keep.title = candidate.title;
  if ('sql' in candidate) keep.sql = candidate.sql;
  if ('viewId' in candidate) keep.viewId = candidate.viewId;
  if ('description' in candidate) keep.description = candidate.description;
  return keep;
}

/** Apply the generic 16 KB cap to a raw string. */
function truncateBytes(raw: string): string {
  if (raw.length <= FALLBACK_MAX_BYTES) return raw;
  return raw.slice(0, FALLBACK_MAX_BYTES) + '...[truncated]';
}

/** Parse-and-reject-non-objects helper. */
function safeParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON — caller falls through */
  }
  return null;
}
