import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { visibilityEnum } from './enums';
import { organizations } from './organizations';
import { users } from './users';

/** Views store saved visualizations with their QueryIR spec. */
export const views = pgTable(
  'views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    spec: jsonb('spec').notNull(),
    version: integer('version').notNull().default(1),
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('views_org_created_by_idx').on(table.orgId, table.createdBy)],
);
