'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { LightboardLoader } from '../brand';

/** A data source record. */
export interface DataSourceRecord {
  id: string;
  name: string;
  type: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  createdAt: string;
}

/** Props for DataSourceList. */
interface DataSourceListProps {
  sources: DataSourceRecord[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onBrowseSchema: (id: string) => void;
  /**
   * ID of the source whose DELETE request is currently in flight. The
   * matching confirm button renders a 12px loader and disables while the
   * request is pending; the parent clears this when the request settles.
   */
  deletingId?: string | null;
}

/**
 * Map a health status to a token-backed CSS color string.
 * healthy -> --kind-narrate (warm green), unhealthy -> --color-destructive,
 * unknown -> --ink-5 (muted).
 */
function statusDotColor(status: DataSourceRecord['status']): string {
  switch (status) {
    case 'healthy':
      return 'var(--kind-narrate)';
    case 'unhealthy':
      return 'var(--color-destructive)';
    default:
      return 'var(--ink-5)';
  }
}

/** List of configured data sources with health status indicators. */
export function DataSourceList({ sources, onAdd, onEdit, onDelete, onBrowseSchema, deletingId }: DataSourceListProps) {
  const t = useTranslations('dataSources');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
        <button
          onClick={onAdd}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t('addNew')}
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                {/* Health status dot — semantic tokens, not raw hex. */}
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: statusDotColor(source.status) }}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{source.name}</p>
                  <p className="text-xs text-muted-foreground">{source.type}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onBrowseSchema(source.id)}
                  className="rounded border border-border px-3 py-1 text-xs text-muted-foreground"
                >
                  {t('browseSchema')}
                </button>
                <button
                  onClick={() => onEdit(source.id)}
                  className="rounded border border-border px-3 py-1 text-xs text-muted-foreground"
                >
                  {t('edit')}
                </button>
                {deleteConfirm === source.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => { onDelete(source.id); }}
                      disabled={deletingId === source.id}
                      className="inline-flex items-center gap-1.5 rounded bg-destructive px-3 py-1 text-xs text-destructive-foreground disabled:opacity-80"
                    >
                      {deletingId === source.id && (
                        <LightboardLoader size={12} ariaLabel="" />
                      )}
                      <span>{t('confirmDelete')}</span>
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      disabled={deletingId === source.id}
                      className="rounded border border-border px-3 py-1 text-xs text-muted-foreground disabled:opacity-60"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(source.id)}
                    className="rounded px-3 py-1 text-xs text-destructive"
                  >
                    {t('delete')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
