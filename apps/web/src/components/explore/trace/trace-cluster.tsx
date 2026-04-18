'use client';

import type { ReactNode } from 'react';

/**
 * Props for {@link TraceCluster}.
 */
interface TraceClusterProps {
  children: ReactNode;
}

/**
 * Shared wrapper that renders the dashed vertical timeline behind a run of
 * consecutive tool-call / agent-delegation rows. The rows inside
 * absolute-position their dots at `left: -2` so they sit on this rule.
 * A single tool call is not wrapped — only clusters of 2+ consecutive
 * trace rows, to match the editorial design.
 *
 * This is purely a visual grouping; the underlying `parts[]` array is
 * untouched. The AssistantStream walks parts and accumulates consecutive
 * trace rows into one TraceCluster, then closes the cluster when a
 * non-trace part breaks the run.
 */
export function TraceCluster({ children }: TraceClusterProps) {
  return (
    <div
      className="ml-[40px]"
      style={{
        position: 'relative',
        paddingLeft: 10,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      {/* Dashed vertical rule — the "timeline" each row's dot sits on. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 3,
          top: 10,
          bottom: 10,
          borderLeft: '1px dashed var(--line-4, var(--line-2))',
        }}
      />
      {children}
    </div>
  );
}
