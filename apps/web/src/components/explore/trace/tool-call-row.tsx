'use client';

import { LightboardLoader } from '../../brand';
import type { MessagePart } from '../chat-message';

/**
 * Per-kind color palette from the handoff's `EditorialTrace`. Ports the
 * constants once so every row in the trace reads from the same map.
 * `run_sql` / `execute_query` → query (warm amber). `get_schema`,
 * `describe_table`, `introspect_schema` → schema (teal). `create_view`,
 * `modify_view` → viz (butter). Anything else falls back to narrate.
 */
const KIND_COLOR: Record<string, string> = {
  schema: 'var(--kind-schema)',
  query: 'var(--kind-query)',
  compute: 'var(--kind-compute)',
  filter: 'var(--kind-filter)',
  viz: 'var(--kind-viz)',
  narrate: 'var(--kind-narrate)',
};

/**
 * Map a tool name to a semantic kind for coloring. Keep this pure/local —
 * no runtime data-source lookups. New tools can be added here as the
 * backend grows.
 *
 * This remains the fallback path. When the backend supplies `part.toolKind`,
 * the renderer prefers it (the backend's classifier is the source of truth;
 * this function exists so stale bundles still color rows sensibly).
 */
function kindFor(name: string): keyof typeof KIND_COLOR {
  if (name === 'get_schema' || name === 'describe_table' || name === 'introspect_schema') {
    return 'schema';
  }
  if (name === 'run_sql' || name === 'execute_query') return 'query';
  if (name === 'create_view' || name === 'modify_view') return 'viz';
  if (name === 'apply_filter') return 'filter';
  if (name === 'summarize' || name === 'caveat' || name === 'narrate_summary') {
    return 'narrate';
  }
  return 'compute';
}

/**
 * Normalize a `ToolKind` (uppercase, from the backend) to the lowercase key
 * the `KIND_COLOR` map expects. Tolerates unknown values by returning
 * `null` so the caller can fall back to the name-based classifier.
 */
function kindFromBackend(kind: string | undefined): keyof typeof KIND_COLOR | null {
  if (!kind) return null;
  const k = kind.toLowerCase();
  if (k in KIND_COLOR) return k as keyof typeof KIND_COLOR;
  return null;
}

/**
 * Truncate an args string for the single-line display, leaving long SQL
 * intact for the expandable `<details>` below.
 */
function truncateArgs(s: string, max = 60): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/**
 * Compact display string for the `input` side of a tool call.
 * - string → used verbatim
 * - object with a `sql` field → that SQL (long SQL is handled via details)
 * - object → JSON.stringify
 * - undefined → empty string
 */
function displayInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.sql === 'string') return obj.sql;
    try {
      return JSON.stringify(obj);
    } catch {
      return String(input);
    }
  }
  return String(input);
}

/**
 * Derive a "→ N rows" suffix from a tool result JSON, when possible. Used
 * for query tools so the row count is visible at a glance without
 * expanding the result pane.
 */
function rowsFromResult(result: string | undefined): number | null {
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    if (parsed && Array.isArray(parsed.rows)) {
      return (parsed.rows as unknown[]).length;
    }
  } catch {
    /* not JSON — fall through */
  }
  return null;
}

/** Format a duration for the right column, matching the handoff. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Split a backend-supplied label like `sql(SELECT batter, SUM(runs)…)`
 * into `{ name: 'sql', args: 'SELECT batter, SUM(runs)…' }`. Preserves the
 * existing two-tone rendering (name in ink-1, parens in ink-5). Returns
 * null when the label doesn't match the expected shape.
 */
function parseToolLabel(label: string): { name: string; args: string } | null {
  // Find the first `(` and match its closing `)` at the very end.
  const openIdx = label.indexOf('(');
  if (openIdx <= 0) return null;
  if (!label.endsWith(')')) return null;
  return {
    name: label.slice(0, openIdx),
    args: label.slice(openIdx + 1, -1),
  };
}

/**
 * Props for {@link ToolCallRow}.
 */
interface ToolCallRowProps {
  part: Extract<MessagePart, { kind: 'tool_call' }>;
}

/**
 * Single editorial-log row for one tool call. Grid with three columns:
 * [kind label, monospace tool-name(args)[→ rows], duration]. A colored
 * dot sits at the far left (absolute-positioned so it can align with the
 * cluster's dashed timeline).
 *
 * Status semantics:
 * - `running` — 14px rainbow-beam LightboardLoader at the dot position.
 * - `done`    — stable colored hollow dot, duration visible.
 * - `error`   — destructive red dot, duration if available.
 * - `aborted` — ink-5 dot, struck-through tool name.
 *
 * When `parentAgent` is set (a sub-agent ran this tool), the row indents
 * 12px and shows a subtle dimmed bracket on the left so nesting reads
 * visually.
 */
