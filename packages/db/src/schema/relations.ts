import { relations } from 'drizzle-orm';

import { agentRoleAssignments } from './agent-role-assignments';
import { dataSources } from './data-sources';
import { modelConfigs } from './model-configs';
import { organizations } from './organizations';
import { sessions } from './sessions';
import { users } from './users';
import { views } from './views';

/** Organization has many users, sessions, data sources, views, and model configs. */
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  sessions: many(sessions),
  dataSources: many(dataSources),
  views: many(views),
  modelConfigs: many(modelConfigs),
  agentRoleAssignments: many(agentRoleAssignments),
}));

/** User belongs to an organization and has many sessions and views. */
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  sessions: many(sessions),
  views: many(views),
}));

/** Session belongs to a user and an organization. */
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [sessions.orgId],
    references: [organizations.id],
  }),
}));

/** Data source belongs to an organization. */
export const dataSourcesRelations = relations(dataSources, ({ one }) => ({
  organization: one(organizations, {
    fields: [dataSources.orgId],
    references: [organizations.id],
  }),
}));

/** View belongs to an organization and a creator. */
export const viewsRelations = relations(views, ({ one }) => ({
  organization: one(organizations, {
    fields: [views.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [views.createdBy],
    references: [users.id],
  }),
}));

/** Model config belongs to an organization and can be referenced by many role assignments. */
export const modelConfigsRelations = relations(modelConfigs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [modelConfigs.orgId],
    references: [organizations.id],
  }),
  roleAssignments: many(agentRoleAssignments),
}));

/** Agent role assignment belongs to an organization and a single model config. */
export const agentRoleAssignmentsRelations = relations(agentRoleAssignments, ({ one }) => ({
  organization: one(organizations, {
    fields: [agentRoleAssignments.orgId],
    references: [organizations.id],
  }),
  modelConfig: one(modelConfigs, {
    fields: [agentRoleAssignments.modelConfigId],
    references: [modelConfigs.id],
  }),
}));
