'use client';

import { useCallback, useEffect, useState } from 'react';

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
 * Fetches configs + routing in parallel and exposes a single loading state.
 *
 * Kept deliberately plain (fetch + useState) so it matches the existing
 * `data-sources-page-client` pattern — we'll port the whole settings
 * surface to react-query in a follow-up when we pull it in workspace-wide.
 */
export function useLlmData(): LlmDataState {
  const [configs, setConfigs] = useState<LlmConfig[]>([]);
  const [routing, setRouting] = useState<RoutingMap>(EMPTY_ROUTING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configsRes, routingRes] = await Promise.all([
        fetch('/api/settings/ai/configs'),
        fetch('/api/settings/ai/routing'),
      ]);
      if (!configsRes.ok) throw new Error(`Configs HTTP ${configsRes.status}`);
      if (!routingRes.ok) throw new Error(`Routing HTTP ${routingRes.status}`);
      const configsJson = (await configsRes.json()) as { configs: LlmConfig[] };
      const routingJson = (await routingRes.json()) as { routing: RoutingMap };
      setConfigs(configsJson.configs ?? []);
      setRouting(routingJson.routing ?? EMPTY_ROUTING);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { configs, routing, loading, error, refetch: load };
}
