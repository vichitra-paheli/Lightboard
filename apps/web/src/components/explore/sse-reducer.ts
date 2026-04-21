/**
 * Pure SSE → parts[] reducer.
 *
 * The explore page client hands each SSE event off to this reducer, which
 * returns a new `parts[]` array for the assistant message plus an updated
 * context. Keeping the reducer pure (no React state, no fetch) lets us
 * exercise the full temporal-ordering contract from unit tests with
 * fixture event sequences — the single highest-risk unit of the UI polish
 * sequence, per the plan.
 *
 * Temporal-ordering contract (the whole reason this file exists):
 * - `text` / `thinking` events append to the last part only when the last
 *   part is still the same kind. As soon as a different kind has been
 *   pushed, the next text/thinking delta starts a fresh part. This keeps
 *   "text → tool → text" as three distinct parts rather than collapsing
 *   the two text chunks into one adjacent blob, which is what the legacy
 *   `content: string` model did wrong.
 * - `status` events push a transient part. When any real event arrives
 *   next, the transient part is dropped before that event processes.
 * - `tool_start` / `agent_start` push running parts; their matching ends
 *   flip the in-place status to `done` / `error` (or `aborted` on the
 *   synthetic abort event). Nested tools inside an active agent are
 *   stamped with `parentAgent` so the renderer can indent them.
 */

import type { MessagePart, NarrationBlock } from './chat-message';
import type { ViewSpec } from '@lightboard/viz-core';
import type { HtmlView } from '@/components/view-renderer';

/**
 * Discriminated union of every SSE event shape the reducer understands.
 * The `abort` variant is synthetic — emitted by `handleStop` when the
 * user cancels mid-stream, never by the backend.
 */
export type SSEEventShape =
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'status'; text: string }
  | {
      type: 'tool_start';
      name: string;
      input?: unknown;
      /** Backend-supplied `ToolKind` (uppercase string) used for coloring. */
      kind?: string;
      /** Backend-supplied compact display label. */
      label?: string;
      /** Role of the parent sub-agent, if this tool ran inside one. */
      parentAgent?: string;
    }
  | {
      type: 'tool_end';
      name: string;
      result?: string;
      durationMs?: number;
      isError?: boolean;
      kind?: string;
      label?: string;
      /** Terminal suffix like `→ 412 rows`. */
      resultSummary?: string;
      parentAgent?: string;
    }
  | { type: 'agent_start'; agent: string; task?: string }
  | { type: 'agent_end'; agent: string; summary?: string }
  | {
      type: 'view_created';
      viewSpec: HtmlView | ViewSpec;
      queryResult?: { rows?: Record<string, unknown>[] };
    }
  /**
   * Terminal narration block emitted once per turn. Carries the structured
   * bullets + optional caveat that the UI renders below the assistant turn.
   * Unlike `view_created`, this is not a part — it lives on the message.
   */
  | { type: 'narrate_ready'; narration: NarrationBlock }
  | { type: 'abort' }
  | { type: 'done' };

/**
 * Reducer context carried across events. Tracks the active agent stack so
 * tool_start events can be stamped with `parentAgent`, and the last
 * run_sql / execute_query result so a subsequent `view_created` with a
 * legacy ViewSpec can attach the rows without a separate round-trip.
 */
export interface ReducerContext {
  /** Stack of active agent delegations — top-of-stack is the current parent. */
  activeAgentStack: string[];
  /** Rows from the most recent successful query tool, used as a data fallback for ViewSpec. */
  lastQueryRows: Record<string, unknown>[] | null;
  /** Per-tool-name start timestamps, used to compute durations when tool_end doesn't supply one. */
  toolStartTimes: Record<string, number>;
}

/**
 * Create a fresh reducer context. Call this once per assistant message so
 * each turn starts with an empty agent stack.
 */
export function createReducerContext(): ReducerContext {
  return {
    activeAgentStack: [],
    lastQueryRows: null,
    toolStartTimes: {},
  };
}

/** Internal helper — is this part a kind that absorbs deltas? */
function isAppendableKind(
  kind: MessagePart['kind'],
): kind is 'text' | 'thinking' {
  return kind === 'text' || kind === 'thinking';
}

