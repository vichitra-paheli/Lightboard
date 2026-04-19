'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { PROVIDERS, type ProviderEntry } from './provider-catalog';

/** Props for {@link ProviderTileGrid}. */
export interface ProviderTileGridProps {
  value: string;
  onChange: (id: string) => void;
}

/**
 * 4-column tile grid for picking a provider. Matches the handoff's
 * `ProviderTile` grid layout (`LLMs.jsx` lines 324–342).
 */
export function ProviderTileGrid({ value, onChange }: ProviderTileGridProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {PROVIDERS.map((p) => (
        <ProviderTile
          key={p.id}
          entry={p}
          selected={value === p.id}
          onClick={() => onChange(p.id)}
        />
      ))}
    </div>
  );
}

/** Single tile inside the grid. */
function ProviderTile({
  entry,
  selected,
  onClick,
}: {
  entry: ProviderEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useTranslations('settings.llms.drawer');
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2 rounded-[8px] border px-2.5 py-2.5 pb-3',
        'transition-colors duration-150 ease-[var(--ease-out-quint)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        selected
          ? 'border-[var(--accent-border)] bg-[var(--accent-bg)]'
          : 'border-[var(--line-1)] bg-[var(--bg-2)] hover:border-[var(--line-3)] hover:bg-[var(--bg-4)]',
      )}
    >
      <div className="relative flex h-6 w-6 items-center justify-center rounded-[5px] border border-[var(--line-3)] bg-[var(--bg-4)]">
        <span
          aria-hidden="true"
          className="absolute left-[2px] top-[2px] h-1 w-1 rounded-full"
          style={{ background: entry.dot }}
        />
        <span
          className="text-[8.5px] text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {entry.glyph}
        </span>
      </div>
      <span
        className={cn(
          'text-[11.5px] leading-[1.25]',
          selected ? 'text-[var(--ink-1)] font-medium' : 'text-[var(--ink-2)]',
        )}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {entry.label}
      </span>
      {!entry.implemented && (
        <span
          className="text-[9px] font-medium uppercase tracking-[0.1em] text-[var(--ink-5)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('soon')}
        </span>
      )}
    </button>
  );
}
