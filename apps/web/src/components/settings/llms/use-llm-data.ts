'use client';

import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { queryKeys } from '@/lib/query-keys';

/**
 * LLM config record as returned by `/api/settings/ai/configs`. The API never
 * returns the raw key — `hasApiKey` is a boolean sentinel the UI uses to
 * decide whether to show a masked placeholder.
 */
export interface LlmConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  temperature: number | null;
  maxTokens: number | null;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Four-role routing map. `null` means the role hasn't been assigned yet. */
export interface RoutingMap {
  leader: string | null;
  query: string | null;
  view: string | null;
  insights: string | null;
}

const EMPTY_ROUTING: RoutingMap = { leader: null, query: null, view: null, insights: null };

/** 5 minutes — metadata refreshes gently. */
const METADATA_STALE_TIME = 5 * 60 * 1000;

/** Fetch all LLM configs for the current org. Raw queryFn for {@link useLlmData}. */
async function fetchConfigs(): Promise<LlmConfig[]> {
  const res = await fetch('/api/settings/ai/configs');
  if (!res.ok) throw new Error(`Configs HTTP ${res.status}`);
  const json = (await res.json()) as { configs: LlmConfig[] };
  return json.configs ?? [];
}

/** Fetch the per-role routing map. Raw queryFn for {@link useLlmData}. */
async function fetchRouting(): Promise<RoutingMap> {
  const res = await fetch('/api/settings/ai/routing');
  if (!res.ok) throw new Error(`Routing HTTP ${res.status}`);
  const json = (await res.json()) as { routing: RoutingMap };
  return json.routing ?? EMPTY_ROUTING;
}

/** Return type of {@link useLlmData}. */
export interface LlmDataState {
  configs: LlmConfig[];
  routing: RoutingMap;
  loading: boolean;
  error: string | null;
  /** Re-fetch both configs and routing from the server. */
  refetch: () => Promise<void>;
}

/**
 * Fetches configs + routing in parallel via react-query. The two queries run
 * under distinct keys so mutations can invalidate one without churning the
 * other (e.g. editing a config's name doesn't need to refetch routing).
 *
 * `loading` is true only until both queries produce data; `error` surfaces
 * the first failing query's message so the wrapper can show a single
 * error banner instead of one per request.
 */
export function useLlmData(): LlmDataState {
  const queryClient = useQueryClient();
  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.aiConfigs(),
        queryFn: fetchConfigs,
        staleTime: METADATA_STALE_TIME,
      },
      {
        queryKey: queryKeys.aiRouting(),
        queryFn: fetchRouting,
        staleTime: METADATA_STALE_TIME,
      },
    ],
  });

  const configsResult = results[0]!;
  const routingResult = results[1]!;

  const configs = configsResult.data ?? [];
  const routing = routingResult.data ?? EMPTY_ROUTING;
  const loading = configsResult.isPending || routingResult.isPending;
  const error =
    configsResult.error instanceof Error
      ? configsResult.error.message
      : routingResult.error instanceof Error
        ? routingResult.error.message
        : null;

  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigs() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.aiRouting() }),
    ]);
  }, [queryClient]);

  return { configs, routing, loading, error, refetch };
}
