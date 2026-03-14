import { createSession, hashPassword } from '@lightboard/db/auth';
import { organizations, users } from '@lightboard/db/schema';
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminDb, setSessionCookie } from '@/lib/auth';

/** POST /api/auth/register — Create a new organization and admin user. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password, name, orgName } = body as {
    email?: string;
    password?: string;
    name?: string;
    orgName?: string;
  };

  if (!email || !password || !name || !orgName) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const db = getAdminDb();

  // Check if email already exists
  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  try {
    // Create organization
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const orgs = await db.insert(organizations).values({ name: orgName, slug }).returning();
    const org = orgs[0]!;

    // Create admin user
    const passwordHash = await hashPassword(password);
    const usersResult = await db
      .insert(users)
      .values({ orgId: org.id, email, name, passwordHash, role: 'admin' as const })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
    const user = usersResult[0]!;

    // Create session
    const { token, expiresAt } = await createSession(db, user.id, org.id);

    const response = NextResponse.json(
      { user: { id: user.id, email: user.email, name: user.name, role: user.role, orgId: org.id } },
      { status: 201 },
    );
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
