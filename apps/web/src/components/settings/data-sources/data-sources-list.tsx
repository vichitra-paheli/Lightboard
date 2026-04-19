'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { LightboardLoader } from '@/components/brand';
import { cn } from '@/lib/utils';

import { SecondaryButton } from '../primitives';
import { KindGlyph } from './kind-glyph';
import { getKindMeta } from './kind-meta';
import { deriveSchemaDocStatus, SchemaDocChip } from './schema-doc-chip';
import type { DataSourceRow } from './use-data-sources';

/** Props for {@link DataSourcesList}. */
export interface DataSourcesListProps {
  sources: DataSourceRow[];
  deletingId: string | null;
  onDelete: (id: string) => void;
}

/** Table-style list of configured data sources. */
export function DataSourcesList({ sources, deletingId, onDelete }: DataSourcesListProps) {
  const t = useTranslations('settings.dataSources.list');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--line-1)] bg-[var(--bg-2)]">
      <div
        className="grid items-center gap-3.5 border-b border-[var(--line-1)] bg-[var(--bg-3)] px-4 py-2.5"
        style={{
          gridTemplateColumns: 'minmax(0,1fr) 160px 110px 150px 110px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        <div>{t('source')}</div>
        <div>{t('schemaDoc')}</div>
        <div>{t('tables')}</div>
        <div>{t('status')}</div>
        <div className="text-right">{t('actions')}</div>
      </div>
      {sources.map((ds, i) => (
        <Row
          key={ds.id}
          ds={ds}
          last={i === sources.length - 1}
          confirmOpen={confirmId === ds.id}
          onConfirm={() => setConfirmId(ds.id)}
          onCancelConfirm={() => setConfirmId(null)}
          onDelete={() => {
            setConfirmId(null);
            onDelete(ds.id);
          }}
          deleting={deletingId === ds.id}
        />
      ))}
    </div>
  );
}

/** Single row rendered as a Link to the detail page. */
function Row({
  ds,
  last,
  confirmOpen,
  onConfirm,
  onCancelConfirm,
  onDelete,
  deleting,
}: {
  ds: DataSourceRow;
  last: boolean;
  confirmOpen: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const t = useTranslations('settings.dataSources.list');
  const meta = getKindMeta(ds.type);
  const schema = deriveSchemaDocStatus(ds.config);
  const tableCount =
    (ds.config?.cachedSchema as { tables?: unknown[] } | undefined)?.tables?.length ??
    (ds.config?.schemaContext as { tables?: unknown[] } | undefined)?.tables?.length ??
    0;
  const host = (ds.config?.host as string | undefined) ?? '';
  const port = ds.config?.port as string | number | undefined;
  const hostLine = host ? `${host}${port ? `:${port}` : ''}` : meta.label;

  return (
    <div
      className={cn(
        'grid items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[var(--bg-4)]',
        !last && 'border-b border-[var(--line-2)]',
      )}
      style={{ gridTemplateColumns: 'minmax(0,1fr) 160px 110px 150px 110px' }}
    >
      <Link href={`/settings/data-sources/${ds.id}`} className="flex min-w-0 items-center gap-3 focus-visible:outline-none">
        <KindGlyph kind={ds.type} />
        <div className="min-w-0">
          <div
            className="truncate text-[13.5px] font-medium text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {ds.name}
          </div>
          <div
            className="mt-0.5 truncate text-[10.5px] text-[var(--ink-5)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {hostLine}
          </div>
        </div>
      </Link>
      <SchemaDocChip status={schema.status} coverage={schema.coverage} />
      <div
        className="text-[11.5px] tracking-[0.02em] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {tableCount}
        <span className="text-[var(--ink-6)]"> {t('tablesUnit')}</span>
      </div>
      <div>
        <span
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--kind-narrate)', boxShadow: '0 0 0 2px rgba(125,180,105,0.18)' }}
          />
          {t('connected')}
        </span>
      </div>
      <div className="flex items-center justify-end gap-1">
        {confirmOpen ? (
          <>
            <SecondaryButton size="sm" danger onClick={onDelete} disabled={deleting}>
              {deleting && <LightboardLoader size={12} ariaLabel="" />}
              <span>{t('confirmDelete')}</span>
            </SecondaryButton>
            <SecondaryButton size="sm" onClick={onCancelConfirm} disabled={deleting}>
              {t('cancel')}
            </SecondaryButton>
          </>
        ) : (
          <SecondaryButton size="sm" danger onClick={onConfirm}>
            {t('delete')}
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}
