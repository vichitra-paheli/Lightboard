'use client';

import { AssistantStream } from './assistant-stream';
import { SuggestionChips } from './suggestion-chips';
import { UserMessage } from './user-message';
import { getFirstText, type ChatMessageData } from './chat-message';

/**
 * Props for {@link Turn}.
 */
interface TurnProps {
  userMessage: ChatMessageData;
  assistantMessage?: ChatMessageData;
  /** Suggestion chips rendered at the bottom of the turn. Mock in this PR. */
  suggestions?: string[];
  onSuggestionClick?: (text: string) => void;
}

/**
 * One conversational turn — a user prompt plus the assistant's response.
 *
 * Under the PR 5 parts[] model the turn layout is:
 *
 *   UserMessage → AssistantStream(parts) → SuggestionChips?
 *
 * AssistantStream walks `assistantMessage.parts` in order and emits one
 * block per part, clustering consecutive tool/agent-delegation rows. The
 * parts array itself carries the temporal ordering produced by the SSE
 * reducer, so interleaved text/tool/chart sequences render in exactly
 * the order the agent produced them.
 *
 * Suggestions are extracted from the assistant's parts[] (when a
 * `{ kind: 'suggestions' }` part exists) or from the legacy `suggestions`
 * prop, and render after the stream.
 */
export function Turn({
  userMessage,
  assistantMessage,
  suggestions = [],
  onSuggestionClick,
}: TurnProps) {
  // Prefer suggestions embedded in the assistant's parts[] (PR 7 will wire
  // these from the backend). Fall back to the explicit `suggestions` prop
  // so tests and hand-rolled callers still work.
  const partSuggestions =
    assistantMessage?.parts.flatMap((p) =>
      p.kind === 'suggestions' ? p.items : [],
    ) ?? [];
  const allSuggestions =
    partSuggestions.length > 0 ? partSuggestions : suggestions;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. User prompt */}
      <UserMessage content={getFirstText(userMessage)} />

      {assistantMessage && (
        <AssistantStream
          parts={assistantMessage.parts}
          isStreaming={assistantMessage.isStreaming}
        />
      )}

      {allSuggestions.length > 0 && onSuggestionClick && (
        <SuggestionChips items={allSuggestions} onClick={onSuggestionClick} />
      )}
    </div>
  );
}
