import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, waitFor } from '@testing-library/react';

import { ConversationsList } from '../conversations-list';
import { renderWithQuery } from '@/test-utils/render-with-query';

// Stub next-intl with the literal English copy from messages/en.json so the
// test isn't coupled to the full provider wiring.
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const dict: Record<string, string> = {
      conversationsHeading: 'Conversations',
      conversationsToday: 'Today',
      conversationsYesterday: 'Yesterday',
      conversationsThisWeek: 'This week',
      conversationsOlder: 'Older',
      conversationsEmpty: 'No saved conversations yet.',
    };
    return (key: string) => dict[key] ?? key;
  },
}));

// Anchor timestamps to the test runner's real "now" so the client-side
// bucketizer in ConversationsList puts each row in a deterministic bucket
// regardless of when the test executes. We avoid fake timers here because
// `waitFor` polls via real setTimeout — see beforeEach for the rationale.
const NOW = Date.now();
const ONE_DAY = 24 * 60 * 60 * 1000;

const ROWS = [
  {
    id: 'c-today',
    title: 'Today conversation',
    dataSourceId: 'src-1',
    lastMessageAt: new Date(NOW).toISOString(),
    createdAt: new Date(NOW).toISOString(),
  },
  {
    id: 'c-yesterday',
    title: 'Yesterday conversation',
    dataSourceId: 'src-1',
    lastMessageAt: new Date(NOW - ONE_DAY - 60_000).toISOString(),
    createdAt: new Date(NOW - ONE_DAY - 60_000).toISOString(),
  },
];

describe('<ConversationsList>', () => {
  beforeEach(() => {
    // Real timers — `waitFor` polls via setTimeout under the hood, so faking
    // them deadlocks the resolution of the fetch microtask queue.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ conversations: ROWS }),
      } as Response),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /** Pull the absolutely-positioned indicator out of the rendered tree. */
  function getIndicator(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>('span[aria-hidden]');
  }

  it('hides the indicator (opacity 0) when there is no active id', async () => {
    const { container } = renderWithQuery(
      <ConversationsList sourceId="src-1" activeId={null} />,
    );

    // Resolve the fetch promise + the useQuery state update.
    await waitFor(() => {
      expect(container.querySelector('button[title="Today conversation"]')).toBeTruthy();
    });

    const indicator = getIndicator(container);
    expect(indicator).toBeTruthy();
    expect(indicator!.style.opacity).toBe('0');
  });

  it('shows the indicator opaque when activeId matches a rendered row', async () => {
    const { container } = renderWithQuery(
      <ConversationsList sourceId="src-1" activeId="c-today" />,
    );

    await waitFor(() => {
      expect(container.querySelector('button[title="Today conversation"]')).toBeTruthy();
    });

    const indicator = getIndicator(container);
    expect(indicator).toBeTruthy();
    expect(indicator!.style.opacity).toBe('1');
  });

  it('hides the indicator when activeId is set but no row matches it', async () => {
    // Simulates the post-source-switch state: the active conversation isn't in
    // the new list, so the bar should clear rather than freeze on a stale row.
    const { container } = renderWithQuery(
      <ConversationsList sourceId="src-1" activeId="not-in-list" />,
    );

    await waitFor(() => {
      expect(container.querySelector('button[title="Today conversation"]')).toBeTruthy();
    });

    const indicator = getIndicator(container);
    expect(indicator!.style.opacity).toBe('0');
  });

  it('drops the per-item border (rows render with constant left padding)', async () => {
    // The sliding bar is the sole visual source of truth for the active row.
    // Asserts that no row paints its own border-left, which would compete with
    // the bar at group boundaries.
    const { container } = renderWithQuery(
      <ConversationsList sourceId="src-1" activeId="c-today" />,
    );

    await waitFor(() => {
      expect(container.querySelector('button[title="Today conversation"]')).toBeTruthy();
    });

    const activeRow = container.querySelector<HTMLButtonElement>(
      'button[title="Today conversation"]',
    );
    // Constant 10px left padding regardless of active state.
    expect(activeRow!.style.paddingLeft).toBe('10px');
    // No competing static border.
    expect(activeRow!.style.borderLeft).toBe('');
  });

  it('renders the empty state when the API returns no conversations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ conversations: [] }),
      } as Response),
    );

    const { container, getByText } = renderWithQuery(
      <ConversationsList sourceId="src-1" activeId={null} />,
    );

    await waitFor(() => {
      expect(getByText('No saved conversations yet.')).toBeTruthy();
    });

    // Indicator is still mounted but hidden in the empty case.
    const indicator = getIndicator(container);
    expect(indicator!.style.opacity).toBe('0');
  });
});
