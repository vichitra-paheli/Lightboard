'use client';

/*
 * =============================================================================
 * TEMPORARY — replaced by <AgentTrace> in PR 5.
 * =============================================================================
 *
 * This component is a lift-and-shift boxing of the existing trace widgets
 * (ThinkingState, AgentIndicator, ToolCallDetails) into a single card the
 * Thread can position **above** the agent's text message in each turn. It
 * continues to read the legacy `ChatMessageData` fields (`thinking`,
 * `toolCalls`, `agentDelegations`) — no message-model migration happens in
 * this PR.
 *
 * PR 5 replaces this with the editorial-log AgentTrace variant built on top
 * of the new `parts[]` message model. Do not extend this file; ship new
 * trace chrome against the PR 5 component instead.
 * =============================================================================
 */

import { AgentIndicator, type AgentIndicatorData } from '@/components/chat/agent-indicator';
import { ThinkingState } from '@/components/chat/thinking-state';
import {
  ToolCallDetails,
  type ToolCallData,
} from '@/components/chat/tool-call-details';

/**
 * Props for {@link AgentTracePlaceholder}.
 */
interface AgentTracePlaceholderProps {
  thinking?: string;
  toolCalls?: ToolCallData[];
  agentDelegations?: AgentIndicatorData[];
  isStreaming?: boolean;
}

/**
 * Temporary wrapper that stacks the existing trace widgets inside a single
 * card so the Thread can render the full trace above the agent's text
 * message in each turn. Renders nothing if none of the trace slots have
 * content.
 */
export function AgentTracePlaceholder({
  thinking,
  toolCalls,
  agentDelegations,
  isStreaming,
}: AgentTracePlaceholderProps) {
  const hasThinking = !!thinking;
  const hasTools = !!toolCalls && toolCalls.length > 0;
  const hasDelegations = !!agentDelegations && agentDelegations.length > 0;

  if (!hasThinking && !hasTools && !hasDelegations) return null;

  return (
    <div
      className="ml-[40px] rounded-xl p-3"
      // 40px left indent aligns the card under the agent/user text column,
      // so the trace visually sits inside the same reading rail as the
      // surrounding messages instead of forming its own gutter.
      style={{
        background: 'var(--bg-3)',
        border: '1px solid var(--line-2)',
      }}
    >
      {hasThinking && (
        <ThinkingState thinking={thinking!} isActive={isStreaming} />
      )}

      {hasDelegations && (
        <div className="space-y-1">
          {agentDelegations!.map((delegation, i) => (
            <AgentIndicator
              key={`${delegation.agent}-${i}`}
              delegation={delegation}
            />
          ))}
        </div>
      )}

      {hasTools && (
        <div className={hasDelegations ? 'mt-1 space-y-1' : 'space-y-1'}>
          {toolCalls!.map((tc, i) => (
            <ToolCallDetails key={`${tc.name}-${i}`} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}
