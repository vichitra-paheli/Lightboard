'use client';

import { useTranslations } from 'next-intl';
import type { ControlSpec } from '@lightboard/viz-core';

/** Props for DropdownControl. */
interface DropdownControlProps {
  spec: ControlSpec;
  value: string;
  onChange: (value: string) => void;
}

/** Dropdown control for selecting a single value. */
export function DropdownControl({ spec, value, onChange }: DropdownControlProps) {
  const t = useTranslations('controls');
  const options = spec.options ?? [];

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--color-muted-foreground)' }}>
        {spec.label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md px-2 text-sm"
        style={{
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--color-input)',
          backgroundColor: 'transparent',
          color: 'var(--color-foreground)',
        }}
      >
        <option value="">{t('selectPlaceholder')}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
