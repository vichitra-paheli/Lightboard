import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { dataSourceTypeEnum } from './enums';
import { organizations } from './organizations';

/** Data sources represent external database/API connections. Credentials are encrypted. */
export const dataSources = pgTable(
  'data_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: dataSourceTypeEnum('type').notNull(),
    config: jsonb('config').notNull().default({}),
    credentials: text('credentials').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('data_sources_org_id_idx').on(table.orgId)],
);
