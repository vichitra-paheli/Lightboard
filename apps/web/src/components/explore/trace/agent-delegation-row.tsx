'use client';

import type { MessagePart } from '../chat-message';

/**
 * Props for {@link AgentDelegationRow}.
 */
interface AgentDelegationRowProps {
  part: Extract<MessagePart, { kind: 'agent_delegation' }>;
}

/**
 * Editorial-log row for one sub-agent delegation. Shares the same three-
 * column grid as {@link ToolCallRow} so dots and labels line up when a
 * delegation sits next to tool rows in a cluster.
 *
 * Kind color is always `--kind-narrate` — a delegation is a narrative
 * handoff, not a concrete I/O step. Running → pulsing dot; done → flat
 * color; aborted → ink-5 + strikethrough on the agent name. When the
 * delegation has a summary, it renders on a second row in dimmed ink-3.
 */
export function AgentDelegationRow({ part }: AgentDelegationRowProps) {
  const isRunning = part.status === 'running';
  const isAborted = part.status === 'aborted';
  const dotColor = isAborted ? 'var(--ink-5)' : 'var(--kind-narrate)';

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr auto',
          alignItems: 'baseline',
          gap: 14,
          padding: '6px 0 6px 14px',
          position: 'relative',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: -2,
            top: 12,
            width: 8,
            height: 8,
            borderRadius: 99,
            background: 'var(--bg-0)',
            border: `1.5px solid ${dotColor}`,
            ...(isRunning
              ? { animation: 'pulse 1.4s ease-in-out infinite' }
              : {}),
          }}
        />
        <div
          style={{
            fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
            fontSize: 9.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: dotColor,
          }}
        >
          delegate
        </div>
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
            {part.agent}
          </span>
          {part.task && (
            <>
              <span style={{ color: 'var(--ink-5)' }}>(</span>
              <span>{part.task}</span>
              <span style={{ color: 'var(--ink-5)' }}>)</span>
            </>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
            fontSize: 10,
            color: 'var(--ink-5)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isRunning ? 'running' : isAborted ? 'aborted' : 'done'}
        </div>
      </div>
      {part.summary && !isRunning && (
        <div
          style={{
            padding: '2px 0 4px 84px',
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--ink-3)',
          }}
        >
          {part.summary}
        </div>
      )}
    </div>
  );
}
