import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  ProceduralThumbnail,
  __testing,
  type ThumbnailKind,
} from '../procedural-thumbnail';
import type { HtmlView } from '@/components/view-renderer';

const { detectKind, hashString, mulberry32 } = __testing;

function makeHtmlView(html: string, title = 'Seed view'): HtmlView {
  return { title, sql: 'SELECT 1', html };
}

describe('hashString / mulberry32', () => {
  it('returns the same hash for identical input', () => {
    expect(hashString('lightboard')).toBe(hashString('lightboard'));
  });

  it('returns different hashes for different input', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });
});

describe('detectKind', () => {
  it.each<[string, ThumbnailKind]>([
    [`new Chart(ctx, { type: 'bar', data: [] })`, 'bar'],
    [`config = { type: "line", options: {} }`, 'line'],
    [`new Chart(c, { type: 'scatter' })`, 'scatter'],
    [`new Chart(c, { type: 'bubble' })`, 'scatter'],
    [`// histogram of strike rate`, 'hist'],
    [`no chart here, just text`, 'bar'],
  ])('detects kind from %j → %s', (html, expected) => {
    expect(detectKind(makeHtmlView(html))).toBe(expected);
  });

  it('falls back to bar for ViewSpec with unknown panel type', () => {
    expect(
      detectKind({
        query: {
          source: 's1',
          table: 't1',
          select: [],
          aggregations: [],
          groupBy: [],
          orderBy: [],
          joins: [],
        },
        chart: { type: 'unknown-plugin', config: {} },
        controls: [],
      }),
    ).toBe('bar');
  });

  it('maps ViewSpec panel types to kinds', () => {
    const base = {
      query: {
          source: 's1',
          table: 't1',
          select: [],
          aggregations: [],
          groupBy: [],
          orderBy: [],
          joins: [],
        },
      controls: [],
    };
    expect(
      detectKind({ ...base, chart: { type: 'time-series-line', config: {} } }),
    ).toBe('line');
    expect(
      detectKind({ ...base, chart: { type: 'scatter-plot', config: {} } }),
    ).toBe('scatter');
    expect(detectKind({ ...base, chart: { type: 'bar-chart', config: {} } })).toBe('bar');
  });
});

describe('<ProceduralThumbnail> structure', () => {
  afterEach(() => {
    cleanup();
  });

  // Snapshot the root markup per kind. Using Testing Library's `asFragment`
  // keeps the serialized tree small and deterministic — the procedural
  // elements inside are driven by a stable seed (the view title) so the
  // snapshot won't flake across runs.
  it.each<ThumbnailKind>(['bar', 'scatter', 'hist', 'line'])(
    'matches the inline snapshot for kind=%s',
    (kind) => {
      const { asFragment } = render(
        <ProceduralThumbnail view={makeHtmlView('', `seed-${kind}`)} kind={kind} />,
      );
      expect(asFragment()).toMatchSnapshot();
    },
  );

  it('tags the outer frame with the resolved kind', () => {
    const { container, rerender } = render(
      <ProceduralThumbnail view={makeHtmlView('', 'seed-a')} kind="bar" />,
    );
    expect(
      container.querySelector('[data-thumbnail-kind="bar"]'),
    ).toBeTruthy();
    rerender(<ProceduralThumbnail view={makeHtmlView('', 'seed-a')} kind="scatter" />);
    expect(
      container.querySelector('[data-thumbnail-kind="scatter"]'),
    ).toBeTruthy();
  });

  it('produces the same markup for the same seed (determinism)', () => {
    const { asFragment, unmount } = render(
      <ProceduralThumbnail view={makeHtmlView('', 'stable-seed')} kind="scatter" />,
    );
    const firstSnapshot = asFragment().firstChild?.cloneNode(true);
    unmount();

    const second = render(
      <ProceduralThumbnail view={makeHtmlView('', 'stable-seed')} kind="scatter" />,
    );
    const secondSnapshot = second.asFragment().firstChild;

    // The outerHTML of both fragments must match exactly — if the PRNG leaked
    // a Math.random() call somewhere the two renders would diverge.
    expect((firstSnapshot as HTMLElement)?.outerHTML).toBe(
      (secondSnapshot as HTMLElement)?.outerHTML,
    );
  });
});
