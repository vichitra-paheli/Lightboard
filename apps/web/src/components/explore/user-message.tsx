'use client';

import { useEffect, useState } from 'react';

/**
 * Shape returned by `GET /api/auth/me`. Only the fields needed to derive
 * the avatar initial are consumed.
 */
interface MeResponse {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

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
 * gradient avatar on the left carries the user's initial (loaded from
 * `GET /api/auth/me`); the message body uses the `.lb-user-msg` editorial
 * type style — 15px ink-1, line-height 1.55.
 *
 * The avatar fetches once per mount and caches its initial in local state.
 * If the network call fails we fall back to `"U"` — the UX never blocks on
 * the avatar finishing.
 */
export function UserMessage({ content }: UserMessageProps) {
  const [initial, setInitial] = useState('U');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        setInitial(deriveInitial(data.user?.name ?? null, data.user?.email ?? null));
      } catch {
        // Leave the placeholder in place on network failure.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
