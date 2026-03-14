import { queryIRSchema } from '@lightboard/query-ir';
import { z } from 'zod';

/** Zod schema for ControlSpec. */
export const controlSpecSchema = z.object({
  type: z.enum(['dropdown', 'multi_select', 'date_range', 'text_input', 'toggle']),
  label: z.string().min(1),
  variable: z.string().min(1),
  source: z.record(z.unknown()).optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
  defaultValue: z.unknown().optional(),
});

/** Zod schema for ChartSpec. */
export const chartSpecSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.unknown()),
});

/** Zod schema for ViewSpec. */
export const viewSpecSchema = z.object({
  query: z.record(z.unknown()),
  chart: chartSpecSchema,
  controls: z.array(controlSpecSchema).default([]),
  title: z.string().optional(),
  description: z.string().optional(),
});
