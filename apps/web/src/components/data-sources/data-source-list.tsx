'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
}

/** List of configured data sources with health status indicators. */
export function DataSourceList({ sources, onAdd, onEdit, onDelete, onBrowseSchema }: DataSourceListProps) {
  const t = useTranslations('dataSources');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {t('title')}
        </h2>
        <button
          onClick={onAdd}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-primary-foreground)' }}
        >
          {t('addNew')}
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {t('emptyState')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between rounded-lg p-4"
              style={{
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-card)',
              }}
            >
              <div className="flex items-center gap-3">
                {/* Health status dot */}
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      source.status === 'healthy' ? '#22c55e' :
                      source.status === 'unhealthy' ? '#ef4444' : '#6b7280',
                  }}
                />
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--color-foreground)' }}>
                    {source.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                    {source.type}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onBrowseSchema(source.id)}
                  className="rounded px-3 py-1 text-xs"
                  style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
                >
                  {t('browseSchema')}
                </button>
                <button
                  onClick={() => onEdit(source.id)}
                  className="rounded px-3 py-1 text-xs"
                  style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
                >
                  {t('edit')}
                </button>
                {deleteConfirm === source.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => { onDelete(source.id); setDeleteConfirm(null); }}
                      className="rounded px-3 py-1 text-xs"
                      style={{ backgroundColor: 'var(--color-destructive)', color: 'var(--color-destructive-foreground)' }}
                    >
                      {t('confirmDelete')}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="rounded px-3 py-1 text-xs"
                      style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(source.id)}
                    className="rounded px-3 py-1 text-xs"
                    style={{ color: 'var(--color-destructive)' }}
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
