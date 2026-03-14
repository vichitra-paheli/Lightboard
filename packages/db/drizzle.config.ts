import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/** Drizzle Kit configuration for schema migrations. */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
