'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { LightboardLoader } from '../brand';
import { AddDataSourceForm } from './add-data-source-form';
import { DataSourceList, type DataSourceRecord } from './data-source-list';
import { SchemaBrowser } from './schema-browser';

type View = 'list' | 'add' | 'schema';

/** Client-side Data Sources management page with API persistence. */
export function DataSourcesPageClient() {
  const t = useTranslations('dataSources');
  const [view, setView] = useState<View>('list');
  const [sources, setSources] = useState<DataSourceRecord[]>([]);
  const [browsingSourceId, setBrowsingSourceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // ID of the source whose DELETE request is currently in flight — the list
  // reads this to render an in-button loader on the matching confirm action.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch data sources from API on mount
  useEffect(() => {
    fetchSources();
  }, []);

  async function fetchSources() {
    setLoading(true);
    try {
      const res = await fetch('/api/data-sources');
      if (res.ok) {
        const data = await res.json();
        setSources(
          data.dataSources.map((ds: Record<string, unknown>) => ({
            id: ds.id,
            name: ds.name,
            type: ds.type,
            status: 'unknown' as const,
            createdAt: ds.createdAt,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = useCallback(() => setView('add'), []);

  const handleSave = useCallback(
    async (data: { name: string; type: string; connection: Record<string, string> }) => {
      const res = await fetch('/api/data-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const result = await res.json();
        const ds = result.dataSource;
        // Optimistic update + ensure persistence
        setSources((prev) => [
          ...prev,
          {
            id: ds.id,
            name: ds.name,
            type: ds.type,
            status: 'unknown' as const,
            createdAt: ds.createdAt,
          },
        ]);
        setView('list');
      }
    },
    [],
  );

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/data-sources/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSources((prev) => prev.filter((s) => s.id !== id));
      } else {
        // Refetch to surface the authoritative list.
        await fetchSources();
      }
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleEdit = useCallback((_id: string) => {
    // TODO: Open edit form with existing data
    setView('add');
  }, []);

  const [schemaTables, setSchemaTables] = useState<{ name: string; schema: string; columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[] }[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const handleBrowseSchema = useCallback(async (id: string) => {
    setBrowsingSourceId(id);
    setSchemaTables([]);
    setSchemaLoading(true);
    setView('schema');

    try {
      const res = await fetch(`/api/data-sources/${id}/schema`);
      if (res.ok) {
        const data = await res.json();
        setSchemaTables(data.tables ?? []);
      }
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  const handleTestConnection = useCallback(
    async (_data: Record<string, string>): Promise<{ success: boolean; message: string }> => {
      // TODO: Call connector's healthCheck via API
      return { success: true, message: 'Connection successful' };
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <LightboardLoader size={48} />
        <p className="text-sm text-muted-foreground">{t('loadingSources')}</p>
      </div>
    );
  }

  if (view === 'add') {
    return (
      <AddDataSourceForm
        onSave={handleSave}
        onCancel={() => setView('list')}
        onTestConnection={handleTestConnection}
      />
    );
  }

  if (view === 'schema' && browsingSourceId) {
    const source = sources.find((s) => s.id === browsingSourceId);
    return (
      <SchemaBrowser
        tables={schemaTables}
        loading={schemaLoading}
        onClose={() => { setView('list'); setBrowsingSourceId(null); }}
        sourceName={source?.name ?? ''}
      />
    );
  }

  return (
    <DataSourceList
      sources={sources}
      onAdd={handleAdd}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onBrowseSchema={handleBrowseSchema}
      deletingId={deletingId}
    />
  );
}
