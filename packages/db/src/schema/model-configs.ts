import { index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

/**
 * Named LLM model configurations per organization.
 *
 * Each row stores one configured provider + model pair (e.g. "Haiku 4.5").
 * The encrypted API key is stored here — never returned in API responses;
 * the caller sees `hasApiKey: true`. Rows are routed to agent roles via the
 * {@link agentRoleAssignments} table.
 */
export const modelConfigs = pgTable(
  'model_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Human-readable name shown in the UI (e.g. "Default", "Sonnet 4.5"). */
    name: text('name').notNull(),
    /**
     * Provider family key. One of:
     *   'anthropic' | 'openai' | 'openai-compatible' | 'azure' | 'bedrock' | 'google' | 'local'
     * Only 'anthropic', 'openai', 'openai-compatible', and 'local' are wired up
     * in this release — the others are selectable in the UI but resolve to an
     * error until their provider implementations land.
     */
    provider: text('provider').notNull(),
    /** Model identifier understood by the provider (e.g. 'claude-haiku-4-5'). */
    model: text('model').notNull(),
    /** Optional base URL — required for openai-compatible / azure / local. */
    baseUrl: text('base_url'),
    /** Encrypted API key (aes-256-gcm, per-org derived key). */
    encryptedApiKey: text('encrypted_api_key').notNull(),
    /** Sampling temperature (0–2). `null` defers to the provider default. */
    temperature: numeric('temperature', { precision: 3, scale: 2 }),
    /** Output-token ceiling per turn. `null` defers to the provider default. */
    maxTokens: integer('max_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('model_configs_org_id_idx').on(table.orgId)],
);
