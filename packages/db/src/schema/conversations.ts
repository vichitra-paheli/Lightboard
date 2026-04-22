import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { dataSources } from './data-sources';
import { organizations } from './organizations';
import { users } from './users';

/**
 * Persistent chat transcripts for the Explore surface.
 *
 * One row per top-level conversation thread. The sidebar filters on
 * `dataSourceId`, orders on `lastMessageAt`, and never loads message bodies —
 * message contents live in {@link conversationMessages}. The FK to
 * `data_sources` intentionally uses `ON DELETE SET NULL` so deleting a source
 * does not destroy transcripts the user may still want to read.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Data source the conversation was started against. Null after the source
     * is deleted (see `SET NULL` above) so the transcript survives.
     */
    dataSourceId: uuid('data_source_id').references(() => dataSources.id, {
      onDelete: 'set null',
    }),
    /**
     * Short human-readable title — seeded from the first user message on
     * conversation creation. A follow-up ticket will replace this with an
     * LLM-generated title after turn 2.
     */
    title: text('title').notNull().default('New conversation'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    /**
     * Updated on every appended turn. Drives sidebar ordering without needing
     * a `MAX(sequence)` subquery per row.
     */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('conversations_org_source_last_idx').on(
      table.orgId,
      table.dataSourceId,
      table.lastMessageAt,
    ),
    index('conversations_org_creator_last_idx').on(
      table.orgId,
      table.createdBy,
      table.lastMessageAt,
    ),
  ],
);

/**
 * One row per message inside a conversation — append-only.
 *
 * `sequence` is a monotonically increasing int assigned by the writer and is
 * used for ordering instead of `createdAt` because a single agent turn can
 * append many tool-result messages inside a <5 ms window. `toolCalls` and
 * `toolResults` mirror the in-memory `Message` shape the leader reads on
 * resume; `viewSpec` denormalizes the HTML output from `create_view` so the
 * filmstrip and thread can render without re-parsing the stringified
 * `toolResults` JSON.
 */
export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** Writer-assigned, unique per conversation. See the unique index below. */
    sequence: integer('sequence').notNull(),
    /** `'user' | 'assistant' | 'system'` — not enforced at the DB layer. */
    role: text('role').notNull(),
    content: text('content').notNull().default(''),
    /**
     * Shape: `ToolCallResult[]` — `{ id, name, input }`. Present on assistant
     * messages that emitted tool calls; null otherwise.
     */
    toolCalls: jsonb('tool_calls'),
    /**
     * Shape: `PersistedToolResult[]` — tool output after {@link summarizeToolResult}.
     * Big rowsets are truncated, HTML views are kept intact, scratchpad loads
     * are stubbed. See `packages/agent/src/conversation/persisted.ts`.
     */
    toolResults: jsonb('tool_results'),
    /**
     * Denormalized HTML view payload for fast filmstrip + thread rendering.
     * Shape: `{ html, title, sql?, viewId? }` for create/modify_view
     * outputs. Null on every other message. Source of truth stays inside
     * `toolResults` — this column is a render convenience.
     */
    viewSpec: jsonb('view_spec'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('conversation_messages_conv_seq_idx').on(
      table.conversationId,
      table.sequence,
    ),
    index('conversation_messages_org_conv_idx').on(table.orgId, table.conversationId),
  ],
);
