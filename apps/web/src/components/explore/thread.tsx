'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { getFirstText, type ChatMessageData } from './chat-message';
import { ConversationHeader } from './conversation-header';
import { SchemaCurationPanel } from './schema-curation-panel';
import { Turn } from './turn';
import type { DataSourceOption } from './types';

/**
 * Groups a flat `messages[]` list into per-turn pairs. A turn begins at a
 * user message and absorbs every subsequent assistant message until the
 * next user message. The first assistant in each run becomes the turn's
 * canonical assistant response; any stray assistant-before-user messages
 * (rare, but possible during streaming) become their own user-less turns
 * that render nothing — this is an intentional defensive fallback.
 *
 * Exported for unit tests so the grouping logic can be exercised without
 * rendering the full Thread tree.
 */
export function groupTurns(messages: ChatMessageData[]): Array<{
  user: ChatMessageData;
  assistant?: ChatMessageData;
}> {
  const turns: Array<{ user: ChatMessageData; assistant?: ChatMessageData }> = [];
  let pendingUser: ChatMessageData | null = null;

  for (const m of messages) {
    if (m.role === 'user') {
      if (pendingUser) {
        // Two user messages in a row — first one had no assistant response.
        turns.push({ user: pendingUser });
      }
      pendingUser = m;
    } else if (pendingUser) {
      turns.push({ user: pendingUser, assistant: m });
      pendingUser = null;
    }
    // else: an assistant message arrived before any user — ignore. This can
    // happen if a system-level status message is streamed up front; there's
    // no meaningful turn to render it against.
  }
  if (pendingUser) {
    turns.push({ user: pendingUser });
  }
  return turns;
}

/**
 * Schema curation state managed by the page client. Mirrors the existing
 * `ExplorePageClient` shape — we re-declare the type here to avoid a
 * circular import with the page client.
 */
interface SchemaCurationState {
  phase: 'callout' | 'generating' | 'editing' | 'saving';
  markdown: string;
}

/**
 * Props for {@link Thread}.
 */
interface ThreadProps {
  messages: ChatMessageData[];
  selectedSource: string | null;
  dataSources: DataSourceOption[];
  /** Optional schema curation state — when set, renders inline in the thread. */
  schemaCuration?: SchemaCurationState | null;
  onGenerateSchema?: () => void;
  onSaveSchema?: (markdown: string) => void;
  onCancelSchema?: () => void;
  onSchemaMarkdownChange?: (markdown: string) => void;
  /**
   * Invoked when the user clicks a follow-up suggestion chip on any turn.
   * Receives the chip's label text, which the page client sends through
   * as the next user prompt. Optional so the Thread still renders in
   * contexts (tests, future preview surfaces) that don't need chip
   * click-through behavior.
   */
  onSuggestionClick?: (text: string) => void;
  /**
   * Label text of the suggestion chip that's currently waiting on a send
   * to connect. Threaded through to the matching turn so the chip shows a
   * loader during the open-connection gap.
   */
  activeSuggestion?: string | null;
}

/**
 * Centered conversational thread — the main content of the Explore page.
 *
 * Layout:
 * - `max-width: 920px`, centered with the editorial 48px side padding.
 * - Scroll snap in y proximity so inline chart cards snap to center.
 * - {@link ConversationHeader} on top once the user has sent a prompt.
 * - Schema curation, when active, renders as an inline block between the
 *   header and the turn list (rather than commandeering a right panel).
 * - Each user+assistant pair renders as a {@link Turn}.
 * - Empty state: a centered "Ask a question…" placeholder.
 *
 * Auto-scrolls to the bottom on every message update so streaming chunks
 * stay in view. PR 6 ships the filmstrip as a fixed-position right
 * slide-out — it's rendered outside the thread by `ExplorePageClient`, so
 * nothing lives in the thread's top chrome here.
 */
export function Thread({
  messages,
  selectedSource,
  dataSources,
  schemaCuration,
  onGenerateSchema,
  onSaveSchema,
  onCancelSchema,
  onSchemaMarkdownChange,
  onSuggestionClick,
  activeSuggestion,
}: ThreadProps) {
  const t = useTranslations('explore');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const turns = groupTurns(messages);
  const firstUser = turns[0]?.user ? getFirstText(turns[0]!.user) : '';
  const source = dataSources.find((s) => s.id === selectedSource) ?? null;
  const hasMessages = messages.length > 0;
  const hasSchemaCuration = !!schemaCuration;

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-y-auto"
      data-thread-root
      style={{ scrollSnapType: 'y proximity' }}
    >
      <div
        className="relative mx-auto"
        // `viewTransitionName` opts the centered content column into the
        // scoped `thread-content` view transition declared in globals.css.
        // The outer scroll container above is intentionally excluded so the
        // scrollbar position doesn't flicker mid-fade. Keeping the value
        // alongside the other layout-only inline styles is acceptable per
        // CLAUDE.md: Tailwind has no utility for `view-transition-name`.
        style={{
          maxWidth: 920,
          padding: '28px 48px 40px',
          viewTransitionName: 'thread-content',
        }}
      >
        {hasMessages && (
          <ConversationHeader
            firstUserMessage={firstUser}
            sourceName={source?.name ?? null}
          />
        )}

        {hasSchemaCuration && selectedSource && onGenerateSchema && onSaveSchema && onCancelSchema && onSchemaMarkdownChange && (
          <div
            className="mt-5 overflow-hidden rounded-xl"
            style={{
              background: 'var(--bg-4)',
              border: '1px solid var(--line-3)',
              minHeight: 320,
            }}
          >
            <SchemaCurationPanel
              sourceId={selectedSource}
              sourceName={source?.name ?? ''}
              phase={schemaCuration!.phase}
              markdown={schemaCuration!.markdown}
              onGenerate={onGenerateSchema}
              onSave={onSaveSchema}
              onCancel={onCancelSchema}
              onMarkdownChange={onSchemaMarkdownChange}
            />
          </div>
        )}

        {hasMessages ? (
          <div className="mt-5 flex flex-col gap-10">
            {turns.map((turn, i) => (
              <Turn
                key={turn.user.id ?? `turn-${i}`}
                userMessage={turn.user}
                assistantMessage={turn.assistant}
                // Suggestions come from `assistantMessage.parts` (the
                // `{ kind: 'suggestions' }` part the page client backfills
                // once the turn has produced at least one view). The
                // explicit prop here stays empty — Turn prefers the parts
                // path whenever it finds one.
                suggestions={[]}
                onSuggestionClick={onSuggestionClick}
                activeSuggestion={activeSuggestion}
                // The first turn's user message is rendered by the page
                // header — suppress Turn's own `<UserMessage>` so the
                // prompt isn't printed twice.
                isFirstTurn={i === 0}
              />
            ))}
          </div>
        ) : !hasSchemaCuration ? (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: 360 }}
          >
            <div className="text-center">
              <p
                className="lb-h-chart"
                style={{ fontSize: 20, marginBottom: 6 }}
              >
                {t('emptyTitle')}
              </p>
              <p className="lb-body" style={{ color: 'var(--ink-3)' }}>
                {t('emptySubtitle')}
              </p>
            </div>
          </div>
        ) : null}

        <div className="h-10" />
      </div>
    </div>
  );
}
