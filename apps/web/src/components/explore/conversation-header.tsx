'use client';

import { useTranslations } from 'next-intl';

/**
 * Maximum length for the display title derived from the first user message.
 * Keeps the header readable on narrow threads without eating multiple lines.
 */
const TITLE_MAX_LEN = 80;

/**
 * Formats today's date as `"17 Apr"` — matches the handoff's editorial
 * eyebrow style. Uses `Intl.DateTimeFormat` so future locales switch
 * automatically. The header isn't a real persisted timestamp yet; when the
 * conversation persistence ticket lands, the real `createdAt` should flow
 * in instead of `new Date()`.
 */
function formatHeaderDate(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(d);
}

/**
 * Truncate the first-user-message to at most {@link TITLE_MAX_LEN} chars,
 * preserving trailing punctuation when we do cut. The goal is a one-line
 * headline that still reads as a question.
 */
function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= TITLE_MAX_LEN) return clean;
  const sliced = clean.slice(0, TITLE_MAX_LEN).replace(/[.,;:\s]+$/, '');
  return `${sliced}…`;
}

/**
 * Props for {@link ConversationHeader}.
 */
interface ConversationHeaderProps {
  /** The first user message in the conversation, used to derive the title. */
  firstUserMessage: string;
  /** Display name of the active data source; rendered in the eyebrow. */
  sourceName?: string | null;
}

/**
 * Top-of-thread header with a mono eyebrow (date · source) and a display-sans
 * headline derived from the first user message. Matches the editorial
 * handoff's `ConversationHeader`.
 */
export function ConversationHeader({
  firstUserMessage,
  sourceName,
}: ConversationHeaderProps) {
  const t = useTranslations('explore');
  const date = formatHeaderDate(new Date());
  const eyebrow = sourceName
    ? t('conversationHeader', { date, source: sourceName })
    : date;
  const title = deriveTitle(firstUserMessage);

  return (
    <div
      className="pb-4"
      style={{ borderBottom: '1px solid var(--line-1)' }}
    >
      <div className="lb-eyebrow mb-1.5">{eyebrow}</div>
      <h1 className="lb-h-page m-0">{title}</h1>
    </div>
  );
}

// Exported for unit tests so we can assert truncation + formatting without
// standing up a full `render` / Intl mock harness.
export const __testing = { deriveTitle, formatHeaderDate };
