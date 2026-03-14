import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { hashPassword } from './auth/password';
import { organizations } from './schema/organizations';
import { users } from './schema/users';
import * as schema from './schema';

/** Seeds the database with demo data for local development. */
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('Seeding database...');

  // Create demo organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Lightboard Demo',
      slug: 'demo',
    })
    .returning();

  if (!org) throw new Error('Failed to create organization');
  console.log(`Created org: ${org.name} (${org.id})`);

  // Create admin user
  const adminHash = await hashPassword('lightboard123');
  const [admin] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: 'admin@lightboard.dev',
      name: 'Admin User',
      passwordHash: adminHash,
      role: 'admin',
    })
    .returning();

  if (!admin) throw new Error('Failed to create admin user');
  console.log(`Created admin: ${admin.email}`);

  // Create viewer user
  const viewerHash = await hashPassword('lightboard123');
  const [viewer] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: 'viewer@lightboard.dev',
      name: 'Viewer User',
      passwordHash: viewerHash,
      role: 'viewer',
    })
    .returning();

  if (!viewer) throw new Error('Failed to create viewer user');
  console.log(`Created viewer: ${viewer.email}`);

  console.log('Seed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
