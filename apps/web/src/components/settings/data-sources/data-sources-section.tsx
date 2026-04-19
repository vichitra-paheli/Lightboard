'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { LightboardLoader } from '@/components/brand';

import { PrimaryButton, SettingsPage } from '../primitives';
import { DataSourceDrawer } from './data-source-drawer';
import { DataSourcesList } from './data-sources-list';
import { useDataSources } from './use-data-sources';

/**
 * Lists every configured data source for the org and surfaces the create
 * drawer. Mirrors the old `data-sources-page-client` lifecycle — optimistic
 * delete, refetch on save — under the new SettingsPage shell.
 */
export function DataSourcesSection() {
  const t = useTranslations('settings.dataSources');
  const { sources, loading, deletingId, deleteError, clearDeleteError, refetch, remove } = useDataSources();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleCreated() {
    setDrawerOpen(false);
    void refetch();
  }

  return (
    <>
      <SettingsPage
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={<PrimaryButton onClick={() => setDrawerOpen(true)}>{t('addDatasource')}</PrimaryButton>}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <LightboardLoader size={48} />
            <p className="text-sm text-[var(--ink-3)]">{t('loading')}</p>
          </div>
        ) : sources.length === 0 ? (
          <div className="rounded-[10px] border border-[var(--line-1)] bg-[var(--bg-2)] px-6 py-10 text-center">
            <p className="text-[13.5px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-body)' }}>
              {t('empty')}
            </p>
            <div className="mt-5 inline-block">
              <PrimaryButton size="sm" onClick={() => setDrawerOpen(true)}>
                {t('addDatasource')}
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            {deleteError && (
              <div
                role="alert"
                className="mb-4 flex items-start justify-between gap-4 rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-[12.5px] text-[var(--danger-ink)]"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <span>{t('deleteFailed', { message: deleteError.message })}</span>
                <button
                  type="button"
                  onClick={clearDeleteError}
                  className="text-[11px] uppercase tracking-[0.1em] text-[var(--danger-ink)] opacity-70 hover:opacity-100"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t('dismiss')}
                </button>
              </div>
            )}
            <DataSourcesList sources={sources} deletingId={deletingId} onDelete={remove} />
          </>
        )}
      </SettingsPage>
      {drawerOpen && (
        <DataSourceDrawer onClose={() => setDrawerOpen(false)} onCreated={handleCreated} />
      )}
    </>
  );
}
