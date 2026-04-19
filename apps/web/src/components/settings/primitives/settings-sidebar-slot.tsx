'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** A single nav entry — internal type, only used inside this module. */
interface SettingsNavItem {
  /** Translation key under `settings.nav.*`. */
  key: string;
  /** Href for the item; items without an href render as disabled. */
  href?: string;
  /** When true, the item is dimmed with a "soon" pill per the handoff. */
  soon?: boolean;
}

/** Props for {@link SettingsSidebarSlot}. */
export interface SettingsSidebarSlotProps {
  /** Optional heading rendered above the groups (e.g. workspace name). */
  heading?: ReactNode;
}

/**
 * Grouped navigation rendered inside the app-shell sidebar while any
 * `/settings/*` route is active. The workspace group is the only one with
 * live links in this release — account + member items are placeholder
 * entries marked "soon" per the design bundle.
 */
export function SettingsSidebarSlot({ heading }: SettingsSidebarSlotProps) {
  const t = useTranslations('settings.nav');
  const pathname = usePathname();

  const workspace: SettingsNavItem[] = [
    { key: 'dataSources', href: '/settings/data-sources' },
    { key: 'llms', href: '/settings/llms' },
    { key: 'members', soon: true },
    { key: 'general', soon: true },
  ];
  const account: SettingsNavItem[] = [
    { key: 'profile', soon: true },
    { key: 'appearance', soon: true },
    { key: 'keyboard', soon: true },
  ];

  return (
    <nav
      aria-label="Settings navigation"
      className="flex h-full flex-col gap-5 pt-1"
    >
      {heading && (
        <div
          className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {heading}
        </div>
      )}
      <NavGroup label={t('workspace')}>
        {workspace.map((item) => (
          <NavRow key={item.key} item={item} label={t(item.key)} soonLabel={t('soon')} pathname={pathname} />
        ))}
      </NavGroup>
      <NavGroup label={t('account')}>
        {account.map((item) => (
          <NavRow key={item.key} item={item} label={t(item.key)} soonLabel={t('soon')} pathname={pathname} />
        ))}
      </NavGroup>
    </nav>
  );
}

/** Group header + child rows. */
function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className="mb-1.5 px-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--ink-5)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/** Single nav row — amber accent bar + bold ink for the active item. */
function NavRow({
  item,
  label,
  soonLabel,
  pathname,
}: {
  item: SettingsNavItem;
  label: string;
  soonLabel: string;
  pathname: string;
}) {
  const active = !!item.href && pathname.startsWith(item.href);
  const Content = (
    <span
      className={cn(
        'relative flex items-center justify-between gap-2 px-3 py-2 rounded-md text-[13px]',
        'transition-colors duration-150 ease-[var(--ease-out-quint)]',
        active
          ? 'text-[var(--ink-1)] bg-[var(--bg-6)]'
          : item.soon
            ? 'text-[var(--ink-5)] cursor-not-allowed'
            : 'text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:bg-[var(--bg-6)]',
      )}
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-[var(--accent-warm)]"
        />
      )}
      <span className="truncate">{label}</span>
      {item.soon && (
        <span
          className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-[var(--ink-5)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {soonLabel}
        </span>
      )}
    </span>
  );

  if (!item.href) {
    return (
      <span aria-disabled="true" className="block">
        {Content}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-md"
    >
      {Content}
    </Link>
  );
}
