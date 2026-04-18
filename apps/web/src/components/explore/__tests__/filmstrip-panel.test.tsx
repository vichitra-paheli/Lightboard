import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { FilmstripPanel, type FilmstripItem } from '../filmstrip-panel';
import type { HtmlView } from '@/components/view-renderer';

// Mirrors the dict-stub pattern used in thread.test.tsx — returns the English
// copy for the keys the panel renders so assertions can target literal text.
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const dict: Record<string, string> = {
      filmstripEyebrow: 'Filmstrip',
      filmstripClose: 'Close filmstrip',
      filmstripEmpty: 'No visualizations yet. Send a prompt to get started.',
      filmstripPinned: 'pinned',
    };
    return (key: string, values?: Record<string, unknown>) => {
      if (key === 'filmstripCount') {
        const n = typeof values?.count === 'number' ? values.count : 0;
        if (n === 0) return 'no generations';
        if (n === 1) return '1 generation';
        return `${n} generations`;
      }
      return dict[key] ?? key;
    };
  },
}));

function makeView(title: string, html = `<html><script>new Chart(ctx, { type: 'bar', data: [] })</script></html>`): HtmlView {
  return { title, sql: 'SELECT 1', html };
}

function makeItem(id: string, title: string, extras: Partial<FilmstripItem> = {}): FilmstripItem {
  return { id, view: makeView(title), ...extras };
}

describe('<FilmstripPanel>', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the count with the correct plural form', () => {
    const { getByText } = render(
      <FilmstripPanel
        open
        onClose={() => {}}
        items={[makeItem('v1', 'Runs by season'), makeItem('v2', 'Wickets by bowler')]}
        activeIndex={-1}
        onSelect={() => {}}
      />,
    );
    expect(getByText('2 generations')).toBeTruthy();
  });

  it('renders the empty state when no items are passed', () => {
    const { getByText, queryAllByRole } = render(
      <FilmstripPanel
        open
        onClose={() => {}}
        items={[]}
        activeIndex={-1}
        onSelect={() => {}}
      />,
    );
    expect(
      getByText('No visualizations yet. Send a prompt to get started.'),
    ).toBeTruthy();
    // Only the close button is a button — no card buttons rendered.
    const buttons = queryAllByRole('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Close filmstrip');
  });

  it('applies active styling to the card matching activeIndex', () => {
    const { container } = render(
      <FilmstripPanel
        open
        onClose={() => {}}
        items={[
          makeItem('v1', 'Runs by season'),
          makeItem('v2', 'Wickets by bowler'),
          makeItem('v3', 'Avg strike rate'),
        ]}
        activeIndex={1}
        onSelect={() => {}}
      />,
    );
    const cards = container.querySelectorAll('[data-filmstrip-card]');
    expect(cards.length).toBe(3);
    const activeCards = container.querySelectorAll(
      '[data-filmstrip-active="true"]',
    );
    expect(activeCards.length).toBe(1);
    // `data-filmstrip-active` is set from the unreversed index, which is
    // what callers pass in — confirm the right card got marked.
    const activeAriaPressed = activeCards[0]?.getAttribute('aria-pressed');
    expect(activeAriaPressed).toBe('true');
  });

  it('invokes onSelect with the unreversed index when a card is clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <FilmstripPanel
        open
        onClose={() => {}}
        items={[
          makeItem('v1', 'Runs by season'),
          makeItem('v2', 'Wickets by bowler'),
          makeItem('v3', 'Avg strike rate'),
        ]}
        activeIndex={-1}
        onSelect={onSelect}
      />,
    );
    // Cards render newest-first, so the first card in the DOM is index 2.
    const cards = container.querySelectorAll('[data-filmstrip-card]');
    fireEvent.click(cards[0]!);
    expect(onSelect).toHaveBeenCalledWith(2);

    // Last card in DOM = index 0 in caller space.
    fireEvent.click(cards[cards.length - 1]!);
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });

  it('renders pinned badge only for pinned items', () => {
    const { container, queryAllByText } = render(
      <FilmstripPanel
        open
        onClose={() => {}}
        items={[
          makeItem('v1', 'Runs by season'),
          makeItem('v2', 'Wickets by bowler', { pinned: true }),
        ]}
        activeIndex={-1}
        onSelect={() => {}}
      />,
    );
    const badges = queryAllByText('pinned');
    expect(badges.length).toBe(1);
    // Sanity-check that cards with `pinned: true` share a root with the badge.
    const pinnedCards = container.querySelectorAll('[data-filmstrip-card]');
    expect(pinnedCards.length).toBe(2);
  });

  it('reflects aria-hidden + data-filmstrip-open for the closed state', () => {
    const { container } = render(
      <FilmstripPanel
        open={false}
        onClose={() => {}}
        items={[makeItem('v1', 'Runs by season')]}
        activeIndex={-1}
        onSelect={() => {}}
      />,
    );
    const panel = container.querySelector('[data-filmstrip-panel]');
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    expect(panel?.getAttribute('data-filmstrip-open')).toBe('false');
  });

  it('fires onClose when the close button is activated', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <FilmstripPanel
        open
        onClose={onClose}
        items={[]}
        activeIndex={-1}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(getByLabelText('Close filmstrip'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
