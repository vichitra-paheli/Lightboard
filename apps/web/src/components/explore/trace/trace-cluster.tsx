'use client';

import { useState, type ReactNode } from 'react';

/**
 * Props for {@link TraceCluster}.
 */
interface TraceClusterProps {
  /** Tool-call / agent-delegation rows. */
  children: ReactNode;
  /**
   * Whether any row inside the cluster is still running. Drives the status
   * chrome — green dot + "Completed" when `'done'`, amber pulsing dot +
   * "Thinking" when `'running'`.
   */
  status: 'running' | 'done';
  /** Total number of tool-call rows in the cluster. */
  totalCount: number;
  /** Count of rows that have terminated (done / error / aborted). */
  doneCount: number;
  /**
   * Label of the first running tool — shown inline with the header chrome
   * while the cluster is still streaming, so the user sees which step the
   * agent is currently on.
   */
  currentLabel?: string;
}

/**
 * Collapsible editorial-log panel that wraps a run of tool-call /
 * agent-delegation rows. Replaces the old dashed-timeline-behind-rows
 * treatment with a full panel:
 *
 * - Dashed top border frames the cluster off from adjacent text.
 * - Header bar (clickable to toggle): status dot (green when done,
 *   amber pulsing while running), status label ("Completed" / "Thinking"),
 *   `"N/N tool calls"` count, chevron.
 * - Body: padded rows; no inter-row dividers — the panel wrapper already
 *   frames the group.
 *
 * Collapsed state is local React state — no persistence. The cluster
 * starts expanded and stays expanded until the user clicks the chevron.
 * Running clusters also start expanded so the user can watch rows land.
 */
export function TraceCluster({
  children,
  status,
  totalCount,
  doneCount,
  currentLabel,
}: TraceClusterProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isRunning = status === 'running';
  const dotColor = isRunning ? 'var(--accent-warm)' : 'var(--kind-narrate)';
  const statusLabel = isRunning ? 'Thinking' : 'Completed';

  return (
    <div
      className="ml-[40px] overflow-hidden"
      data-testid="trace-cluster"
      style={{
        // Soft bordered card — matches reference image 15: a quiet
        // slightly-lifted surface, not a loud tile. `--bg-4` sits one step
        // above `--bg-0` so the panel reads as its own object without
        // shouting; `--line-3` is soft enough to stay subordinate to the
        // chat around it while still giving the shape a clear edge.
        border: '1px solid var(--line-3)',
        borderRadius: 10,
        background: 'var(--bg-4)',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand tool calls' : 'Collapse tool calls'}
        className="flex w-full items-center gap-3 border-0 bg-transparent text-left"
        style={{
          cursor: 'pointer',
          // Header is the clickable area across the whole width. Padding
          // is on the header itself (not the card) so when collapsed the
          // whole border-radius clips the click target cleanly.
          padding: '10px 16px',
        }}
      >
        {/* Status dot — 8px solid dot; adds a pulsing ring while running. */}
        <span
          aria-hidden="true"
          data-running={isRunning ? 'true' : undefined}
          className={
            isRunning ? 'trace-cluster-dot-pulse flex-none' : 'flex-none'
          }
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: dotColor,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            fontWeight: 500,
          }}
        >
          {statusLabel}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
            fontSize: 10.5,
            color: 'var(--ink-5)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {doneCount}/{totalCount} tool {totalCount === 1 ? 'call' : 'calls'}
        </span>
        {isRunning && currentLabel ? (
          <span
            className="truncate"
            style={{
              fontFamily:
                'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
              fontSize: 11,
              color: 'var(--ink-3)',
              minWidth: 0,
            }}
          >
            · {currentLabel}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className="ml-auto flex-none"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            color: 'var(--ink-5)',
            transition: 'transform 120ms ease',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        >
          <svg
            width="10"
            height="6"
            viewBox="0 0 10 6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {!collapsed && (
        <div
          data-testid="trace-cluster-body"
          style={{
            // Subtle divider between header row and the body — reads as
            // one card with a clear header/body split rather than two
            // separate panels stacked.
            borderTop: '1px solid var(--line-2)',
            padding: '8px 16px 12px',
          }}
        >
          {children}
        </div>
      )}
      {/*
       * Scoped CSS for the pulsing dot. Kept in-file so the module is
       * self-contained — the animation is only used here and nowhere else
       * in the app.
       */}
      <style>{`
        .trace-cluster-dot-pulse {
          animation: trace-cluster-dot-pulse 1.4s ease-in-out infinite;
        }
        @keyframes trace-cluster-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
