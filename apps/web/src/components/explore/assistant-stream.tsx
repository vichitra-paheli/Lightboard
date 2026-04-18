'use client';

import { Fragment } from 'react';
import { AgentMessage } from './agent-message';
import type { MessagePart } from './chat-message';
import { InlineChartFrame } from './inline-chart-frame';
import { AgentDelegationRow } from './trace/agent-delegation-row';
import { ThinkingPart } from './trace/thinking-part';
import { ToolCallRow } from './trace/tool-call-row';
import { TraceCluster } from './trace/trace-cluster';

/**
 * A "trace part" is anything that belongs inside an editorial-log cluster:
 * tool calls and agent delegations. We treat runs of consecutive trace
 * parts as a single visual cluster with a shared dashed timeline.
 */
function isTracePart(p: MessagePart): boolean {
  return p.kind === 'tool_call' || p.kind === 'agent_delegation';
}

/**
 * Walk `parts[]` and split it into runs of consecutive trace parts vs.
 * single non-trace parts. Preserves order — each output block is either
 * a `{ type: 'cluster', parts }` with 1+ trace parts or a
 * `{ type: 'solo', part }` with a single non-trace part.
 */
function groupParts(
  parts: MessagePart[],
): Array<
  | { type: 'cluster'; parts: MessagePart[]; startIndex: number }
  | { type: 'solo'; part: MessagePart; index: number }
> {
  const out: Array<
    | { type: 'cluster'; parts: MessagePart[]; startIndex: number }
    | { type: 'solo'; part: MessagePart; index: number }
  > = [];
  let buffer: MessagePart[] = [];
  let bufferStart = -1;

  const flush = () => {
    if (buffer.length > 0) {
      out.push({ type: 'cluster', parts: buffer, startIndex: bufferStart });
      buffer = [];
      bufferStart = -1;
    }
  };

  parts.forEach((p, idx) => {
    if (isTracePart(p)) {
      if (buffer.length === 0) bufferStart = idx;
      buffer.push(p);
    } else {
      flush();
      out.push({ type: 'solo', part: p, index: idx });
    }
  });
  flush();
  return out;
}

/**
 * Props for {@link AssistantStream}.
 */
interface AssistantStreamProps {
  parts: MessagePart[];
  /** Turn is actively streaming — last text part gets a blinking cursor. */
  isStreaming?: boolean;
}

/**
 * Renders the assistant side of a turn by iterating over the ordered
 * {@link MessagePart}[] and emitting one block per part. Consecutive
 * tool_call / agent_delegation parts are grouped into a shared
 * {@link TraceCluster} with a dashed timeline; a single trace part gets
 * no cluster wrapper (per design — one row is not a log).
 *
 * Suggestion parts are intentionally NOT rendered here — the caller
 * (`<Turn>`) filters them and renders a single `<SuggestionChips>` at
 * the bottom of the turn.
 *
 * The blinking cursor only attaches to the very last text part when the
 * turn is still streaming. Older text parts never carry the cursor.
 */
export function AssistantStream({ parts, isStreaming }: AssistantStreamProps) {
  // Find the last text part once so we know which one gets the cursor.
  let lastTextIndex = -1;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i]!.kind === 'text') {
      lastTextIndex = i;
      break;
    }
  }

  const groups = groupParts(parts);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        if (g.type === 'cluster') {
          // Single trace row: no cluster wrapper — renders flat.
          if (g.parts.length === 1) {
            const part = g.parts[0]!;
            return (
              <div key={`solo-trace-${g.startIndex}`} className="ml-[40px]">
                {part.kind === 'tool_call' && <ToolCallRow part={part} />}
                {part.kind === 'agent_delegation' && (
                  <AgentDelegationRow part={part} />
                )}
              </div>
            );
          }
          // Multi-row cluster: wrap in TraceCluster so the dashed rule joins them.
          return (
            <TraceCluster key={`cluster-${g.startIndex}`}>
              {g.parts.map((p, i) => (
                <Fragment key={`${g.startIndex}-${i}`}>
                  {p.kind === 'tool_call' && <ToolCallRow part={p} />}
                  {p.kind === 'agent_delegation' && (
                    <AgentDelegationRow part={p} />
                  )}
                </Fragment>
              ))}
            </TraceCluster>
          );
        }

        const { part, index } = g;
        switch (part.kind) {
          case 'thinking':
            return (
              <ThinkingPart
                key={`thinking-${index}`}
                text={part.text}
                isActive={isStreaming && index === parts.length - 1}
              />
            );
          case 'text':
            return (
              <AgentMessage
                key={`text-${index}`}
                content={part.text}
                isStreaming={
                  !!isStreaming && index === lastTextIndex && lastTextIndex === parts.length - 1
                }
              />
            );
          case 'status':
            return (
              <div
                key={`status-${index}`}
                className="ml-[40px]"
                style={{
                  fontFamily:
                    'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-5)',
                }}
              >
                <span style={{ color: 'var(--ink-4)', marginRight: 8 }}>
                  STATUS
                </span>
                {part.text}
              </div>
            );
          case 'view':
            return (
              <InlineChartFrame
                key={`view-${index}`}
                view={part.view}
                data={part.data ?? null}
                isLoading={!!isStreaming && index === parts.length - 1}
              />
            );
          case 'suggestions':
            // Suggestions are rendered at the Turn level at the bottom —
            // skip them in the stream iteration.
            return null;
        }
        return null;
      })}
      {/* TODO(PR 5 follow-up): takeaways block. Deferred per plan — the
         data surface isn't wired yet and this PR already carries the
         model migration + trace rewrite. */}
    </div>
  );
}
