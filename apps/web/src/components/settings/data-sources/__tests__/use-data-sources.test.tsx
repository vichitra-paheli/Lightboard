import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { queryKeys } from '@/lib/query-keys';
import { makeTestQueryClient } from '@/test-utils/render-with-query';

import type { DataSourceRow } from '../use-data-sources';
import { useDataSources } from '../use-data-sources';

const SOURCES: DataSourceRow[] = [
  { id: 'ds-1', name: 'cricket', type: 'postgres', config: null, createdAt: '2026-04-18' },
  { id: 'ds-2', name: 'analytics', type: 'postgres', config: null, createdAt: '2026-04-18' },
];

describe('useDataSources', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ dataSources: SOURCES }),
      } as Response),
    );
  });

  /** Wrap the hook in a fresh client so the test isn't polluted by other cases. */
  function buildWrapper() {
    const client = makeTestQueryClient();
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return { client, Wrapper };
  }

  it('loads the list from /api/data-sources and exposes sources', async () => {
    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useDataSources(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sources).toHaveLength(2);
    expect(result.current.sources[0]!.name).toBe('cricket');
  });

  it('optimistically removes a row on delete and invalidates the cache', async () => {
    const { client, Wrapper } = buildWrapper();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    // Three calls happen in order:
    //   1. Initial list load (returns both rows).
    //   2. DELETE /api/data-sources/ds-1 (success).
    //   3. Refetch triggered by onSettled — should return the shorter list
    //      so we can assert the server-confirmed absence of ds-1.
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ dataSources: SOURCES }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dataSources: SOURCES.filter((s) => s.id !== 'ds-1') }),
      } as Response);

    const { result } = renderHook(() => useDataSources(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('ds-1');
    });

    // After the full optimistic + refetch dance, ds-1 is gone.
    await waitFor(() => {
      const after = client.getQueryData<DataSourceRow[]>(queryKeys.dataSources());
      expect(after?.some((s) => s.id === 'ds-1')).toBe(false);
    });
  });

  it('rolls back the optimistic removal if the DELETE fails', async () => {
    const { client, Wrapper } = buildWrapper();
    client.setQueryData(queryKeys.dataSources(), SOURCES);

    // The next fetch (the DELETE) fails. The subsequent invalidate refetch
    // returns the original list so the cache ends up restored.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useDataSources(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('ds-1');
    });

    // The onError handler restores the snapshot; the subsequent refetch
    // from onSettled returns the full list again.
    await waitFor(() => {
      const after = client.getQueryData<DataSourceRow[]>(queryKeys.dataSources());
      expect(after?.some((s) => s.id === 'ds-1')).toBe(true);
    });
  });
});
