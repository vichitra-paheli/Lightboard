'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { queryKeys } from '@/lib/query-keys';

/** Shape of a data source row fetched from `/api/data-sources`. */
export interface DataSourceRow {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
  createdAt: string;
}

/** 5 minutes — data sources are metadata, they rarely change mid-session. */
const METADATA_STALE_TIME = 5 * 60 * 1000;

/**
 * Fetch all data sources for the current org. Shared queryFn.
 *
 * Unwraps the API's `{ dataSources }` envelope to a flat array. Other callers
 * sharing this query key (e.g. the explore page) must return the same shape
 * or react-query will hand one consumer the other's cached result.
 */
async function fetchDataSources(): Promise<DataSourceRow[]> {
  const res = await fetch('/api/data-sources');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { dataSources?: DataSourceRow[] };
  return data.dataSources ?? [];
}

/** Return type of {@link useDataSources}. */
export interface DataSourcesState {
  sources: DataSourceRow[];
  loading: boolean;
  /** Error from the list fetch (not the delete mutation). */
  error: string | null;
  deletingId: string | null;
  /**
   * Error from the most recent delete attempt, if any. Stays set until the
   * next delete is kicked off, so the UI has time to render a toast / inline
   * banner explaining why the row reappeared after the optimistic removal.
   */
  deleteError: { id: string; message: string } | null;
  /** Clear the last `deleteError`. */
  clearDeleteError: () => void;
  refetch: () => Promise<void>;
  /** Optimistically remove by id and fire the DELETE request. */
  remove: (id: string) => Promise<void>;
}

/**
 * Fetches the org's data sources via react-query and exposes an optimistic
 * delete-by-id helper.
 *
 * The delete mutation follows the standard react-query optimistic-update
 * dance: `onMutate` cancels any in-flight fetches, snapshots the current
 * list, and removes the doomed row; `onError` rolls back to the snapshot so
 * server-side rejections don't leave the UI in a lying state; `onSettled`
 * invalidates the cache so the authoritative list replaces any client-side
 * guesses.
 */
export function useDataSources(): DataSourcesState {
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const query = useQuery({
    queryKey: queryKeys.dataSources(),
    queryFn: fetchDataSources,
    staleTime: METADATA_STALE_TIME,
  });

  const deleteMutation = useMutation<void, Error, string, { previous?: DataSourceRow[] }>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/data-sources/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        // Try to lift the server's error message; fall back to the status code.
        let serverMsg: string | undefined;
        try {
          const body = (await res.json()) as { error?: string };
          serverMsg = body?.error;
        } catch {
          /* non-JSON body */
        }
        throw new Error(serverMsg ?? `HTTP ${res.status}`);
      }
    },
    onMutate: async (id) => {
      setDeleteError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.dataSources() });
      const previous = queryClient.getQueryData<DataSourceRow[]>(queryKeys.dataSources());
      if (previous) {
        queryClient.setQueryData<DataSourceRow[]>(
          queryKeys.dataSources(),
          previous.filter((s) => s.id !== id),
        );
      }
      return { previous };
    },
    onError: (err, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.dataSources(), context.previous);
      }
      setDeleteError({ id, message: err instanceof Error ? err.message : String(err) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dataSources() });
    },
  });

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.dataSources() });
  }, [queryClient]);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteMutation.mutateAsync(id);
      } catch {
        // The failure is already on `deleteError`; swallow so callers don't
        // have to guard against rejection.
      }
    },
    [deleteMutation],
  );

  const clearDeleteError = useCallback(() => setDeleteError(null), []);

  return {
    sources: query.data ?? [],
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    deletingId: deleteMutation.isPending ? (deleteMutation.variables ?? null) : null,
    deleteError,
    clearDeleteError,
    refetch,
    remove,
  };
}
