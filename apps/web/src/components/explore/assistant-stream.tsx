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
 * parts as a single visual cluster rendered by {@link TraceCluster}.
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
 * {@link TraceCluster} — a collapsible editorial-log panel with a status
 * dot + "Completed" / "Thinking" label + `N/N tool calls` count + chevron.
 * Even a single tool row uses the panel so the visual language stays
 * consistent across short and long traces.
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
          // Every cluster — even a one-row cluster — wraps in TraceCluster
          // so the editorial-log panel chrome (status dot, "Completed" /
          // "Thinking" label, N/N count, chevron) is always present. The
          // previous "one-row-renders-flat" carve-out produced a jarring
          // inconsistency for short traces.
          //
          // Status + counts are derived from the rows themselves:
          //   - A row is "running" iff it carries status: 'running'.
          //   - totalCount counts every tool_call / agent_delegation row.
          //   - doneCount is the complement of running.
          //   - currentLabel is the first running row's label (or name).
          let running = 0;
          let done = 0;
          let currentLabel: string | undefined;
          for (const p of g.parts) {
            const isRunning =
              (p.kind === 'tool_call' || p.kind === 'agent_delegation') &&
              p.status === 'running';
            if (isRunning) {
              running += 1;
              if (!currentLabel) {
                currentLabel =
                  p.kind === 'tool_call'
                    ? (p.label ?? p.name)
                    : (p.task ?? p.agent);
              }
            } else {
              done += 1;
            }
          }
          const clusterStatus: 'running' | 'done' =
            running > 0 ? 'running' : 'done';
          return (
            <TraceCluster
              key={`cluster-${g.startIndex}`}
              status={clusterStatus}
              totalCount={g.parts.length}
              doneCount={done}
              {...(currentLabel ? { currentLabel } : {})}
            >
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
          case 'text': {
            const textIsStreaming =
              !!isStreaming &&
              index === lastTextIndex &&
              lastTextIndex === parts.length - 1;
            // An empty, non-streaming text part is a ghost row — it renders
            // as a 26px agent avatar next to an empty content area and
            // sits awkwardly above the following trace cluster. These
            // arise from leading/trailing whitespace deltas the model
            // occasionally emits around tool calls. Skip them so the
            // cluster panel reads as the first visible block after the
            // preceding real text.
            if (part.text.trim().length === 0 && !textIsStreaming) {
              return null;
            }
            return (
              <AgentMessage
                key={`text-${index}`}
                content={part.text}
                isStreaming={textIsStreaming}
              />
            );
          }
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
