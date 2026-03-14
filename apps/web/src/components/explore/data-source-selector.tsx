'use client';

import { useTranslations } from 'next-intl';

/** A data source option. */
export interface DataSourceOption {
  id: string;
  name: string;
  type: string;
}

/** Props for DataSourceSelector. */
interface DataSourceSelectorProps {
  sources: DataSourceOption[];
  selectedId: string | null;
  onChange: (id: string) => void;
}

/** Dropdown to select the active data source. Cmd+K to focus. */
export function DataSourceSelector({ sources, selectedId, onChange }: DataSourceSelectorProps) {
  const t = useTranslations('explore');

  return (
    <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottomWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}>
      <label className="text-xs font-medium" style={{ color: 'var(--color-muted-foreground)' }}>
        {t('dataSource')}
      </label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md px-2 text-sm"
        style={{
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--color-input)',
          backgroundColor: 'transparent',
          color: 'var(--color-foreground)',
          minWidth: 200,
        }}
      >
        <option value="">{t('selectDataSource')}</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.type})
          </option>
        ))}
      </select>
    </div>
  );
}
