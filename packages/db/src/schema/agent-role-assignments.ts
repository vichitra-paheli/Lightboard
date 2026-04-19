import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { modelConfigs } from './model-configs';
import { organizations } from './organizations';

/**
 * Maps each agent role to a {@link modelConfigs} row for an organization.
 *
 * There are exactly four roles (`leader`, `query`, `view`, `insights`) —
 * one row per role per org. `onDelete: 'restrict'` on `modelConfigId` means
 * a config cannot be deleted while any role still references it; the API
 * layer surfaces this as a 409 to the user.
 */
export const agentRoleAssignments = pgTable(
  'agent_role_assignments',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** One of 'leader' | 'query' | 'view' | 'insights'. */
    role: text('role').notNull(),
    modelConfigId: uuid('model_config_id')
      .notNull()
      .references(() => modelConfigs.id, { onDelete: 'restrict' }),
  },
  (table) => [primaryKey({ columns: [table.orgId, table.role] })],
);
