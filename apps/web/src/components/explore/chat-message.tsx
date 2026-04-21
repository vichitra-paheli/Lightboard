'use client';

import type { ViewSpec } from '@lightboard/viz-core';
import type { HtmlView } from '@/components/view-renderer';

/**
 * One ordered chunk of an assistant turn. The reducer in `sse-reducer.ts`
 * emits parts in the exact sequence the agent produces them, preserving the
 * temporal interleaving of text, tool calls, agent delegations, and charts.
 *
 * The legacy shape (`content: string` + parallel `toolCalls: ToolCallData[]`
 * arrays) collapsed all text deltas into one string and pushed every tool
 * call into a separate list — losing the interleaving and making it
 * impossible to render `text → tool → text → tool → chart` correctly. This
 * ordered-parts array is the contract that fixes that bug.
 *
 * Each renderer walks `parts[]` linearly and emits one visual block per
 * part. Clustering of consecutive `tool_call` / `agent_delegation` parts is
 * a pure rendering concern (see {@link AssistantStream}) — it does not
 * change this underlying data.
 */
export type MessagePart =
  | { kind: 'thinking'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'status'; text: string; transient: true }
  | {
      kind: 'tool_call';
      name: string;
      status: 'running' | 'done' | 'error' | 'aborted';
      input?: unknown;
      result?: string;
      durationMs?: number;
      parentAgent?: string;
      /**
       * Backend-supplied semantic kind (uppercase: 'SCHEMA' | 'QUERY' | ...).
       * When present the editorial trace prefers this over its local
       * `kindFor` name-based fallback.
       */
      toolKind?: string;
      /** Backend-supplied compact label like `sql(SELECT batter, SUM(runs)…)`. */
      label?: string;
      /** Backend-supplied terminal suffix like `→ 412 rows`. */
      resultSummary?: string;
    }
  | {
      kind: 'agent_delegation';
      agent: string;
      task?: string;
      status: 'running' | 'done' | 'aborted';
      summary?: string;
    }
  | {
      kind: 'view';
      view: HtmlView | ViewSpec;
      /** Rows for legacy ViewSpec renderers; null for HtmlView (data is embedded). */
      data?: Record<string, unknown>[] | null;
    }
  | { kind: 'suggestions'; items: string[] };

/**
 * Back-compat type alias pointing into the `tool_call` variant. Retained so
 * the rare external caller that referenced this shape in the legacy model
 * still compiles. New code should use `Extract<MessagePart, { kind: 'tool_call' }>`
 * directly.
 */
export type ToolCallData = Extract<MessagePart, { kind: 'tool_call' }>;

/**
 * Back-compat type alias pointing into the `agent_delegation` variant.
 * New code should use `Extract<MessagePart, { kind: 'agent_delegation' }>`
 * directly.
 */
export type AgentIndicatorData = Extract<MessagePart, { kind: 'agent_delegation' }>;

/**
 * Structured KEY TAKEAWAYS block emitted by the leader's `narrate_summary`
 * tool. The renderer draws three numbered rows (01 / 02 / 03) plus an
 * optional amber interpretation-note banner when `caveat` is present.
 *
 * This is a message-level field rather than a {@link MessagePart} variant
 * because it is derived from a dedicated `narrate_ready` SSE event that
 * appears strictly once per assistant turn and renders below the whole
 * parts[] sequence — not interleaved with other parts.
 */
export interface NarrationBlock {
  bullets: Array<{
    rank: 1 | 2 | 3;
    headline: string;
    value?: string;
    body: string;
  }>;
  caveat?: string;
}

/**
 * A single message in the chat. Assistants carry an ordered `parts[]` that
 * the SSE reducer appends to as events arrive. User messages always carry
 * a single `{ kind: 'text' }` part — we keep them in the same shape so the
 * rendering layer doesn't have to branch on role for every field access.
 *
 * `narration`, when present, is the structured KEY TAKEAWAYS block emitted
 * by the leader's `narrate_summary` tool at the end of a data turn.
 */
export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  isStreaming?: boolean;
  narration?: NarrationBlock;
}

/**
 * Type guard for assistant messages. Mostly exists so call sites that only
 * care about streaming state / parts layout can avoid repeating the string
 * comparison inline.
 */
export function isAssistant(m: ChatMessageData): boolean {
  return m.role === 'assistant';
}

/**
 * Returns the first text-part's text content from a message, or `''` if
 * the message carries no text parts. Used by the conversation header to
 * derive a title from the first user message under the new parts[] model.
 */
export function getFirstText(m: ChatMessageData): string {
  for (const p of m.parts) {
    if (p.kind === 'text') return p.text;
  }
  return '';
}
