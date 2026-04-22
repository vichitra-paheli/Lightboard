'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Label } from './label';

/** One conversation row returned by `GET /api/conversations`. */
interface ConversationRow {
  id: string;
  title: string;
  dataSourceId: string | null;
  lastMessageAt: string;
  createdAt: string;
}

/**
 * Time bucket the sidebar groups by. The buckets stay client-side so the API
 * doesn't have to know the user's locale or "today" boundary.
 */
type GroupKey = 'today' | 'yesterday' | 'thisWeek' | 'older';

/** Props for {@link ConversationsList}. */
interface ConversationsListProps {
  /**
   * Currently selected data source id. When non-null, the API filters the
   * list to that source. When null, the list shows every conversation in
   * the org (the all-conversations surface — currently never reached
   * because the picker is required, but kept as a clean fallback).
   */
  sourceId: string | null;
  /** Id of the currently-active conversation, if any. */
  activeId?: string | null;
  /** Called with the id of a clicked conversation. */
  onSelect?: (id: string) => void;
}

/**
 * Geometry for the sliding indicator bar — `top` is the active item's
 * `offsetTop` relative to the items wrapper, `height` is its `offsetHeight`.
 */
interface IndicatorRect {
  top: number;
  height: number;
}

/**
 * Grouped, time-bucketed conversations rendered in the Explore sidebar.
 *
 * Replaces the historical hardcoded fixture — the list is now driven by
 * `useQuery` against `/api/conversations?sourceId=<id>`. Switching the
 * picker invalidates the query key and refetches automatically. Bucketing
 * is computed client-side from `lastMessageAt` so the API stays a flat
 * sorted list.
 *
 * Active state is rendered as a single sliding 2px warm-accent bar that
 * glides between rows on `activeId` change (220ms iOS-style spring-out
 * curve). Individual rows no longer carry a static left border so the bar
 * is the sole visual source of truth — this keeps the active indicator
 * consistent across group boundaries (Today / Yesterday / etc.).
 */
