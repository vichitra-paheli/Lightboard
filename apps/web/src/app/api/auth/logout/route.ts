import { invalidateSession } from '@lightboard/db/auth';
import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookie, getAdminDb, getSessionToken } from '@/lib/auth';

/** POST /api/auth/logout — Invalidate the current session. */
export async function POST(req: NextRequest) {
  const token = getSessionToken(req);

  if (token) {
    const db = getAdminDb();
    await invalidateSession(db, token);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
