import { z } from 'zod';

/** Zod schema for connector pool settings. */
export const poolConfigSchema = z.object({
  min: z.number().int().min(0).optional(),
  max: z.number().int().positive().optional(),
  idleTimeoutMs: z.number().int().positive().optional(),
  connectionTimeoutMs: z.number().int().positive().optional(),
});

/** Zod schema for connector configuration. */
export const connectorConfigSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  connection: z.record(z.unknown()),
  pool: poolConfigSchema.optional(),
});

/** Zod schema for Postgres-specific connection config. */
export const postgresConnectionSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().default(5432),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string(),
  ssl: z.boolean().default(false),
});