export function ConversationsList({
  sourceId,
  activeId,
  onSelect,
}: ConversationsListProps) {
  const t = useTranslations('explore');

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', sourceId],
    queryFn: async (): Promise<ConversationRow[]> => {
      const params = sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : '';
      const res = await fetch(`/api/conversations${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { conversations?: ConversationRow[] };
      return body.conversations ?? [];
    },
    staleTime: 30_000,
  });

  const groups = useMemo(() => bucketize(data ?? []), [data]);
  const groupOrder: GroupKey[] = ['today', 'yesterday', 'thisWeek', 'older'];
  const labelMap: Record<GroupKey, string> = {
    today: t('conversationsToday'),
    yesterday: t('conversationsYesterday'),
    thisWeek: t('conversationsThisWeek'),
    older: t('conversationsOlder'),
  };

  const isEmpty = !isLoading && (data?.length ?? 0) === 0;

  // ---------- sliding indicator ----------
  // Wrapper that anchors the absolutely-positioned indicator. The wrapper
  // contains every group + its items, so a single indicator can glide between
  // rows even when they live under different group labels.
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Refs keyed by conversation id — populated by each row's ref callback.
  // A Map (not an object) so id deletions don't leave stale keys around.
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<IndicatorRect | null>(null);
  // First-paint snap: the very first time `activeId` resolves to a real row,
  // we want the bar to appear *at* its position rather than slide in from
  // translateY(0). After that, every measurement should animate.
  const hasAnimatedRef = useRef(false);
  const [snapNoTransition, setSnapNoTransition] = useState(false);

  // Recompute indicator geometry whenever the active id changes or the
  // underlying list reflows. useLayoutEffect runs before paint so the bar
  // is positioned correctly on the same frame the new active row mounts —
  // no flash of unpositioned indicator.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    if (!activeId) {
      // No active conversation — drop the indicator. Hidden state is keyed
      // off `indicator === null` in the render branch below.
      setIndicator(null);
      hasAnimatedRef.current = false;
      return;
    }

    const node = itemRefs.current.get(activeId);
    if (!node) {
      // Active row isn't in the current list (e.g. user switched data sources
      // and the conversation isn't visible under the new filter). Hide rather
      // than freeze on a stale position.
      setIndicator(null);
      hasAnimatedRef.current = false;
      return;
    }

    // offsetTop is relative to the nearest positioned ancestor — we make
    // `wrapper` `relative` below, so this is the right coordinate space.
    const next: IndicatorRect = {
      top: node.offsetTop,
      height: node.offsetHeight,
    };

    if (!hasAnimatedRef.current) {
      // First positioned frame for this mount: snap without animating, then
      // re-enable the transition on the next paint so subsequent activeId
      // changes glide. Two requestAnimationFrames so the no-transition
      // style commits to the DOM before we flip the flag back.
      setSnapNoTransition(true);
      setIndicator(next);
      hasAnimatedRef.current = true;
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setSnapNoTransition(false));
      });
      return () => cancelAnimationFrame(id);
    }

    setIndicator(next);
    return undefined;
    // `data` is included so groups reflowing (new chat lands, source switch
    // adds/removes rows) re-runs the measurement — the row positions inside
    // the wrapper change even when activeId itself didn't.
  }, [activeId, data]);

  // Re-measure on container resize too — covers cases the deps array can't
  // catch, like layout reflow from a sibling sidebar block changing height.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => {
      if (!activeId) return;
      const node = itemRefs.current.get(activeId);
      if (!node) return;
      setIndicator({ top: node.offsetTop, height: node.offsetHeight });
    });
    obs.observe(wrapper);
    return () => obs.disconnect();
  }, [activeId]);

  return (
    <div className="flex flex-col gap-3.5">
      <Label>{t('conversationsHeading')}</Label>
      {isEmpty && (
        <div
          className="px-2.5 text-[12px]"
          style={{ color: 'var(--ink-5)' }}
        >
          {t('conversationsEmpty')}
        </div>
      )}
      <div ref={wrapperRef} className="relative flex flex-col gap-3.5">
        {/*
         * Single sliding indicator. Hidden via opacity 0 when no active
         * conversation so a fresh chat doesn't show a stale marker. The
         * `transition` shorthand intentionally omits opacity — fade-out on
         * activeId clear should be instant, not a slow trail.
         */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 rounded-full"
          style={{
            top: 0,
            width: 2,
            height: indicator?.height ?? 0,
            background: 'var(--accent-warm)',
            opacity: indicator ? 1 : 0,
            transform: `translateY(${indicator?.top ?? 0}px)`,
            transition: snapNoTransition
              ? 'none'
              : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1), height 220ms cubic-bezier(0.32, 0.72, 0, 1)',
            willChange: 'transform',
          }}
        />
        {groupOrder.map((key) => {
          const items = groups[key];
          if (!items || items.length === 0) return null;
          return (
            <div key={key}>
              <div
                className="lb-mono-tag uppercase"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  color: 'var(--ink-6)',
                  padding: '0 4px 4px',
                }}
              >
                {labelMap[key]}
              </div>
              <div className="flex flex-col gap-px">
                {items.map((row) => (
                  <ConvoItemButton
                    key={row.id}
                    item={row}
                    active={row.id === activeId}
                    onSelect={onSelect}
                    refCallback={(node) => {
                      if (node) {
                        itemRefs.current.set(row.id, node);
                      } else {
                        itemRefs.current.delete(row.id);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Bucket conversations into Today / Yesterday / This week / Older using a
 * locally-computed "now" so the user's clock — not the server's — defines
 * the boundary. Inputs are assumed to be sorted newest-first by the API; the
 * bucket order preserves that relative order within each bucket.
 */
function bucketize(rows: ConversationRow[]): Record<GroupKey, ConversationRow[]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 7);

  const out: Record<GroupKey, ConversationRow[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  for (const row of rows) {
    const ts = new Date(row.lastMessageAt);
    if (ts >= startOfToday) {
      out.today.push(row);
    } else if (ts >= startOfYesterday) {
      out.yesterday.push(row);
    } else if (ts >= startOfWeek) {
      out.thisWeek.push(row);
    } else {
      out.older.push(row);
    }
  }
  return out;
}

/**
 * Single conversation row. Active state uses the `--bg-6` fill and the
 * brighter ink ramp; the vertical accent bar is rendered separately by the
 * parent's sliding indicator so this row never paints its own border (which
 * would compete with the sliding bar).
 */
function ConvoItemButton({
  item,
  active,
  onSelect,
  refCallback,
}: {
  item: ConversationRow;
  active: boolean;
  onSelect?: (id: string) => void;
  /** Receives the underlying button node for indicator positioning. */
  refCallback: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={refCallback}
      type="button"
      title={item.title}
      onClick={() => onSelect?.(item.id)}
      className="block w-full truncate rounded-md py-1.5 text-left text-[12.5px] transition-colors"
      style={{
        // Constant 10px left padding so rows don't shift horizontally when
        // the sliding bar arrives — the bar overlays the gutter rather than
        // displacing the text.
        paddingLeft: 10,
        paddingRight: 10,
        color: active ? 'var(--ink-1)' : 'var(--ink-3)',
        background: active ? 'var(--bg-6)' : 'transparent',
        fontWeight: active ? 500 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--ink-2)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--ink-3)';
      }}
    >
      {item.title}
    </button>
  );
}
