import { z } from 'zod';
import type { FilterClause } from './types';

// ─── Field Reference ───────────────────────────────────────────────

/** Schema for a field reference (column or expression). */
export const fieldRefSchema = z.object({
  field: z.string().describe('Column name or expression'),
  table: z.string().optional().describe('Table or alias qualifier'),
  alias: z.string().optional().describe('Output alias for this field'),
});

// ─── Filter Operators ──────────────────────────────────────────────

/** All supported comparison operators. */
export const filterOperatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'like',
  'is_null',
  'is_not_null',
]);

/** Schema for a single filter condition. */
export const filterConditionSchema = z.object({
  field: fieldRefSchema,
  operator: filterOperatorSchema,
  value: z
    .union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))])
    .optional()
    .describe('Comparison value (omitted for is_null/is_not_null)'),
});

/** Schema for a filter clause (conditions combined with boolean logic). */
export const filterClauseSchema: z.ZodType<FilterClause> = z.lazy(() =>
  z.union([
    filterConditionSchema,
    z.object({
      and: z.array(filterClauseSchema).min(1).describe('All conditions must match'),
    }),
    z.object({
      or: z.array(filterClauseSchema).min(1).describe('Any condition must match'),
    }),
  ]),
);

// ─── Aggregation ───────────────────────────────────────────────────

/** All supported aggregation functions. */
export const aggregationFunctionSchema = z.enum([
  'sum',
  'avg',
  'count',
  'count_distinct',
  'min',
  'max',
  'percentile',
]);

/** Schema for an aggregation expression. */
export const aggregationSchema = z.object({
  function: aggregationFunctionSchema,
  field: fieldRefSchema,
  alias: z.string().optional().describe('Output alias for aggregation result'),
  params: z
    .record(z.union([z.string(), z.number()]))
    .optional()
    .describe('Function-specific parameters (e.g. percentile value)'),
});

// ─── Order ─────────────────────────────────────────────────────────

/** Schema for an ordering clause. */
export const orderClauseSchema = z.object({
  field: fieldRefSchema,
  direction: z.enum(['asc', 'desc']).default('asc'),
});

// ─── Time Range ────────────────────────────────────────────────────

/** Schema for a time range filter. */
export const timeRangeSchema = z.object({
  field: fieldRefSchema.describe('Timestamp field to filter on'),
  from: z.string().describe('Start time (ISO 8601 or relative like "now-1h")'),
  to: z.string().describe('End time (ISO 8601 or relative like "now")'),
});

// ─── Join ──────────────────────────────────────────────────────────

/** Schema for a join clause. */
export const joinClauseSchema = z.object({
  type: z.enum(['inner', 'left', 'right', 'cross']).default('inner'),
  table: z.string().describe('Table to join'),
  alias: z.string().optional(),
  on: filterClauseSchema.describe('Join condition'),
});

// ─── QueryIR ───────────────────────────────────────────────────────

/** Schema for the full Query Intermediate Representation. */
export const queryIRSchema = z.object({
  source: z.string().describe('Data source ID or name'),
  table: z.string().describe('Primary table or collection'),
  tableAlias: z.string().optional(),
  select: z.array(fieldRefSchema).default([]),
  filter: filterClauseSchema.optional(),
  aggregations: z.array(aggregationSchema).default([]),
  groupBy: z.array(fieldRefSchema).default([]),
  orderBy: z.array(orderClauseSchema).default([]),
  timeRange: timeRangeSchema.optional(),
  joins: z.array(joinClauseSchema).default([]),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});
