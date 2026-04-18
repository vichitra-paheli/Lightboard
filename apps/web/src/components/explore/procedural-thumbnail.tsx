'use client';

import type { ViewSpec } from '@lightboard/viz-core';
import type { HtmlView } from '@/components/view-renderer';

/**
 * The five chart kinds we render procedural thumbnails for. "bar" is the
 * fallback whenever detection fails — it's the most common shape and reads
 * well at small sizes.
 */
export type ThumbnailKind = 'bar' | 'scatter' | 'hist' | 'line';

/**
 * Props for {@link ProceduralThumbnail}.
 */
interface ProceduralThumbnailProps {
  /** The view to derive a thumbnail from. */
  view: HtmlView | ViewSpec;
  /** Optional explicit kind override — useful for snapshot tests. */
  kind?: ThumbnailKind;
  /** Render width in px. Defaults to 100% of the parent container. */
  width?: number;
  /** Render height in px. Defaults to 96 (matches the handoff). */
  height?: number;
}

/**
 * Stable 32-bit hash from a string. Deterministic across renders so a view
 * with a given title always gets the same scatter-point layout / bar values.
 * Not cryptographic — just enough to seed a pseudo-random sequence.
 */
function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Mulberry32 PRNG — short, fast, deterministic, no allocations. Good enough
 * for laying out thumbnail shapes deterministically from a hash seed.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function prng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produce a stable seed string from a view. Prefers `title` (often unique
 * per turn), falls back to the first chunk of `sql` or `html` so even
 * untitled views get a deterministic thumbnail.
 */
function seedFromView(view: HtmlView | ViewSpec): string {
  if ('html' in view) {
    return view.title ?? view.sql?.slice(0, 128) ?? view.html.slice(0, 128);
  }
  return view.title ?? JSON.stringify(view.query).slice(0, 128);
}

/**
 * Detect chart kind from the view's HTML or legacy ViewSpec. For HtmlView we
 * grep the embedded Chart.js `type: '...'` declaration; for ViewSpec we map
 * the panel plugin id (`'bar-chart'`, `'time-series-line'`, …). Falls back to
 * `'bar'` when nothing matches — bar reads well at small sizes and is the
 * most common chart kind the agent emits.
 */
