'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { LightboardLoader } from '@/components/brand';
import { SchemaBrowser } from '@/components/data-sources/schema-browser';

import { PrimaryButton, SecondaryButton, SettingsPage } from '../primitives';
import { ConnectionTab } from './connection-tab';
import { DetailTabs, type DetailTabId } from './detail-tabs';
import { KindGlyph } from './kind-glyph';
import { getKindMeta } from './kind-meta';
import { deriveSchemaDocStatus } from './schema-doc-chip';
import { SchemaDocEmpty } from './schema-doc-empty';
import type { DataSourceRow } from './use-data-sources';

/** Props for {@link DataSourceDetail}. */
export interface DataSourceDetailProps {
  /** Data source ID from the dynamic route segment. */
  id: string;
}

/** Schema payload returned by `/api/data-sources/[id]/schema`. */
interface SchemaPayload {
  tables: {
    name: string;
    schema: string;
    columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[];
  }[];
}

/**
 * Server-backed detail page. Fetches the source out of the list endpoint
 * (there's no single-source GET yet — follow-up) and its schema lazily
 * when the Schema Doc tab is active.
 */
export function DataSourceDetail({ id }: DataSourceDetailProps) {
  const t = useTranslations('settings.dataSources.detail');
  const [source, setSource] = useState<DataSourceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTabId>('schema');
  const [schema, setSchema] = useState<SchemaPayload | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/data-sources');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { dataSources: DataSourceRow[] };
        if (cancelled) return;
        setSource(data.dataSources.find((d) => d.id === id) ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Lazy-load schema only when the user opens the Schema tab and the source
  // actually has documentation / context available.
  useEffect(() => {
    if (tab !== 'schema' || !source || schema) return;
    const { status } = deriveSchemaDocStatus(source.config);
    if (status === 'empty') return;
    setSchemaLoading(true);
    fetch(`/api/data-sources/${id}/schema`)
      .then((r) => (r.ok ? (r.json() as Promise<SchemaPayload>) : null))
      .then((data) => {
        if (data) setSchema(data);
      })
      .catch(() => {
        /* schema fetch is best-effort */
      })
      .finally(() => setSchemaLoading(false));
  }, [id, tab, source, schema]);

  if (loading || !source) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <LightboardLoader size={48} />
        {!loading && !source && (
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
  const schemaStatus = deriveSchemaDocStatus(source.config);

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
        {tab === 'schema' && (
          <>
            {schemaStatus.status === 'empty' ? (
              <SchemaDocEmpty sourceName={source.name} tableCount={0} />
            ) : schemaLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <LightboardLoader size={32} />
                <p className="text-sm text-[var(--ink-3)]">{t('schemaLoading')}</p>
              </div>
            ) : (
              <SchemaBrowser
                tables={schema?.tables ?? []}
                sourceName={source.name}
                loading={false}
                onClose={() => { /* detail keeps the tab */ }}
              />
            )}
          </>
        )}
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
