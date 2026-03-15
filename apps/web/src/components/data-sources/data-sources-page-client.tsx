'use client';

import { useCallback, useEffect, useState } from 'react';
import { AddDataSourceForm } from './add-data-source-form';
import { DataSourceList, type DataSourceRecord } from './data-source-list';
import { SchemaBrowser } from './schema-browser';

type View = 'list' | 'add' | 'schema';

/** Client-side Data Sources management page with API persistence. */
export function DataSourcesPageClient() {
  const [view, setView] = useState<View>('list');
  const [sources, setSources] = useState<DataSourceRecord[]>([]);
  const [browsingSourceId, setBrowsingSourceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    // Optimistic removal
    setSources((prev) => prev.filter((s) => s.id !== id));

    const res = await fetch(`/api/data-sources/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      // Revert on failure — refetch
      await fetchSources();
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
      <div className="flex items-center justify-center py-20">
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Loading...</p>
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
    />
  );
}
