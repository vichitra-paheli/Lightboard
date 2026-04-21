'use client';

import { AssistantStream } from './assistant-stream';
import { SuggestionChips } from './suggestion-chips';
import { UserMessage } from './user-message';
import { getFirstText, type ChatMessageData } from './chat-message';
import { KeyTakeaways } from './trace/key-takeaways';

/**
 * Props for {@link Turn}.
 */
interface TurnProps {
  userMessage: ChatMessageData;
  assistantMessage?: ChatMessageData;
  /** Suggestion chips rendered at the bottom of the turn. Mock in this PR. */
  suggestions?: string[];
  onSuggestionClick?: (text: string) => void;
  /**
   * Label of the suggestion chip currently waiting on a send to land. When
   * set and matching a chip on this turn, that chip renders a loader and
   * disables its siblings.
   */
  activeSuggestion?: string | null;
  /**
   * When `true`, suppress this turn's `<UserMessage>` row because the page
   * header (`<ConversationHeader>`) already prints the same prompt with the
   * user's avatar on the left. Only meaningful for the turn that matches
   * the header's first-user-message source.
   */
  isFirstTurn?: boolean;
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
  activeSuggestion,
  isFirstTurn = false,
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
    <div
      className="flex flex-col gap-5"
      // Used by the filmstrip slide-out to scroll a picked card's turn into
      // view. Tagged with the assistant message id because the filmstrip
      // entries are keyed off the assistant message that produced the view.
      data-message-id={assistantMessage?.id ?? userMessage.id}
      data-turn-root
    >
      {/* 1. User prompt. Suppressed on the first turn because the page
          header (`<ConversationHeader>`) already prints the same text with
          the user's avatar next to it — rendering it again here would
          double-print the prompt. */}
      {!isFirstTurn && <UserMessage content={getFirstText(userMessage)} />}

      {assistantMessage && (
        <AssistantStream
          parts={assistantMessage.parts}
          isStreaming={assistantMessage.isStreaming}
        />
      )}

      {/* Terminal narration — rendered below the assistant's stream once
          the leader calls `narrate_summary`. Distinct from parts[] so it
          always appears at the bottom of the turn, not interleaved. */}
      {assistantMessage?.narration && (
        <KeyTakeaways
          bullets={assistantMessage.narration.bullets}
          caveat={assistantMessage.narration.caveat}
        />
      )}

      {allSuggestions.length > 0 && onSuggestionClick && (
        <SuggestionChips
          items={allSuggestions}
          onSelect={onSuggestionClick}
          activeLabel={activeSuggestion}
        />
      )}
    </div>
  );
}