export function detectKind(view: HtmlView | ViewSpec): ThumbnailKind {
  if ('html' in view) {
    const html = view.html ?? '';
    // Chart.js `type: 'bar' | 'line' | 'scatter' | 'bubble' | 'doughnut' | ...`
    // appears either inline in `new Chart(ctx, { type: 'bar', ... })` or in a
    // config object literal. A conservative literal-string match is good
    // enough — the agent prompt uses canonical Chart.js kind names.
    if (/type\s*:\s*['"]scatter['"]/i.test(html) || /type\s*:\s*['"]bubble['"]/i.test(html)) {
      return 'scatter';
    }
    if (/type\s*:\s*['"]line['"]/i.test(html)) {
      return 'line';
    }
    if (/histogram/i.test(html)) {
      return 'hist';
    }
    if (/type\s*:\s*['"]bar['"]/i.test(html)) {
      return 'bar';
    }
    return 'bar';
  }
  const panelType = view.chart?.type ?? '';
  if (panelType.includes('scatter')) return 'scatter';
  if (panelType.includes('line') || panelType.includes('time-series')) return 'line';
  if (panelType.includes('hist')) return 'hist';
  return 'bar';
}

/**
 * Renders a tiny mini-chart preview of a view, driven by a seeded PRNG so the
 * same view always produces the same thumbnail. Ported from the editorial
 * handoff's `Filmstrip.jsx#Thumbnail`.
 *
 * Four kinds are supported:
 * - `bar`: horizontal bars descending in length.
 * - `scatter`: 24 seeded dots inside the frame.
 * - `hist`: vertical histogram bars.
 * - `line`: a seeded line chart with soft fill.
 *
 * The component never reads from the iframe — it purely represents the
 * shape of the chart, not the underlying data. Upgrading to real
 * data-derived thumbnails is tracked as a follow-up.
 */
export function ProceduralThumbnail({
  view,
  kind,
  width,
  height = 96,
}: ProceduralThumbnailProps) {
  const resolvedKind: ThumbnailKind = kind ?? detectKind(view);
  const seedStr = seedFromView(view);
  const seed = hashString(seedStr);

  const frameStyle: React.CSSProperties = {
    height,
    width: width ?? '100%',
    background: 'var(--bg-3, #101013)',
    border: '1px solid var(--line-3, #1E1E22)',
    borderRadius: 6,
    boxSizing: 'border-box',
  };

  if (resolvedKind === 'bar') {
    // Bar widths decrease monotonically from ~0.7 to ~0.22. Vary the first
    // value slightly by seed so thumbnails don't all look identical.
    const prng = mulberry32(seed);
    const firstOffset = prng() * 0.15; // 0..0.15
    const widths = [0.7, 0.55, 0.48, 0.42, 0.38, 0.32, 0.28, 0.25, 0.22].map(
      (b, i) => (i === 0 ? b + firstOffset : b),
    );
    return (
      <div
        data-thumbnail-kind="bar"
        style={{
          ...frameStyle,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          justifyContent: 'center',
        }}
      >
        {widths.map((b, i) => (
          <div
            key={i}
            style={{
              height: 4,
              width: `${Math.min(100, b * 100)}%`,
              background: 'var(--ink-5, #3A3A42)',
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    );
  }

  if (resolvedKind === 'scatter') {
    const prng = mulberry32(seed);
    const pts = Array.from({ length: 24 }, () => ({
      x: prng() * 90 + 5,
      y: prng() * 70 + 10,
    }));
    return (
      <div
        data-thumbnail-kind="scatter"
        style={{ ...frameStyle, position: 'relative' }}
      >
        {pts.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: 3,
              height: 3,
              borderRadius: 99,
              background: '#8AB4B8',
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    );
  }

  if (resolvedKind === 'hist') {
    // Bell-curve-ish histogram with seeded jitter per bin.
    const prng = mulberry32(seed);
    const base = [0.2, 0.35, 0.55, 0.8, 0.6, 0.4, 0.28, 0.18, 0.1];
    const heights = base.map((b) => Math.max(0.05, Math.min(1, b + (prng() - 0.5) * 0.12)));
    return (
      <div
        data-thumbnail-kind="hist"
        style={{
          ...frameStyle,
          padding: 10,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 3,
        }}
      >
        {heights.map((b, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${b * 100}%`,
              background: '#B08CA8',
              opacity: 0.75,
              borderRadius: '1px 1px 0 0',
            }}
          />
        ))}
      </div>
    );
  }

  // line — seeded polyline with soft fill.
  const prng = mulberry32(seed);
  const points = 12;
  const vbWidth = 100;
  const vbHeight = 40;
  const ys: number[] = [];
  let y = 20 + (prng() - 0.5) * 10;
  for (let i = 0; i < points; i++) {
    y += (prng() - 0.5) * 8;
    // Clamp inside the viewbox with a small margin.
    y = Math.max(6, Math.min(vbHeight - 6, y));
    ys.push(y);
  }
  const step = vbWidth / (points - 1);
  const linePath = ys
    .map((yy, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${yy.toFixed(2)}`)
    .join(' ');
  const fillPath = `${linePath} L${vbWidth},${vbHeight} L0,${vbHeight} Z`;
  return (
    <div data-thumbnail-kind="line" style={frameStyle}>
      <svg
        viewBox={`0 0 ${vbWidth} ${vbHeight}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        <path d={fillPath} fill="#8AB4B8" opacity={0.18} />
        <path
          d={linePath}
          fill="none"
          stroke="#8AB4B8"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/** Exposed for unit tests so kind detection + hashing can be exercised directly. */
export const __testing = { detectKind, hashString, mulberry32, seedFromView };
