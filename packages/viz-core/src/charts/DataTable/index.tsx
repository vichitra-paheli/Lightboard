import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { PanelPlugin, PanelProps } from '../../panel/types';

/** Configuration for DataTable. */
export interface DataTableConfig {
  columns?: { field: string; header?: string; width?: number }[];
  pageSize?: number;
  sortable?: boolean;
}

/** DataTable component — sortable, paginated tabular data. */
export function DataTable({
  data,
  config,
  width,
  height,
  theme,
  onInteraction,
}: PanelProps<Record<string, unknown>[], DataTableConfig>) {
  const { columns: configColumns, pageSize = 20, sortable = true } = config;
  const [sorting, setSorting] = useState<SortingState>([]);

  const columnHelper = createColumnHelper<Record<string, unknown>>();

  const columns = useMemo(() => {
    if (configColumns && configColumns.length > 0) {
      return configColumns.map((col) =>
        columnHelper.accessor((row) => row[col.field], {
          id: col.field,
          header: col.header ?? col.field,
          size: col.width,
          cell: (info) => formatCellValue(info.getValue()),
        }),
      );
    }
    // Auto-detect columns from first row
    const firstRow = data[0];
    if (!firstRow) return [];
    return Object.keys(firstRow).map((key) =>
      columnHelper.accessor((row) => row[key], {
        id: key,
        header: key,
        cell: (info) => formatCellValue(info.getValue()),
      }),
    );
  }, [configColumns, data, columnHelper]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: sortable ? setSorting : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  return (
    <div
      style={{
        width,
        height,
        overflow: 'auto',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize.label,
        color: theme.colors.text,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    borderBottom: `1px solid ${theme.colors.grid}`,
                    cursor: sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' && ' ↑'}
                  {header.column.getIsSorted() === 'desc' && ' ↓'}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() =>
                onInteraction?.({ type: 'click', payload: { row: row.original, index: row.index } })
              }
              style={{ cursor: onInteraction ? 'pointer' : 'default' }}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{
                    padding: '6px 12px',
                    borderBottom: `1px solid ${theme.colors.grid}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {table.getPageCount() > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 8 }}>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            style={{ opacity: table.getCanPreviousPage() ? 1 : 0.5 }}
          >
            ←
          </button>
          <span>
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            style={{ opacity: table.getCanNextPage() ? 1 : 0.5 }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

/** Formats a cell value for display. */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'number') return new Intl.NumberFormat().format(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** DataTable panel plugin registration. */
export const dataTablePlugin: PanelPlugin<Record<string, unknown>[], DataTableConfig> = {
  id: 'data-table',
  name: 'Data Table',
  configSchema: {
    type: 'object',
    properties: {
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: { field: { type: 'string' }, header: { type: 'string' }, width: { type: 'number' } },
        },
      },
      pageSize: { type: 'number' },
      sortable: { type: 'boolean' },
    },
  },
  dataShape: {
    minColumns: 1,
    description: 'Any tabular data — the fallback visualization',
  },
  Component: DataTable as any,
};
