import { pgEnum } from 'drizzle-orm/pg-core';

/** User role within an organization. */
export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'viewer']);

/** Data source connector type. */
export const dataSourceTypeEnum = pgEnum('data_source_type', [
  'postgres',
  'mysql',
  'clickhouse',
  'rest',
  'csv',
  'prometheus',
  'elasticsearch',
]);

/** View visibility level. */
export const visibilityEnum = pgEnum('visibility', ['private', 'org', 'public']);