export function ToolCallRow({ part }: ToolCallRowProps) {
  // Prefer the backend-supplied kind; fall back to the name-based map so
  // stale bundles still render sensibly. Lower-cased because CSS tokens
  // are keyed in lowercase while the backend emits uppercase `ToolKind`.
  const kind = kindFromBackend(part.toolKind) ?? kindFor(part.name);
  const kindColor = KIND_COLOR[kind];
  const isRunning = part.status === 'running';
  const isError = part.status === 'error';
  const isAborted = part.status === 'aborted';
  const isNested = !!part.parentAgent;

  // Derive display parts. If the backend supplied a compact `label` use
  // that; otherwise reconstruct from the tool name + args. Long SQL (>100
  // chars) renders in an expandable details block so single-line rows stay
  // readable.
  const raw = displayInput(part.input);
  const isLong = raw.length > 100;
  const inlineArgs = isLong ? truncateArgs(raw) : raw;
  // Parse the backend-supplied `tool(args)` label into its components so we
  // can keep the existing two-tone rendering (`name` in ink-1, parens in
  // ink-5, args in default) without changing the DOM shape.
  const parsedLabel = part.label ? parseToolLabel(part.label) : null;
  const displayName = parsedLabel?.name ?? part.name;
  const displayArgs = parsedLabel?.args ?? inlineArgs;

  // Result-summary precedence:
  //   1) backend-supplied `part.resultSummary` (`→ 412 rows`, `→ view created`)
  //   2) locally-derived `→ N rows` from a parseable run_sql result
  //   3) null — no suffix rendered
  const localRows = rowsFromResult(part.result);
  const summary = part.resultSummary
    ?? (localRows != null ? `→ ${localRows} rows` : null);

  const dotBackground = isRunning ? 'var(--bg-0)' : 'var(--bg-0)';
  const dotBorderColor = isError
    ? 'var(--destructive, #EF4444)'
    : isAborted
    ? 'var(--ink-5)'
    : kindColor;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '70px 1fr auto',
        alignItems: 'baseline',
        gap: 14,
        padding: '6px 0 6px 14px',
        position: 'relative',
        marginLeft: isNested ? 12 : 0,
        borderLeft: isNested ? '1px dashed var(--line-2)' : 'none',
        paddingLeft: isNested ? 14 : 14,
      }}
    >
      {/* Status glyph — 14px rainbow loader while running, hollow kind-colored
          dot when terminal. Absolute-positioned so the size swap doesn't shift
          sibling content. Visual centers align: 8x8 dot centered at x=2 (top) /
          x=14 (nested), y=16; 14x14 loader uses left = center - 7, top = 9. */}
      {isRunning ? (
        <div
          style={{
            position: 'absolute',
            left: isNested ? 7 : -5,
            top: 9,
            width: 14,
            height: 14,
          }}
        >
          <LightboardLoader size={14} ariaLabel="" />
        </div>
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: isNested ? 10 : -2,
            top: 12,
            width: 8,
            height: 8,
            borderRadius: 99,
            background: dotBackground,
            border: `1.5px solid ${dotBorderColor}`,
          }}
        />
      )}
      {/* Kind label */}
      <div
        style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
          fontSize: 9.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: isError
            ? 'var(--destructive, #EF4444)'
            : isAborted
            ? 'var(--ink-5)'
            : kindColor,
        }}
      >
        {kind}
      </div>
      {/* Middle: tool(args) → summary */}
      <div
        style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
          fontSize: 11.5,
          color: 'var(--ink-3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            color: isAborted ? 'var(--ink-5)' : 'var(--ink-1)',
            textDecoration: isAborted ? 'line-through' : 'none',
          }}
        >
          {displayName}
        </span>
        <span style={{ color: 'var(--ink-5)' }}>(</span>
        <span>{displayArgs}</span>
        <span style={{ color: 'var(--ink-5)' }}>)</span>
        {summary && (
          <span style={{ color: 'var(--ink-4)', marginLeft: 8 }}>
            {summary}
          </span>
        )}
      </div>
      {/* Duration */}
      <div
        style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--ink-5)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {part.durationMs != null ? formatDuration(part.durationMs) : ''}
      </div>
      {/* Long args — expandable if truncated above */}
      {isLong && (
        <details
          style={{
            gridColumn: '2 / 3',
            marginTop: 4,
            fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
            fontSize: 11,
            color: 'var(--ink-3)',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              color: 'var(--ink-4)',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            show full
          </summary>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: '6px 0 0',
              padding: '8px 10px',
              background: 'var(--bg-3)',
              border: '1px solid var(--line-2)',
              borderRadius: 6,
              color: 'var(--ink-2)',
              maxHeight: 160,
              overflow: 'auto',
            }}
          >
            {raw}
          </pre>
        </details>
      )}
    </div>
  );
}
