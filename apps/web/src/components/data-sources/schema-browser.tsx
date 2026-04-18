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
  loading?: boolean;
}

/** Tree view for browsing a data source's schema (tables and columns). */
export function SchemaBrowser({ tables, onClose, sourceName, loading }: SchemaBrowserProps) {
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
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          {t('schemaOf', { name: sourceName })}
        </h3>
        <button
          onClick={onClose}
          className="rounded border border-border px-3 py-1 text-xs text-muted-foreground"
        >
          {t('close')}
        </button>
      </div>

      {loading ? (
        <p className="animate-pulse text-sm text-muted-foreground">
          Loading schema...
        </p>
      ) : tables.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('noTables')}
        </p>
      ) : (
        <div className="space-y-1">
          {tables.map((table) => (
            <div key={`${table.schema}.${table.name}`}>
              <button
                onClick={() => toggleTable(table.name)}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-foreground transition-colors"
              >
                <span className="text-xs text-muted-foreground">
                  {expanded.has(table.name) ? '▼' : '▶'}
                </span>
                <span className="font-medium">{table.name}</span>
                <span className="text-xs text-muted-foreground">
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
                      <span className="text-foreground">
                        {col.primaryKey ? '🔑 ' : ''}{col.name}
                      </span>
                      <span className="text-muted-foreground">
                        {col.type}
                      </span>
                      {col.nullable && (
                        <span className="text-muted-foreground opacity-60">
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
