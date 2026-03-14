import { index, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Telemetry lives in a separate Postgres schema. */
const telemetrySchema = pgSchema('telemetry');

/** Telemetry events for observability. Stored in the `telemetry` schema. */
export const telemetryEvents = telemetrySchema.table(
  'telemetry_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id'),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('telemetry_events_org_type_time_idx').on(
      table.orgId,
      table.eventType,
      table.createdAt,
    ),
  ],
);
