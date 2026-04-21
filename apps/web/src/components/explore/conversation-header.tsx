'use client';

import { useTranslations } from 'next-intl';

import { useCurrentUser } from '@/lib/use-current-user';

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
 * Normalize the first-user-message into a single-spaced string. The full
 * message is rendered — no truncation — so the user sees exactly what they
 * asked. When backend conversation-title generation lands (see
 * documentation/backend-ui-polish-followups.md §4), this function will be
 * replaced by the persisted title lookup.
 */
function deriveTitle(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Pick the initial for the avatar — falls back through name → email → "U".
 * Mirrors the helper used by `<UserMessage>` so the two surfaces display
 * the same glyph.
 */
function deriveInitial(name?: string | null, email?: string | null): string {
  const source = (name ?? '').trim() || (email ?? '').trim();
  if (!source) return 'U';
  return source[0]!.toUpperCase();
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
 * headline derived from the first user message. The user's warm-cool-gradient
 * avatar sits on the left so the header reads as a single "speaker badge +
 * message" unit — this replaces the separate `<UserMessage>` row that used to
 * render the same text right underneath the H1.
 */
export function ConversationHeader({
  firstUserMessage,
  sourceName,
}: ConversationHeaderProps) {
  const t = useTranslations('explore');
  const { data } = useCurrentUser();
  const date = formatHeaderDate(new Date());
  const eyebrow = sourceName
    ? t('conversationHeader', { date, source: sourceName })
    : date;
  const title = deriveTitle(firstUserMessage);
  const initial = deriveInitial(data?.name ?? null, data?.email ?? null);

  return (
    <div
      className="flex items-start gap-3.5 pb-4"
      style={{ borderBottom: '1px solid var(--line-1)' }}
    >
      <div
        aria-hidden="true"
        className="mt-1 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full"
        style={{
          background: 'linear-gradient(135deg, var(--accent-warm), #B08CA8)',
          fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--bg-0)',
        }}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="lb-eyebrow mb-1.5">{eyebrow}</div>
        <h1 className="lb-h-page m-0">{title}</h1>
      </div>
    </div>
  );
}

// Exported for unit tests so we can assert truncation + formatting without
// standing up a full `render` / Intl mock harness.
export const __testing = { deriveTitle, formatHeaderDate };
