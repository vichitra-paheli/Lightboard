'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { getKindMeta } from './kind-meta';
import type { DataSourceRow } from './use-data-sources';

/** Props for {@link ConnectionTab}. */
export interface ConnectionTabProps {
  ds: DataSourceRow;
}

/** Read-only connection summary. Matches handoff `ConnectionTab`. */
export function ConnectionTab({ ds }: ConnectionTabProps) {
  const t = useTranslations('settings.dataSources.detail.connection');
  const config = (ds.config as Record<string, unknown> | null) ?? {};
  const host = (config.host as string | undefined) ?? '—';
  const port = config.port as string | number | undefined;
  const database = (config.database as string | undefined) ?? '—';
  const tableCount =
    (config.cachedSchema as { tables?: unknown[] } | undefined)?.tables?.length ??
    (config.schemaContext as { tables?: unknown[] } | undefined)?.tables?.length ??
    0;
  return (
    <div className="flex flex-col gap-5">
      <Card title={t('connection')}>
        <Row label={t('type')} value={getKindMeta(ds.type).label} />
        <Row label={t('host')} value={host} mono />
        {port !== undefined && port !== '' && <Row label={t('port')} value={String(port)} mono />}
        <Row label={t('database')} value={database} mono />
        <Row label={t('password')} value="••••••••••••" mono />
      </Card>
      <Card title={t('health')}>
        <Row
          label={t('status')}
          value={
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--kind-narrate)]" />
              {t('connected')}
            </span>
          }
        />
        <Row label={t('tablesVisible')} value={String(tableCount)} mono />
      </Card>
    </div>
  );
}

/** Card with a mono header and tightly-spaced rows. */
function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--line-1)] bg-[var(--bg-2)]">
      <div
        className="border-b border-[var(--line-1)] px-5 py-3.5 text-[13.5px] font-medium text-[var(--ink-1)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Single label/value row. */
function Row({ label, value, mono }: { label: ReactNode; value: ReactNode; mono?: boolean }) {
  return (
    <div
      className="grid grid-cols-[200px_1fr] items-center gap-5 border-b border-[var(--line-2)] px-5 py-2.5 last:border-b-0"
    >
      <div
        className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </div>
      <div
        className={mono ? 'text-[12.5px] text-[var(--ink-1)]' : 'text-[13px] text-[var(--ink-1)]'}
        style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)' }}
      >
        {value}
      </div>
    </div>
  );
}
