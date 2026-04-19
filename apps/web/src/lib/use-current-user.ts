'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './query-keys';

/**
 * Shape returned by `GET /api/auth/me`. Kept local to this hook — the server
 * route returns a broader user object, but only these fields are consumed by
 * the avatar surfaces.
 */
export interface CurrentUser {
  name?: string | null;
  email?: string | null;
}

/** 5 minutes — auth/me changes only on login/logout, which forces a full reload. */
const STALE_TIME = 5 * 60 * 1000;

/** Fetch the currently-authenticated user from `/api/auth/me`. */
async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await fetch('/api/auth/me', { cache: 'no-store' });
  if (!res.ok) {
    // Treat any non-OK response as "unauthenticated" — the dashboard
    // middleware redirects unauthed requests, so seeing this in practice
    // means a race with logout. Returning empty lets the avatar show its
    // placeholder rather than surfacing a phantom error.
    return {};
  }
  const data = (await res.json()) as { user?: CurrentUser };
  return data.user ?? {};
}

/**
 * Shared hook — every surface that wants the logged-in user's name or email
 * reads through this so the fetch happens once per session. UserAvatar (top
 * bar) and UserMessage (conversation avatar) both call it; they get the same
 * cached payload without re-fetching.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.authMe(),
    queryFn: fetchCurrentUser,
    staleTime: STALE_TIME,
  });
}
