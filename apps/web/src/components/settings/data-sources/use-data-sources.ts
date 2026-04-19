'use client';

import { useCallback, useEffect, useState } from 'react';

/** Shape of a data source row fetched from `/api/data-sources`. */
export interface DataSourceRow {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
  createdAt: string;
}

/** Return type of {@link useDataSources}. */
export interface DataSourcesState {
  sources: DataSourceRow[];
  loading: boolean;
  error: string | null;
  deletingId: string | null;
  refetch: () => Promise<void>;
  /** Optimistically remove by id and fire the DELETE request. */
  remove: (id: string) => Promise<void>;
}

/**
 * Fetches the org's data sources and exposes a delete-by-id helper with
 * the same optimistic-update semantics the old `DataSourcesPageClient` had.
 */
export function useDataSources(): DataSourcesState {
  const [sources, setSources] = useState<DataSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data-sources');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { dataSources: DataSourceRow[] };
      setSources(data.dataSources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/data-sources/${id}`, { method: 'DELETE' });
        if (res.ok) {
          setSources((prev) => prev.filter((s) => s.id !== id));
        } else {
          // Refetch to surface the authoritative list.
          await load();
        }
      } finally {
        setDeletingId(null);
      }
    },
    [load],
  );

  return { sources, loading, error, deletingId, refetch: load, remove };
}
