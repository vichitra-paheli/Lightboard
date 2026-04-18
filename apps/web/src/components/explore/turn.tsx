'use client';

import { AgentMessage } from './agent-message';
import { AgentTracePlaceholder } from './agent-trace-placeholder';
import { InlineChartFrame } from './inline-chart-frame';
import { SuggestionChips } from './suggestion-chips';
import { UserMessage } from './user-message';
import type { ChatMessageData } from './chat-message';

/**
 * Props for {@link Turn}.
 */
interface TurnProps {
  userMessage: ChatMessageData;
  assistantMessage?: ChatMessageData;
  /** Suggestion chips rendered at the bottom of the turn. Empty in this PR. */
  suggestions?: string[];
  onSuggestionClick?: (text: string) => void;
}

/**
 * One conversational turn — a user prompt plus the assistant's response,
 * rendered in the new editorial order:
 *
 *   UserMessage → AgentTracePlaceholder → InlineChartFrame? → AgentMessage → SuggestionChips?
 *
 * The trace sits **above** the agent's text. This is the interim ordering
 * fix shipped in PR 4. Even though the legacy `ChatMessageData` model
 * still stores `content` + `toolCalls` as parallel arrays (which loses the
 * temporal interleaving inside a single message), moving the trace card
 * above the text at the turn level gets the top-level ordering right. The
 * remaining interleaving bug — text that belongs *between* two tool calls
 * — is only fully fixed by PR 5's `parts[]` migration.
 */
export function Turn({
  userMessage,
  assistantMessage,
  suggestions = [],
  onSuggestionClick,
}: TurnProps) {
  const view = assistantMessage?.view;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. User prompt */}
      <UserMessage content={userMessage.content} />

      {assistantMessage && (
        <>
          {/* 2. Trace card (tools, delegations, thinking) — now above the text */}
          <AgentTracePlaceholder
            thinking={assistantMessage.thinking}
            toolCalls={assistantMessage.toolCalls}
            agentDelegations={assistantMessage.agentDelegations}
            isStreaming={assistantMessage.isStreaming}
          />

          {/* 3. Chart, if this turn produced one */}
          {view && (
            <InlineChartFrame
              view={view}
              data={assistantMessage.viewData ?? null}
              isLoading={assistantMessage.isStreaming}
            />
          )}

          {/* 4. Agent text (markdown, with blinking cursor while streaming) */}
          {(assistantMessage.content || assistantMessage.isStreaming) && (
            <AgentMessage
              content={assistantMessage.content}
              isStreaming={assistantMessage.isStreaming}
            />
          )}

          {/* 5. Follow-up suggestion chips — PR 7 populates real items */}
          {suggestions.length > 0 && onSuggestionClick && (
            <SuggestionChips items={suggestions} onClick={onSuggestionClick} />
          )}
        </>
      )}
    </div>
  );
}
