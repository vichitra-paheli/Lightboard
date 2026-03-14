import { createSession, verifyPassword } from '@lightboard/db/auth';
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminDb, setSessionCookie } from '@/lib/auth';

/** POST /api/auth/login — Authenticate with email and password. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const db = getAdminDb();

  // Look up user (admin pool, no RLS — login must work across orgs)
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });

  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const validPassword = await verifyPassword(user.passwordHash, password);
  if (!validPassword) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  // Create session with org_id denormalized
  const { token, expiresAt } = await createSession(db, user.id, user.orgId);

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
    },
  });
  setSessionCookie(response, token, expiresAt);
  return response;
}
