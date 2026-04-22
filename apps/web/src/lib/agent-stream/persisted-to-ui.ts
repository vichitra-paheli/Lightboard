import type { ChatMessageData, MessagePart } from '@/components/explore/chat-message';
import type { HtmlView } from '@/components/view-renderer';

/**
 * One persisted message row, as returned by `GET /api/conversations/[id]`.
 * Mirrors the columns of `conversation_messages` (see
 * `packages/db/src/schema/conversations.ts`). Field types are the wire shape
 * after JSON.parse, so jsonb columns surface as plain objects/arrays.
 */
export interface PersistedMessage {
  id: string;
  sequence: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: PersistedToolCall[] | null;
  toolResults: PersistedToolResultRow[] | null;
  viewSpec: PersistedViewSpec | null;
  createdAt?: string;
}

/** Wire-shape mirror of `ToolCallResult` from the agent package. */
interface PersistedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Wire-shape mirror of `PersistedToolResult` from
 * `packages/agent/src/conversation/persisted.ts`. Kept duplicated rather
 * than imported so the client adapter doesn't pull the agent package's
 * server-side helpers into the client bundle.
 */
interface PersistedToolResultRow {
  toolCallId: string;
  toolName?: string;
  isError?: boolean;
  content: string;
  summary?: string;
  truncated?: boolean;
}

/**
 * Denormalized HTML view payload. Source of truth lives in `tool_results` —
 * this column is a render convenience for the filmstrip + thread.
 */
interface PersistedViewSpec {
  html?: string;
  title?: string;
  sql?: string;
  viewId?: string;
  description?: string;
}

/**
 * Convert persisted message rows into the `ChatMessageData[]` the Explore
 * thread renders. Every assistant "turn" on disk spans multiple rows
 * (`assistant + tool calls → user + tool results → assistant + next tool
 * calls → ...`); this collapses each contiguous run of those rows into a
 * single `ChatMessageData` with parts in the same temporal order the live
 * SSE reducer would have produced.
 *
 * Behavior contract:
 *   1. Each `role === 'user'` row with non-empty `content` and no
 *      `toolResults` becomes its own `{ role: 'user' }` message.
 *   2. Assistant text → `{ kind: 'text' }`. Empty assistant text rows still
 *      contribute their tool calls to the in-progress turn.
 *   3. `toolCalls[]` → `{ kind: 'tool_call' }` parts in order, paired with
 *      the matching `toolResultsById` entry from the immediately-following
 *      `user` row when one exists.
 *   4. When a row carries a non-null `viewSpec`, an additional
 *      `{ kind: 'view' }` part is appended after that row's tool calls so
 *      the HTML chart renders in the same position the live stream would
 *      have placed it.
 *
 * The adapter intentionally does not synthesize narration / suggestions —
 * those were transient in the live stream and not persisted.
 */
export function persistedToUi(rows: PersistedMessage[]): ChatMessageData[] {
  const out: ChatMessageData[] = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i]!;

    // User message that originated from the human (no tool results attached).
    const isHumanUserMessage =
      row.role === 'user' &&
      (!row.toolResults || row.toolResults.length === 0) &&
      row.content.length > 0;

    if (isHumanUserMessage) {
      out.push({
        id: row.id,
        role: 'user',
        parts: [{ kind: 'text', text: row.content }],
      });
      i += 1;
      continue;
    }

    if (row.role === 'assistant') {
      // Walk forward collecting consecutive assistant + tool-result rows
      // into a single rendered turn. The pattern on disk is:
      //   [assistant, user(toolResults), assistant, user(toolResults), ...]
      // ending when the next assistant row carries no toolCalls or we hit
      // a different role.
      const turnRows: PersistedMessage[] = [];
      let j = i;
      while (j < rows.length) {
        const r = rows[j]!;
        if (r.role === 'assistant') {
          turnRows.push(r);
          j += 1;
          // Consume the matching toolResults row, if any.
          const next = rows[j];
          if (
            next &&
            next.role === 'user' &&
            next.toolResults &&
            next.toolResults.length > 0
          ) {
            turnRows.push(next);
            j += 1;
            continue;
          }
          break;
        }
        break;
      }

      const parts = buildAssistantParts(turnRows);
      out.push({ id: row.id, role: 'assistant', parts });
      i = j;
      continue;
    }

    // System rows (truncation markers etc.) are not rendered in the thread.
    i += 1;
  }

  return out;
}

/**
 * Stitch a contiguous assistant-turn run of persisted rows into the ordered
 * `parts[]` shape the thread expects. Tool calls on row N are paired with
 * tool results on row N+1 (when present). HTML view specs are appended
 * after the tool call that produced them.
 */
function buildAssistantParts(turnRows: PersistedMessage[]): MessagePart[] {
  const parts: MessagePart[] = [];

  for (let k = 0; k < turnRows.length; k += 1) {
    const r = turnRows[k]!;
    if (r.role !== 'assistant') continue;

    if (r.content.length > 0) {
      parts.push({ kind: 'text', text: r.content });
    }

    if (!r.toolCalls || r.toolCalls.length === 0) continue;

    // The toolResults arrive on the next row (a user message). Build a
    // lookup so we can pair without scanning each iteration.
    const next = turnRows[k + 1];
    const resultsByCallId = new Map<string, PersistedToolResultRow>();
    if (
      next &&
      next.role === 'user' &&
      next.toolResults &&
      next.toolResults.length > 0
    ) {
      for (const tr of next.toolResults) {
        resultsByCallId.set(tr.toolCallId, tr);
      }
    }

    for (const tc of r.toolCalls) {
      const result = resultsByCallId.get(tc.id);
      const status: 'done' | 'error' = result?.isError ? 'error' : 'done';
      const part: Extract<MessagePart, { kind: 'tool_call' }> = {
        kind: 'tool_call',
        name: tc.name,
        status,
        input: tc.input,
        // `toolKind` and `label` are populated by the SSE reducer from the
        // live `tool_start` payload. The renderer falls back to its
        // built-in `kindFor`/derived label when these are absent — fine
        // for resumed turns since the only consumer is the trace UI.
        ...(result?.summary ? { resultSummary: result.summary } : {}),
        ...(result?.content !== undefined ? { result: result.content } : {}),
      };
      parts.push(part);
    }

    // Hoist any HTML view from the row's denormalized viewSpec column.
    // Rendering a `{ kind: 'view' }` part lets the same Thread/Filmstrip
    // code that handles live streams pick this up — no resume-specific
    // branching required.
    const viewSource = next?.viewSpec?.html
      ? next.viewSpec
      : r.viewSpec?.html
      ? r.viewSpec
      : null;
    if (viewSource && viewSource.html) {
      const view: HtmlView = {
        html: viewSource.html,
        // `sql` is required by HtmlView; persisted writers always supply it
        // for create_view results, but old rows may have dropped it on the
        // floor. Empty string keeps the type contract.
        sql: viewSource.sql ?? '',
        ...(viewSource.title ? { title: viewSource.title } : {}),
        ...(viewSource.description ? { description: viewSource.description } : {}),
      };
      parts.push({ kind: 'view', view, data: null });
    }
  }

  return parts;
}
