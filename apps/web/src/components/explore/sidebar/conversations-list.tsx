'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

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
 * Grouped, time-bucketed conversations rendered in the Explore sidebar.
 *
 * Replaces the historical hardcoded fixture — the list is now driven by
 * `useQuery` against `/api/conversations?sourceId=<id>`. Switching the
 * picker invalidates the query key and refetches automatically. Bucketing
 * is computed client-side from `lastMessageAt` so the API stays a flat
 * sorted list.
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
                />
              ))}
            </div>
          </div>
        );
      })}
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
 * Single conversation row. Active state uses a 2px warm-accent left bar and
 * the `--bg-6` fill; passive rows fade between ink-3 (idle) and ink-2 (hover).
 */
function ConvoItemButton({
  item,
  active,
  onSelect,
}: {
  item: ConversationRow;
  active: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <button
      type="button"
      title={item.title}
      onClick={() => onSelect?.(item.id)}
      className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors"
      style={{
        color: active ? 'var(--ink-1)' : 'var(--ink-3)',
        background: active ? 'var(--bg-6)' : 'transparent',
        fontWeight: active ? 500 : 400,
        borderLeft: active
          ? '2px solid var(--accent-warm)'
          : '2px solid transparent',
        paddingLeft: active ? 8 : 10,
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
