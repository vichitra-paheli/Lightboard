import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { queryKeys } from '@/lib/query-keys';
import { makeTestQueryClient, renderWithQuery } from '@/test-utils/render-with-query';

import { RoutingCard } from '../routing-card';
import type { LlmConfig, RoutingMap } from '../use-llm-data';

// Provide a minimal next-intl stub so `useTranslations('settings.llms.routing')`
// works without bootstrapping the full message bundle.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      title: 'Routing',
      subtitle: 'Which model handles which job.',
      unassigned: '— select a model —',
      'roles.leader.label': 'Leader / orchestrator',
      'roles.leader.desc': 'Top-level chat.',
      'roles.query.label': 'Query agent',
      'roles.query.desc': 'Writes SQL.',
      'roles.view.label': 'View agent',
      'roles.view.desc': 'Generates HTML.',
      'roles.insights.label': 'Insights agent',
      'roles.insights.desc': 'Stats.',
    };
    const resolved = map[key] ?? key;
    if (vars && Object.keys(vars).length > 0) {
      return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), resolved);
    }
    return resolved;
  },
}));

const CONFIGS: LlmConfig[] = [
  {
    id: 'cfg-haiku',
    name: 'Haiku 4.5',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    baseUrl: null,
    temperature: 0.2,
    maxTokens: 4096,
    hasApiKey: true,
    createdAt: '2026-04-18',
    updatedAt: '2026-04-18',
  },
  {
    id: 'cfg-sonnet',
    name: 'Sonnet 4.5',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    baseUrl: null,
    temperature: 0.2,
    maxTokens: 4096,
    hasApiKey: true,
    createdAt: '2026-04-18',
    updatedAt: '2026-04-18',
  },
];

const ROUTING: RoutingMap = {
  leader: 'cfg-haiku',
  query: 'cfg-haiku',
  view: 'cfg-haiku',
  insights: 'cfg-haiku',
};

describe('RoutingCard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    // Default: any `fetch()` call returns a 200 so the mutation resolves and
    // `onUpdated` fires. Individual tests override with mockResolvedValueOnce
    // when they need to simulate errors.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response),
    );
  });

  it('renders one row per agent role', () => {
    renderWithQuery(<RoutingCard routing={ROUTING} configs={CONFIGS} onUpdated={() => {}} />);
    expect(screen.getByText('Leader / orchestrator')).toBeDefined();
    expect(screen.getByText('Query agent')).toBeDefined();
    expect(screen.getByText('View agent')).toBeDefined();
    expect(screen.getByText('Insights agent')).toBeDefined();
  });

  it('PUTs to /api/settings/ai/routing with the right payload on assignment change', async () => {
    const onUpdated = vi.fn();
    renderWithQuery(<RoutingCard routing={ROUTING} configs={CONFIGS} onUpdated={onUpdated} />);

    // Open the Leader select (first in the list) and pick Sonnet.
    const leaderButton = screen.getByRole('button', { name: 'Leader / orchestrator' });
    fireEvent.click(leaderButton);
    const sonnetOption = screen.getByRole('option', { name: /Sonnet 4\.5/ });
    fireEvent.click(sonnetOption);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/settings/ai/routing');
    expect(init).toMatchObject({ method: 'PUT' });
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toEqual({ leader: 'cfg-sonnet' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('skips the PUT when the user picks the already-assigned option', () => {
    renderWithQuery(<RoutingCard routing={ROUTING} configs={CONFIGS} onUpdated={() => {}} />);
    const leaderButton = screen.getByRole('button', { name: 'Leader / orchestrator' });
    fireEvent.click(leaderButton);
    // Haiku is already assigned to leader — clicking it should be a no-op.
    const haikuOption = screen.getAllByRole('option', { name: /Haiku 4\.5/ })[0]!;
    fireEvent.click(haikuOption);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('optimistically updates the routing cache before the fetch resolves', async () => {
    // Hold the mutation's fetch pending so we can observe the optimistic
    // cache state mid-flight. Resolving it later lets the mutation settle.
    let resolveFetch: (v: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(pending);

    const client = makeTestQueryClient();
    client.setQueryData(queryKeys.aiRouting(), ROUTING);

    renderWithQuery(<RoutingCard routing={ROUTING} configs={CONFIGS} onUpdated={() => {}} />, {
      client,
    });

    const leaderButton = screen.getByRole('button', { name: 'Leader / orchestrator' });
    fireEvent.click(leaderButton);
    fireEvent.click(screen.getByRole('option', { name: /Sonnet 4\.5/ }));

    // Optimistic patch lands synchronously after the click.
    await waitFor(() => {
      const optimistic = client.getQueryData<RoutingMap>(queryKeys.aiRouting());
      expect(optimistic?.leader).toBe('cfg-sonnet');
    });

    // Let the fetch settle so the mutation doesn't leak across tests.
    resolveFetch({ ok: true, json: async () => ({}) } as Response);
  });

  it('rolls back the optimistic patch if the PUT fails', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const client = makeTestQueryClient();
    client.setQueryData(queryKeys.aiRouting(), ROUTING);

    const onUpdated = vi.fn();
    renderWithQuery(
      <RoutingCard routing={ROUTING} configs={CONFIGS} onUpdated={onUpdated} />,
      { client },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leader / orchestrator' }));
    fireEvent.click(screen.getByRole('option', { name: /Sonnet 4\.5/ }));

    // After the failed PUT settles, the routing cache should be back to the
    // original assignment and `onUpdated` should never have fired.
    await waitFor(() => {
      const rolled = client.getQueryData<RoutingMap>(queryKeys.aiRouting());
      expect(rolled?.leader).toBe('cfg-haiku');
    });
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
