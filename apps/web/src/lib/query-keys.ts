/**
 * Central registry of react-query keys used across the web app.
 *
 * Tuples are returned as `readonly` arrays so consumers can spread them into
 * `queryKey` / `queryClient.invalidateQueries({ queryKey })` calls without
 * risking in-place mutation. Every key lives in one place so that mutation
 * handlers can invalidate the exact cache slice they need and stay in sync
 * with the hooks that read it.
 */
export const queryKeys = {
  /** List of all LLM configs for the current org. */
  aiConfigs: () => ['ai-configs'] as const,
  /** Per-role LLM routing map (`leader`, `query`, `view`, `insights`). */
  aiRouting: () => ['ai-routing'] as const,
  /** List of all data sources for the current org. */
  dataSources: () => ['data-sources'] as const,
  /** Schema payload for a specific data source. */
  dataSourceSchema: (id: string) => ['data-sources', id, 'schema'] as const,
  /** Currently-authenticated user metadata. */
  authMe: () => ['auth', 'me'] as const,
} as const;