/** Drop a trailing transient status part if one is sitting on the end. */
function dropTrailingStatus(parts: MessagePart[]): MessagePart[] {
  if (parts.length === 0) return parts;
  const last = parts[parts.length - 1]!;
  if (last.kind === 'status') return parts.slice(0, -1);
  return parts;
}

/**
 * Pure reduction step: given the current `parts[]` and an event, return
 * the next `parts[]` plus an updated context. The input arrays/objects are
 * not mutated — the caller can safely pass the previous React state in.
 */
export function reduceParts(
  parts: MessagePart[],
  event: SSEEventShape,
  ctx: ReducerContext,
): { parts: MessagePart[]; ctx: ReducerContext } {
  // Status parts are transient. The moment a non-status event arrives, drop
  // any trailing status before doing anything else. This is deliberate — a
  // status like "looking up schema" should vanish the instant a real tool
  // call or text chunk lands.
  const basePartsForNonStatus =
    event.type !== 'status' ? dropTrailingStatus(parts) : parts;

  switch (event.type) {
    case 'text':
    case 'thinking': {
      const last = basePartsForNonStatus[basePartsForNonStatus.length - 1];
      // Append to the last part if and only if it's the same appendable
      // kind AND was the last part pushed. Any other kind (tool, view,
      // agent) in between starts a fresh part.
      if (last && isAppendableKind(last.kind) && last.kind === event.type) {
        const merged: MessagePart = {
          kind: event.type,
          text: last.text + event.text,
        };
        return {
          parts: [...basePartsForNonStatus.slice(0, -1), merged],
          ctx,
        };
      }
      const next: MessagePart = { kind: event.type, text: event.text };
      return { parts: [...basePartsForNonStatus, next], ctx };
    }

    case 'status': {
      // If a status is already trailing, replace its text rather than
      // stacking two consecutive transient blocks.
      const last = parts[parts.length - 1];
      if (last && last.kind === 'status') {
        const replaced: MessagePart = {
          kind: 'status',
          text: event.text,
          transient: true,
        };
        return { parts: [...parts.slice(0, -1), replaced], ctx };
      }
      const status: MessagePart = {
        kind: 'status',
        text: event.text,
        transient: true,
      };
      return { parts: [...parts, status], ctx };
    }

    case 'tool_start': {
      // Prefer the backend's explicit parentAgent (sub-agent bubble-up)
      // over the locally-tracked active-agent stack. The stack only moves
      // on agent_start/agent_end which don't fire in dispatch mode.
      const parentAgent =
        event.parentAgent ??
        ctx.activeAgentStack[ctx.activeAgentStack.length - 1];
      const part: MessagePart = {
        kind: 'tool_call',
        name: event.name,
        status: 'running',
        ...(event.input !== undefined ? { input: event.input } : {}),
        ...(parentAgent ? { parentAgent } : {}),
        ...(event.kind !== undefined ? { toolKind: event.kind } : {}),
        ...(event.label !== undefined ? { label: event.label } : {}),
      };
      const nextCtx: ReducerContext = {
        ...ctx,
        toolStartTimes: { ...ctx.toolStartTimes, [event.name]: Date.now() },
      };
      return { parts: [...basePartsForNonStatus, part], ctx: nextCtx };
    }

    case 'tool_end': {
      // Find the last running tool_call part matching this name. We scan
      // right-to-left so overlapping tools with the same name resolve in
      // LIFO order — matches how tool runs actually complete.
      let matchIndex = -1;
      for (let i = basePartsForNonStatus.length - 1; i >= 0; i -= 1) {
        const p = basePartsForNonStatus[i]!;
        if (
          p.kind === 'tool_call' &&
          p.name === event.name &&
          p.status === 'running'
        ) {
          matchIndex = i;
          break;
        }
      }

      const start = ctx.toolStartTimes[event.name];
      // Derive duration: prefer the event's explicit number, else compute
      // from the tracked start time, else leave unset so the UI can hide
      // the column entirely.
      const derivedDuration =
        event.durationMs ?? (start != null ? Date.now() - start : undefined);

      // Update the context's lastQueryRows if this is a successful query tool.
      let nextLastQueryRows = ctx.lastQueryRows;
      if (
        !event.isError &&
        (event.name === 'run_sql' || event.name === 'execute_query') &&
        event.result
      ) {
        try {
          const parsed = JSON.parse(event.result);
          if (parsed && Array.isArray(parsed.rows)) {
            nextLastQueryRows = parsed.rows;
          }
        } catch {
          // Ignore non-JSON results — the query may have failed in a way
          // we can't parse structured rows out of.
        }
      }

      const nextToolStartTimes = { ...ctx.toolStartTimes };
      delete nextToolStartTimes[event.name];
      const nextCtx: ReducerContext = {
        ...ctx,
        lastQueryRows: nextLastQueryRows,
        toolStartTimes: nextToolStartTimes,
      };

      if (matchIndex === -1) {
        // No matching running part — just update ctx and leave parts as is.
        return { parts: basePartsForNonStatus, ctx: nextCtx };
      }

      const existing = basePartsForNonStatus[matchIndex]! as Extract<
        MessagePart,
        { kind: 'tool_call' }
      >;
      const updated: MessagePart = {
        ...existing,
        status: event.isError ? 'error' : 'done',
        ...(event.result !== undefined ? { result: String(event.result) } : {}),
        ...(derivedDuration !== undefined
          ? { durationMs: derivedDuration }
          : {}),
        // Backend-supplied fields win over whatever was stamped at tool_start
        // (tool_start only ever has `kind`; label/resultSummary land here).
        ...(event.kind !== undefined ? { toolKind: event.kind } : {}),
        ...(event.label !== undefined ? { label: event.label } : {}),
        ...(event.resultSummary !== undefined ? { resultSummary: event.resultSummary } : {}),
        ...(event.parentAgent !== undefined ? { parentAgent: event.parentAgent } : {}),
      };
      const nextParts = [
        ...basePartsForNonStatus.slice(0, matchIndex),
        updated,
        ...basePartsForNonStatus.slice(matchIndex + 1),
      ];
      return { parts: nextParts, ctx: nextCtx };
    }

    case 'agent_start': {
      const part: MessagePart = {
        kind: 'agent_delegation',
        agent: event.agent,
        status: 'running',
        ...(event.task !== undefined ? { task: event.task } : {}),
      };
      const nextCtx: ReducerContext = {
        ...ctx,
        activeAgentStack: [...ctx.activeAgentStack, event.agent],
      };
      return { parts: [...basePartsForNonStatus, part], ctx: nextCtx };
    }

    case 'agent_end': {
      // Find the most-recent running delegation matching this agent.
      let matchIndex = -1;
      for (let i = basePartsForNonStatus.length - 1; i >= 0; i -= 1) {
        const p = basePartsForNonStatus[i]!;
        if (
          p.kind === 'agent_delegation' &&
          p.agent === event.agent &&
          p.status === 'running'
        ) {
          matchIndex = i;
          break;
        }
      }

      // Pop the agent off the stack if it matches the top; otherwise strip
      // the first matching occurrence from the stack (defensive for the
      // out-of-order case, which shouldn't happen today but might later).
      let nextStack = ctx.activeAgentStack;
      const topIdx = nextStack.lastIndexOf(event.agent);
      if (topIdx !== -1) {
        nextStack = [
          ...nextStack.slice(0, topIdx),
          ...nextStack.slice(topIdx + 1),
        ];
      }
      const nextCtx: ReducerContext = { ...ctx, activeAgentStack: nextStack };

      if (matchIndex === -1) {
        return { parts: basePartsForNonStatus, ctx: nextCtx };
      }

      const existing = basePartsForNonStatus[matchIndex]! as Extract<
        MessagePart,
        { kind: 'agent_delegation' }
      >;
      const updated: MessagePart = {
        ...existing,
        status: 'done',
        ...(event.summary !== undefined ? { summary: event.summary } : {}),
      };
      const nextParts = [
        ...basePartsForNonStatus.slice(0, matchIndex),
        updated,
        ...basePartsForNonStatus.slice(matchIndex + 1),
      ];
      return { parts: nextParts, ctx: nextCtx };
    }

    case 'view_created': {
      const isHtml = 'html' in event.viewSpec;
      // HtmlView embeds its own rows inside the HTML document; legacy
      // ViewSpec needs rows supplied out-of-band. Prefer the event's
      // explicit queryResult, fall back to the reducer context's tracked
      // last query result.
      const data = isHtml
        ? null
        : (event.queryResult?.rows ?? ctx.lastQueryRows ?? null);
      const part: MessagePart = {
        kind: 'view',
        view: event.viewSpec,
        data,
      };
      // Dedupe / replace-in-place: the backend can emit `view_created` more
      // than once for what the user experiences as a single view —
      //   1. A view-agent's `create_view` tool_end bubbles up AND the
      //      leader's `delegate_view` / `await_tasks` tool_end also carries
      //      the same viewSpec, so the route emits twice.
      //   2. The agent calls `create_view` then `modify_view` on the same
      //      logical view, emitting two distinct but related spec payloads.
      //
      // In both cases the user wants ONE chart block, with the latest spec
      // winning. Find the last `view` part in parts[] (scanning past trailing
      // non-view parts so new post-chart text/tool rows don't confuse the
      // replacement). If no prior view exists in this turn, just append.
      let priorViewIdx = -1;
      for (let i = basePartsForNonStatus.length - 1; i >= 0; i -= 1) {
        if (basePartsForNonStatus[i]!.kind === 'view') {
          priorViewIdx = i;
          break;
        }
      }
      if (priorViewIdx === -1) {
        return { parts: [...basePartsForNonStatus, part], ctx };
      }
      // Replace the existing view part with the new spec. Keep the rest of
      // parts[] (including any text/tool rows that landed between the old
      // view and now — those belong to the same turn).
      const replaced = [
        ...basePartsForNonStatus.slice(0, priorViewIdx),
        part,
        ...basePartsForNonStatus.slice(priorViewIdx + 1),
      ];
      return { parts: replaced, ctx };
    }

    case 'narrate_ready': {
      // Narration lives on the message, not on parts[] — the caller
      // handles surfacing it. Parts are unchanged. We still strip a
      // trailing status if one was sitting on the end, matching the
      // "any real event clears status" contract.
      return { parts: basePartsForNonStatus, ctx };
    }

    case 'abort': {
      // Flip every running tool_call / agent_delegation to `aborted`.
      const nextParts = parts.map((p) => {
        if (p.kind === 'tool_call' && p.status === 'running') {
          return { ...p, status: 'aborted' as const };
        }
        if (p.kind === 'agent_delegation' && p.status === 'running') {
          return { ...p, status: 'aborted' as const };
        }
        return p;
      });
      const nextCtx: ReducerContext = { ...ctx, activeAgentStack: [] };
      return { parts: nextParts, ctx: nextCtx };
    }

    case 'done': {
      // No part-level mutation; the caller flips `isStreaming: false`.
      return { parts, ctx };
    }
  }
}

