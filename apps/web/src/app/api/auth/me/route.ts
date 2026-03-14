import { validateSession } from '@lightboard/db/auth';
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminDb, getSessionToken } from '@/lib/auth';

/** GET /api/auth/me — Return the currently authenticated user. */
export async function GET(req: NextRequest) {
  const token = getSessionToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  const result = await validateSession(db, token);
  if (!result) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      orgId: result.user.orgId,
    },
  });
}
