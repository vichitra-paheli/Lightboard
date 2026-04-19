'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/** Tab identifiers for the datasource detail page. */
export type DetailTabId = 'schema' | 'connection' | 'access';

/** Props for {@link DetailTabs}. */
export interface DetailTabsProps {
  tab: DetailTabId;
  setTab: (tab: DetailTabId) => void;
}

/**
 * Underline-style tab bar — amber accent under the active tab, ink tone
 * change on hover for the inactives. Mirrors the handoff `DetailTabs`.
 */
export function DetailTabs({ tab, setTab }: DetailTabsProps) {
  const t = useTranslations('settings.dataSources.detail.tabs');
  const tabs: { id: DetailTabId; label: string }[] = [
    { id: 'schema', label: t('schema') },
    { id: 'connection', label: t('connection') },
    { id: 'access', label: t('access') },
  ];
  return (
    <div className="flex gap-1 border-b border-[var(--line-1)]" role="tablist">
      {tabs.map(({ id, label }) => {
        const active = id === tab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setTab(id)}
            className={cn(
              'relative px-3.5 py-2.5 text-[13px] transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-t',
              active
                ? 'text-[var(--ink-1)] font-medium'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
            )}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute bottom-[-1px] left-3.5 right-3.5 h-[2px] bg-[var(--accent-warm)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
