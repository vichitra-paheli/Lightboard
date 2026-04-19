'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { LightboardLoader } from '@/components/brand';
import { queryKeys } from '@/lib/query-keys';

import { PrimaryButton, SecondaryButton, SettingsPage } from '../primitives';
import { ConnectionTab } from './connection-tab';
import { DetailTabs, type DetailTabId } from './detail-tabs';
import { KindGlyph } from './kind-glyph';
import { getKindMeta } from './kind-meta';
import { SchemaDocEditor } from './schema-doc-editor';
import type { DataSourceRow } from './use-data-sources';

/** Props for {@link DataSourceDetail}. */
export interface DataSourceDetailProps {
  /** Data source ID from the dynamic route segment. */
  id: string;
}

/** 5 minutes — schema docs rarely change mid-session. */
const METADATA_STALE_TIME = 5 * 60 * 1000;

/**
 * Fetch all data sources (used by the detail page until we have a single-source GET).
 * Unwraps the API envelope so the shape matches the shared `['data-sources']`
 * cache key — see `use-data-sources.ts` for the matching invariant.
 */
async function fetchDataSources(): Promise<DataSourceRow[]> {
  const res = await fetch('/api/data-sources');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { dataSources?: DataSourceRow[] };
  return data.dataSources ?? [];
}

/**
 * Server-backed detail page. Pulls the source from the shared data-sources
 * list cache (same key as the settings list page, so switching between the
 * list and detail views doesn't trigger a refetch inside the 5 min window)
 * and lazy-loads its schema when the Schema tab is active.
 */
export function DataSourceDetail({ id }: DataSourceDetailProps) {
  const t = useTranslations('settings.dataSources.detail');
  const [tab, setTab] = useState<DetailTabId>('schema');

  const sourcesQuery = useQuery({
    queryKey: queryKeys.dataSources(),
    queryFn: fetchDataSources,
    staleTime: METADATA_STALE_TIME,
  });

  const source = useMemo(
    () => sourcesQuery.data?.find((d) => d.id === id) ?? null,
    [sourcesQuery.data, id],
  );

  if (sourcesQuery.isPending || !source) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <LightboardLoader size={48} />
        {!sourcesQuery.isPending && !source && (
          <p className="text-sm text-[var(--ink-3)]">{t('notFound')}</p>
        )}
      </div>
    );
  }

  const meta = getKindMeta(source.type);
  const config = (source.config as Record<string, unknown> | null) ?? {};
  const host = (config.host as string | undefined) ?? '';
  const database = (config.database as string | undefined) ?? '';
  const description = [host, database].filter(Boolean).join(' · ');

  return (
    <SettingsPage
      back={{ label: t('back'), href: '/settings/data-sources' }}
      eyebrow={meta.label}
      title={
        <span className="inline-flex items-center gap-3.5">
          <KindGlyph kind={source.type} />
          <span>{source.name}</span>
        </span>
      }
      description={description}
      actions={
        <div className="flex gap-2">
          <SecondaryButton disabled>{t('editConnection')}</SecondaryButton>
          <PrimaryButton disabled>{t('refreshSchema')}</PrimaryButton>
        </div>
      }
    >
      <DetailTabs tab={tab} setTab={setTab} />
      <div className="mt-6">
        {tab === 'schema' && <SchemaDocEditor source={source} />}
        {tab === 'connection' && <ConnectionTab ds={source} />}
        {tab === 'access' && <AccessPlaceholder />}
      </div>
    </SettingsPage>
  );
}

/** "Coming soon" card for the Access & Roles tab. */
function AccessPlaceholder() {
  const t = useTranslations('settings.dataSources.detail.access');
  return (
    <div className="rounded-[10px] border border-[var(--line-1)] bg-[var(--bg-2)] px-10 py-10 text-center">
      <div
        className="mb-2 text-[16px] text-[var(--ink-1)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {t('title')}
      </div>
      <div
        className="text-[13px] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {t('body')}
      </div>
    </div>
  );
}