/**
 * Small OO wrapper around the pure reducer for callers that prefer a
 * stateful handle over threading the context through every call. The
 * React page client uses this — `const reducer = createReducer();` once
 * per stream, then `reducer.apply(event)` per event.
 */
export interface Reducer {
  apply(event: SSEEventShape, prev: MessagePart[]): MessagePart[];
  abort(prev: MessagePart[]): MessagePart[];
}

/**
 * Factory for a stateful {@link Reducer}. Encapsulates the mutable context
 * so callers only deal in parts[] arrays. Each new assistant message
 * should get its own reducer instance.
 */
export function createReducer(): Reducer {
  let ctx = createReducerContext();
  return {
    apply(event, prev) {
      const next = reduceParts(prev, event, ctx);
      ctx = next.ctx;
      return next.parts;
    },
    abort(prev) {
      const next = reduceParts(prev, { type: 'abort' }, ctx);
      ctx = next.ctx;
      return next.parts;
    },
  };
}

/**
 * Parse a raw SSE `(event, data)` pair into a typed {@link SSEEventShape}.
 * Returns `null` for unknown event names or malformed JSON so the caller
 * can skip them cleanly.
 *
 * Note: this does not validate payload shapes beyond the discriminator.
 * Missing required fields on a known event name return `null` — the
 * reducer itself is strict about what it accepts.
 */
