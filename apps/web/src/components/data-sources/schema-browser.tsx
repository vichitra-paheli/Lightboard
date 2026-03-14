'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Column info for schema browser. */
interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
}

/** Table info for schema browser. */
interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
}

/** Props for SchemaBrowser. */
interface SchemaBrowserProps {
  tables: TableInfo[];
  onClose: () => void;
  sourceName: string;
}

/** Tree view for browsing a data source's schema (tables and columns). */
export function SchemaBrowser({ tables, onClose, sourceName }: SchemaBrowserProps) {
  const t = useTranslations('dataSources');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleTable(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {t('schemaOf', { name: sourceName })}
        </h3>
        <button
          onClick={onClose}
          className="rounded px-3 py-1 text-xs"
          style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
        >
          {t('close')}
        </button>
      </div>

      {tables.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          {t('noTables')}
        </p>
      ) : (
        <div className="space-y-1">
          {tables.map((table) => (
            <div key={`${table.schema}.${table.name}`}>
              <button
                onClick={() => toggleTable(table.name)}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-left transition-colors"
                style={{ color: 'var(--color-foreground)' }}
              >
                <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  {expanded.has(table.name) ? '▼' : '▶'}
                </span>
                <span className="font-medium">{table.name}</span>
                <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  ({table.columns.length} {t('columns')})
                </span>
              </button>

              {expanded.has(table.name) && (
                <div className="ml-8 space-y-0.5 pb-2">
                  {table.columns.map((col) => (
                    <div
                      key={col.name}
                      className="flex items-center gap-2 rounded px-2 py-1 text-xs"
                    >
                      <span style={{ color: 'var(--color-foreground)' }}>
                        {col.primaryKey ? '🔑 ' : ''}{col.name}
                      </span>
                      <span style={{ color: 'var(--color-muted-foreground)' }}>
                        {col.type}
                      </span>
                      {col.nullable && (
                        <span style={{ color: 'var(--color-muted-foreground)', opacity: 0.6 }}>
                          nullable
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
