'use client';

import { useCurrentUser } from '@/lib/use-current-user';

/**
 * Pick the initial for the avatar — falls back through name → email → "U".
 */
function deriveInitial(name?: string | null, email?: string | null): string {
  const source = (name ?? '').trim() || (email ?? '').trim();
  if (!source) return 'U';
  return source[0]!.toUpperCase();
}

/**
 * Props for {@link UserMessage}.
 */
interface UserMessageProps {
  content: string;
}

/**
 * User message row rendered inside a conversational turn. A 26×26 warm-cool
 * gradient avatar on the left carries the user's initial (read from the
 * shared {@link useCurrentUser} react-query cache); the message body uses
 * the `.lb-user-msg` editorial type style — 15px ink-1, line-height 1.55.
 *
 * The avatar initial is derived from the same cached payload {@link
 * UserAvatar} consumes — the underlying fetch fires once per session and
 * both surfaces update in lock-step when it resolves. If the network call
 * fails we fall back to `"U"` — the UX never blocks on the avatar
 * finishing.
 */
export function UserMessage({ content }: UserMessageProps) {
  const { data } = useCurrentUser();
  const initial = deriveInitial(data?.name ?? null, data?.email ?? null);

  return (
    <div className="flex items-start gap-3.5">
      <div
        aria-hidden="true"
        className="mt-px flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full"
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
      <div
        className="lb-user-msg whitespace-pre-wrap pt-0.5"
        // The lb-user-msg class carries family/size/color/line-height.
      >
        {content}
      </div>
    </div>
  );
}
