import { type Database, setOrgContext } from '@lightboard/db';
import { validateSession, type SessionValidationResult } from '@lightboard/db/auth';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@lightboard/db/schema';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import pg from 'pg';

const SESSION_COOKIE = 'lb_session';

/** Admin DB pool — bypasses RLS. Used for login, registration, migrations. */
const adminPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/** App DB pool — RLS enforced. Used for all authenticated requests. */
const appPool = new pg.Pool({
  connectionString: process.env.DATABASE_APP_URL ?? process.env.DATABASE_URL,
});

/** Returns the admin database instance (no RLS). */
export function getAdminDb(): Database {
  return drizzle(adminPool, { schema });
}

/** Reads the session token from the request cookies. */
export function getSessionToken(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE)?.value;
}

/** Sets the session cookie on a response. */
export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/** Clears the session cookie on a response. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** Handler function signature for authenticated API routes. */
export type AuthenticatedHandler = (
  req: NextRequest,
  ctx: {
    user: SessionValidationResult['user'];
    orgId: string;
    db: Database;
  },
) => Promise<NextResponse | Response>;

/**
 * Wraps an API route handler with auth validation and RLS context.
 * Validates the session, acquires a pool client with org context set,
 * and passes the org-scoped database to the handler.
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (req: NextRequest): Promise<NextResponse | Response> => {
    const token = getSessionToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const result = await validateSession(adminDb, token);
    if (!result) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await appPool.connect();
    try {
      await setOrgContext(client, result.session.orgId);
      const orgDb = drizzle(client, { schema }) as Database;
      return await handler(req, {
        user: result.user,
        orgId: result.session.orgId,
        db: orgDb,
      });
    } finally {
      client.release();
    }
  };
}

/**
 * Validates the current request's session from cookies (server component use).
 * Returns session result or null if not authenticated.
 */
export async function validateRequest(): Promise<SessionValidationResult | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const adminDb = getAdminDb();
  return validateSession(adminDb, token);
}
