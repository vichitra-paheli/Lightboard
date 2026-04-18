'use client';

import { useEffect, useState } from 'react';

/**
 * Shape returned by `GET /api/auth/me`. Kept local to the component — the
 * server route returns a slightly broader user shape, but only these fields
 * are rendered in the top bar.
 */
interface MeResponse {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

/**
 * Pick the initial to display in the gradient dot. Prefers the first
 * character of the user's name; falls back to the email local-part so
 * name-less accounts still render a meaningful letter. Returns `"U"` as a
 * last resort so the avatar is never empty.
 */
function deriveInitial(name?: string | null, email?: string | null): string {
  const source = (name ?? '').trim() || (email ?? '').trim();
  if (!source) return 'U';
  return source[0]!.toUpperCase();
}

/**
 * Pick the label displayed next to the gradient dot — username if we have
 * one, otherwise the email local-part, otherwise a generic `"User"` so the
 * chip still parses at a glance.
 */
function deriveLabel(name?: string | null, email?: string | null): string {
  const trimmedName = (name ?? '').trim();
  if (trimmedName) return trimmedName;
  const trimmedEmail = (email ?? '').trim();
  if (trimmedEmail) return trimmedEmail.split('@')[0] ?? trimmedEmail;
  return 'User';
}

/**
 * Right-column avatar chip in the top bar. Renders a gradient dot with the
 * user's initial plus the username in small mono-free body text.
 *
 * Data source: `GET /api/auth/me` is fetched once on mount via plain
 * `fetch` — the app doesn't wire `@tanstack/react-query` yet. TODO (PR 8):
 * migrate to react-query so the avatar shares a cached user object with
 * future settings/profile surfaces.
 */
export function UserAvatar() {
  const [label, setLabel] = useState('User');
  const [initial, setInitial] = useState('U');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        const name = data.user?.name ?? null;
        const email = data.user?.email ?? null;
        setLabel(deriveLabel(name, email));
        setInitial(deriveInitial(name, email));
      } catch {
        // Swallow errors — the placeholder "User"/"U" stays on screen, which
        // is the correct UX for an unauthenticated or offline state.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="inline-flex items-center gap-[10px] rounded-full border border-[var(--line-1)] py-1 pl-1 pr-[10px]">
      <div
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{
          background: 'linear-gradient(135deg, var(--accent-warm), #B08CA8)',
          fontFamily: 'var(--font-mono), ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--bg-0)',
        }}
      >
        {initial}
      </div>
      <span className="text-[12px] text-[var(--ink-2)]">{label}</span>
    </div>
  );
}

// Re-exported for unit tests so we can assert the initial/label derivation
// without spinning up a full `render` + mocked fetch.
export const __testing = { deriveInitial, deriveLabel };