export function parseSSEJson(
  event: string,
  raw: string,
): SSEEventShape | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  switch (event) {
    case 'thinking':
      if (typeof data.text !== 'string') return null;
      return { type: 'thinking', text: data.text };
    case 'text':
      if (typeof data.text !== 'string') return null;
      return { type: 'text', text: data.text };
    case 'status':
      if (typeof data.text !== 'string') return null;
      return { type: 'status', text: data.text };
    case 'tool_start':
      if (typeof data.name !== 'string') return null;
      return {
        type: 'tool_start',
        name: data.name,
        ...(data.input !== undefined ? { input: data.input } : {}),
        ...(typeof data.kind === 'string' ? { kind: data.kind } : {}),
        ...(typeof data.label === 'string' ? { label: data.label } : {}),
        ...(typeof data.parentAgent === 'string' ? { parentAgent: data.parentAgent } : {}),
      };
    case 'tool_end':
      if (typeof data.name !== 'string') return null;
      return {
        type: 'tool_end',
        name: data.name,
        ...(typeof data.result === 'string' ? { result: data.result } : {}),
        ...(typeof data.durationMs === 'number'
          ? { durationMs: data.durationMs }
          : {}),
        ...(typeof data.isError === 'boolean' ? { isError: data.isError } : {}),
        ...(typeof data.kind === 'string' ? { kind: data.kind } : {}),
        ...(typeof data.label === 'string' ? { label: data.label } : {}),
        ...(typeof data.resultSummary === 'string' ? { resultSummary: data.resultSummary } : {}),
        ...(typeof data.parentAgent === 'string' ? { parentAgent: data.parentAgent } : {}),
      };
    case 'agent_start':
      if (typeof data.agent !== 'string') return null;
      return {
        type: 'agent_start',
        agent: data.agent,
        ...(typeof data.task === 'string' ? { task: data.task } : {}),
      };
    case 'agent_end':
      if (typeof data.agent !== 'string') return null;
      return {
        type: 'agent_end',
        agent: data.agent,
        ...(typeof data.summary === 'string' ? { summary: data.summary } : {}),
      };
    case 'view_created':
      if (!data.viewSpec || typeof data.viewSpec !== 'object') return null;
      return {
        type: 'view_created',
        viewSpec: data.viewSpec as HtmlView | ViewSpec,
        ...(data.queryResult && typeof data.queryResult === 'object'
          ? { queryResult: data.queryResult as { rows?: Record<string, unknown>[] } }
          : {}),
      };
    case 'narrate_ready': {
      if (!Array.isArray(data.bullets)) return null;
      // Re-shape defensively — the server validates already, but parsing
      // here protects against older backends that might drop keys.
      const bullets: NarrationBlock['bullets'] = [];
      for (const b of data.bullets) {
        if (!b || typeof b !== 'object') return null;
        const obj = b as Record<string, unknown>;
        const rank = obj.rank;
        const headline = obj.headline;
        const body = obj.body;
        if ((rank !== 1 && rank !== 2 && rank !== 3)
          || typeof headline !== 'string'
          || typeof body !== 'string') {
          return null;
        }
        const value = typeof obj.value === 'string' ? obj.value : undefined;
        bullets.push({
          rank,
          headline,
          body,
          ...(value ? { value } : {}),
        });
      }
      bullets.sort((a, b) => a.rank - b.rank);
      const narration: NarrationBlock = {
        bullets,
        ...(typeof data.caveat === 'string' && data.caveat ? { caveat: data.caveat } : {}),
      };
      return { type: 'narrate_ready', narration };
    }
    case 'done':
      return { type: 'done' };
    default:
      return null;
  }
}
