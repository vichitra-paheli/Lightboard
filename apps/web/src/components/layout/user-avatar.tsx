'use client';

import { useCurrentUser } from '@/lib/use-current-user';

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
 * Data source: `GET /api/auth/me` via the shared {@link useCurrentUser}
 * react-query hook. The query is keyed on `['auth', 'me']` and cached for
 * 5 minutes, so the avatar and other surfaces (UserMessage) share one
 * fetch per session.
 */
export function UserAvatar() {
  const { data } = useCurrentUser();
  const name = data?.name ?? null;
  const email = data?.email ?? null;
  const label = deriveLabel(name, email);
  const initial = deriveInitial(name, email);

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
