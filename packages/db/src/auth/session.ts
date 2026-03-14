import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import { sessions } from '../schema/sessions';
import { users } from '../schema/users';

const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

/** Session with associated user data. */
export interface SessionValidationResult {
  session: {
    id: string;
    userId: string;
    orgId: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    orgId: string;
    email: string;
    name: string;
    role: 'admin' | 'editor' | 'viewer';
  };
}

/** Generates a cryptographically random session token. */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

/**
 * Creates a new session for a user. Returns the raw token (for the cookie)
 * and stores the SHA-256 hash as the session ID in the database.
 */
export async function createSession(
  db: Database,
  userId: string,
  orgId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    orgId,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Validates a session token. Returns session + user if valid, null if expired or not found.
 * Extends session expiry using a sliding window if more than 15 days remain.
 */
export async function validateSession(
  db: Database,
  token: string,
): Promise<SessionValidationResult | null> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

  const result = await db
    .select({
      session: sessions,
      user: {
        id: users.id,
        orgId: users.orgId,
        email: users.email,
        name: users.name,
        role: users.role,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  const { session, user } = row;

  if (Date.now() >= session.expiresAt.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Sliding window: extend if less than 15 days remain
  if (session.expiresAt.getTime() - Date.now() < SESSION_REFRESH_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_EXPIRY_MS);
    await db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, sessionId));
    session.expiresAt = newExpiry;
  }

  return { session, user };
}

/** Invalidates a session by deleting it from the database. */
export async function invalidateSession(db: Database, token: string): Promise<void> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Invalidates all sessions for a user. */
export async function invalidateAllUserSessions(db: Database, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
